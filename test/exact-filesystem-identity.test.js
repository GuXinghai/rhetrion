import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createSupplementalSourcePlan } from "../src/export/index.js";
import { createHash } from "node:crypto";
import { exactFilesystemStats } from "../src/platform/exact-filesystem-stats.js";
import { createLocalExportSourcePorts } from "../src/platform/index.js";
import { createCodexCollectorWorkspaceContext } from "../src/application/export-sources/codex-collector-workspace.js";
import { createCodexCollectorExportContext } from "../src/application/export-sources/codex-collector-export.js";
import { createExportResourceGuard } from "../src/export-resource-policy.js";

function stats(inode) {
  return { dev: 44n, ino: BigInt(inode), size: 0n, mode: 0o100600n, uid: 0n, gid: 0n, nlink: 1n,
    birthtimeMs: 1000n, mtimeMs: 1000n, ctimeMs: 1000n,
    isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false,
    isBlockDevice: () => false, isCharacterDevice: () => false, isFIFO: () => false, isSocket: () => false };
}
function context(initial, device = "44") {
  let inode = initial;
  let sourceCalls = 0;
  // Native U128 identities are already exact strings; the Node stat helper
  // intentionally remains U64-only and is tested separately below.
  const read = () => { sourceCalls++; return { ...exactFilesystemStats(stats("0")), dev: device, ino: inode }; };
  const owner = createCodexCollectorExportContext({ ...createLocalExportSourcePorts(), currentUid: () => null,
    createExportResourceGuard, exactSourceLstat: async () => read(), exactSourceOpen: async () => ({
      stat: async () => read(), close: async () => {}, read: async () => ({ bytesRead: 0 }),
    }),
  });
  return { owner, replace: value => { inode = value; }, replaceDevice: value => { device = value; },
    get sourceCalls() { return sourceCalls; } };
}
const bounds = { collectorPath: "synthetic-ledger.jsonl", startAt: "2026-10-01T00:00:00.000Z", endAt: "2026-10-01T00:01:00.000Z" };
function digest(plan) {
  const material = Object.fromEntries(["schemaVersion", "startAt", "endAt", "path", "device", "inode", "birthtimeMs", "prefixBytes", "prefixLines", "prefixSha256"].map(key => [key, plan[key]]));
  return createHash("sha256").update("app-usagemonitor/codex-collector-source-plan/v0.3\0").update(JSON.stringify(material)).digest("hex");
}
test("exact source plans distinguish adjacent IDs above Number precision", async () => {
  const { owner, replace } = context("9007199254740992");
  const plan = await owner.createCodexCollectorExportSourcePlan(bounds);
  assert.equal(plan.inode, "9007199254740992");
  assert.equal(plan.device, "44");
  assert.equal(plan.schemaVersion, "codex-collector-export-source-plan-v0.3");
  await owner.verifyCodexCollectorExportSourcePlan(plan);
  replace("9007199254740993");
  await assert.rejects(owner.verifyCodexCollectorExportSourcePlan(plan), error => error.code === "codex_collector_export_source_changed");
});
test("current collector plans restore their exact U128 identity and original digest", async () => {
  const { owner } = context("18446744073709551617");
  const fresh = await owner.createCodexCollectorExportSourcePlan(bounds);
  const bytes = JSON.stringify(fresh);
  owner.createCodexCollectorExportCursor(fresh);
  const workspaceOwner = createCodexCollectorWorkspaceContext({ codexCollectorExport: owner,
    createHash, resolvePath: resolve, bufferByteLength: Buffer.byteLength });
  const supplemental = workspaceOwner.appendCodexCollectorWorkspaceSource(createSupplementalSourcePlan(), fresh);
  const recovered = await workspaceOwner.resolveCodexCollectorWorkspaceSource({
    collectorPath: fresh.path, resourceGuard: createExportResourceGuard(),
    workspace: { getDescriptor: () => ({ coveredAt: { startAt: fresh.startAt, endAt: fresh.endAt } }), loadSupplementalSourcePlan: () => supplemental },
  });
  assert.deepEqual(recovered.collectorPlan, fresh);
  assert.equal(JSON.stringify(fresh), bytes);
});

test("adjacent U128 IDs and both field maxima stay distinct without Number conversion", async () => {
  for (const first of ["18446744073709551616", "340282366920938463463374607431768211454"]) {
    const { owner, replace } = context(first, "18446744073709551615");
    const plan = await owner.createCodexCollectorExportSourcePlan(bounds);
    await owner.verifyCodexCollectorExportSourcePlan(plan);
    replace((BigInt(first) + 1n).toString(10));
    const next = await owner.createCodexCollectorExportSourcePlan(bounds);
    assert.notEqual(plan.sourcePlanSha256, next.sourcePlanSha256);
    await assert.rejects(owner.verifyCodexCollectorExportSourcePlan(plan), { code: "codex_collector_export_source_changed" });
    await owner.verifyCodexCollectorExportSourcePlan(next);
  }
  const value = context("42", "9007199254740992");
  const first = await value.owner.createCodexCollectorExportSourcePlan(bounds);
  value.replaceDevice("9007199254740993");
  const second = await value.owner.createCodexCollectorExportSourcePlan(bounds);
  assert.notEqual(first.sourcePlanSha256, second.sourcePlanSha256);
  await assert.rejects(value.owner.verifyCodexCollectorExportSourcePlan(first), { code: "codex_collector_export_source_changed" });
  await value.owner.verifyCodexCollectorExportSourcePlan(second);
});

test("old, future, numeric and malformed collector identities refuse before source access", async () => {
  const value = context("42");
  const fresh = await value.owner.createCodexCollectorExportSourcePlan(bounds);
  const before = value.sourceCalls;
  const invalids = [
    ...["v0.1", "v0.2", "v0.4"].map(version => ({ ...fresh, schemaVersion: `codex-collector-export-source-plan-${version}` })),
    ...[42, 9007199254740992, "0042", "-1", "0x2a", "", "340282366920938463463374607431768211456"].map(inode => ({ ...fresh, inode })),
    ...[44, "18446744073709551616", "044", "-1"].map(device => ({ ...fresh, device })),
  ];
  for (const invalid of invalids) {
    invalid.sourcePlanSha256 = digest(invalid);
    await assert.rejects(value.owner.verifyCodexCollectorExportSourcePlan(invalid), { code: "codex_collector_export_plan_invalid" });
    assert.throws(() => value.owner.createCodexCollectorExportCursor(invalid), { code: "codex_collector_export_plan_invalid" });
  }
  assert.equal(value.sourceCalls, before);
});

test("exact stat conversion refuses unsafe Number identities before serialization", () => {
  for (const value of [9007199254740992, -1n, 18446744073709551616n]) {
    const input = stats("42"); input.ino = value;
    assert.throws(() => exactFilesystemStats(input), /filesystem_identity_unavailable/);
  }
});

test("BigInt identity reads preserve Node Stats millisecond timestamps and boundary fractions", async () => {
  const root = await mkdtemp(join(tmpdir(), "exact-stats-time-"));
  try {
    const path = join(root, "synthetic.txt"); await writeFile(path, "synthetic", { mode: 0o600 });
    const ordinary = await stat(path); const precise = exactFilesystemStats(await stat(path, { bigint: true }));
    for (const key of ["birthtimeMs", "mtimeMs", "ctimeMs"]) assert.equal(precise[key], ordinary[key]);
    for (const nanoseconds of [1799999999999999873n, 1800000000000000127n, 900719925499999999n]) {
      const input = stats("42"); input.birthtimeNs = nanoseconds; input.birthtimeMs = nanoseconds / 1000000n;
      const milliseconds = Number(nanoseconds / 1000000000n) * 1000 + Number(nanoseconds % 1000000000n) / 1e6;
      assert.equal(exactFilesystemStats(input).birthtimeMs, milliseconds);
      assert.equal(Math.trunc(exactFilesystemStats(input).birthtimeMs), Math.trunc(milliseconds));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
