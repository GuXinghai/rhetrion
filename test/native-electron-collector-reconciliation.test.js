import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertWindowsOwnerOnly, createProtectedFixtureDirectory, grantSyntheticEveryoneRead,
  writeInitialProtectedFixtureFile } from "./helpers/windows-owner-only-fixture.js";
import { loadWindowsReleaseOperationBinding } from "../src/platform/index.js";

import {
  commitLocalCollectorState,
  openLocalCollectorStateSession,
  readLocalCollectorState,
} from "../src/local-collector-state.js";
import {
  parseNativeElectronCollectorReconciliationArguments,
  planNativeElectronCollectorReconciliation,
  reconcileNativeElectronCollectorPrivateCopy,
} from "../scripts/reconcile-native-electron-collector-observations.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function checkpoint(marker) {
  return {
    schemaVersion: "0.3",
    collectionStartedAt: "2026-09-08T00:00:00.000Z",
    files: {},
    recentEventKeys: [],
    lastQuotaObservedAt: null,
    accountScopeMarker: marker,
    diagnostics: {},
    indexing: {
      mode: "recent_7d", status: "recent_7d_indexing", phase: "discovering",
      boundedBy: "modified_at_and_collection_start", filesDiscovered: 0,
      filesSelected: 0, filesProcessed: 0, recordsWritten: 0,
      coveredAt: { startAt: "2026-09-08T00:00:00.000Z", endAt: null },
    },
  };
}

function record(eventKey) {
  return {
    schemaVersion: "0.3",
    kind: "codex_quota_snapshot",
    observedAt: "2026-09-08T00:01:00.000Z",
    eventKey,
    quota: { synthetic: true },
  };
}

async function fixture(run, { sourceRecords = null } = {}) {
  const root = await mkdtemp(join(tmpdir(), "native-electron-collector-reconcile-"));
  const copyRoot = join(root, "private-copies");
  const native = join(copyRoot, "native-local-collector-state-v1.sqlite");
  const electron = join(copyRoot, "electron-local-collector-state-v1.sqlite");
  const baseline = join(copyRoot, "electron-local-collector-state-before-reconcile.sqlite");
  const proof = join(copyRoot, "collector-conservation.json");
  try {
    createProtectedFixtureDirectory(copyRoot);
    const shared = record("synthetic-shared");
    const duplicate = record("synthetic-duplicate");
    const nativeOnly = record("synthetic-native-only");
    const destinationCheckpoint = checkpoint("electron");
    await commitLocalCollectorState({
      stateFile: native,
      checkpoint: checkpoint("native"),
      records: sourceRecords ?? [shared, duplicate, duplicate, nativeOnly],
    });
    await commitLocalCollectorState({
      stateFile: electron,
      checkpoint: destinationCheckpoint,
      records: [shared, duplicate],
    });
    writeInitialProtectedFixtureFile(baseline, await readFile(electron));
    writeInitialProtectedFixtureFile(proof, `${JSON.stringify({
      schema: "usagemonitor-native-electron-collector-conservation-r9-v1",
      inspection: "read-only",
      scope: "stopped-native-r9-versus-current-electron",
      saltMatches: true,
      nativeRows: sourceRecords?.length ?? 4,
      electronRows: 2,
    })}\n`);
    return await run({ root, copyRoot, native, electron, baseline, proof, destinationCheckpoint });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("private-copy plan is content-free and finds digest-plus-kind multiplicity", async () => fixture(async ({ copyRoot, native, electron }) => {
  const beforeNative = sha256(await readFile(native));
  const beforeElectron = sha256(await readFile(electron));
  const filesBefore = await readdir(copyRoot);
  const result = await planNativeElectronCollectorReconciliation({ copyRoot });
  assert.deepEqual(result, {
    schema: "usagemonitor-native-electron-collector-reconciliation-v1",
    status: "planned_private_copy_only",
    sourceRecordCount: 4,
    destinationRecordCountBefore: 2,
    missingSourceRecordMultiplicity: 2,
    identitySaltProven: true,
    destinationCheckpointPreserved: null,
    destinationMetadataPreserved: null,
    destinationExistingRecordsPreserved: null,
    insertedRecordMultiplicity: 0,
    destinationRecordCountAfter: 2,
  });
  assert.equal(sha256(await readFile(native)), beforeNative);
  assert.equal(sha256(await readFile(electron)), beforeElectron);
  assert.deepEqual(await readdir(copyRoot), filesBefore, "read-only planning creates no journal or receipt");
  assert.equal(JSON.stringify(result).includes("synthetic-native-only"), false);
}));

test("explicit private-copy reconciliation is append-only, checkpoint-preserving and idempotent", async () => fixture(async ({ root, copyRoot, native, electron, baseline, destinationCheckpoint }) => {
  const baselineHash = sha256(await readFile(baseline));
  const sourceHash = sha256(await readFile(native));
  const result = await reconcileNativeElectronCollectorPrivateCopy({
    copyRoot,
    confirmAppendOnlyPrivateCopy: true,
  });
  assert.equal(result.status, "reconciled_private_copy");
  assert.equal(result.insertedRecordMultiplicity, 2);
  assert.equal(result.destinationRecordCountAfter, 4);
  assert.equal(result.destinationCheckpointPreserved, true);
  assert.equal(result.destinationMetadataPreserved, true);
  assert.equal(result.destinationExistingRecordsPreserved, true);
  assert.equal(sha256(await readFile(native)), sourceHash);
  assert.equal(sha256(await readFile(baseline)), baselineHash);
  assert.deepEqual((await readLocalCollectorState({ stateFile: electron, includeRecords: false })).checkpoint, destinationCheckpoint);
  const receipt = JSON.parse(await readFile(join(copyRoot, "collector-reconciliation-receipt-v1.json"), "utf8"));
  assert.equal(receipt.status, "verified");
  assert.equal(JSON.stringify(receipt).includes("synthetic-native-only"), false);
  assertWindowsOwnerOnly(join(copyRoot, "collector-reconciliation-receipt-v1.json"));
  for (const name of ["operation.json", "mutex.sqlite", "mutex.sqlite-journal"]) assertWindowsOwnerOnly(join(copyRoot, name));
  const beforeRepeat = sha256(await readFile(electron));
  assert.deepEqual(await reconcileNativeElectronCollectorPrivateCopy({ copyRoot, confirmAppendOnlyPrivateCopy: true,
    openStateSession() { assert.fail("completed same-copy retry must not open an append session"); } }), result);
  assert.equal(sha256(await readFile(electron)), beforeRepeat);
  if (process.platform !== "win32") assert.equal((await stat(join(copyRoot, "collector-reconciliation-receipt-v1.json"))).mode & 0o777, 0o600);

  const cloneRoot = join(root, "private-copies-idempotent");
  createProtectedFixtureDirectory(cloneRoot);
  for (const [source, target] of [
    ["native-local-collector-state-v1.sqlite", "native-local-collector-state-v1.sqlite"],
    ["electron-local-collector-state-v1.sqlite", "electron-local-collector-state-v1.sqlite"],
    ["electron-local-collector-state-v1.sqlite", "electron-local-collector-state-before-reconcile.sqlite"],
  ]) writeInitialProtectedFixtureFile(join(cloneRoot, target), await readFile(join(copyRoot, source)));
  writeInitialProtectedFixtureFile(join(cloneRoot, "collector-conservation.json"), `${JSON.stringify({
    schema: "usagemonitor-native-electron-collector-conservation-r9-v1",
    inspection: "read-only",
    scope: "stopped-native-r9-versus-current-electron",
    saltMatches: true,
    nativeRows: 4,
    electronRows: 4,
  })}\n`);
  const second = await reconcileNativeElectronCollectorPrivateCopy({
    copyRoot: cloneRoot,
    confirmAppendOnlyPrivateCopy: true,
  });
  assert.equal(second.insertedRecordMultiplicity, 0);
  assert.equal(second.missingSourceRecordMultiplicity, 0);
  assert.equal(second.destinationRecordCountAfter, 4);
}));

test("copy-root, baseline, proof and apply confirmation fail before a destination write", async () => fixture(async ({ copyRoot, electron, proof }) => {
  const before = sha256(await readFile(electron));
  await assert.rejects(
    () => reconcileNativeElectronCollectorPrivateCopy({ copyRoot }),
    { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONFIRMATION_REQUIRED" },
  );
  assert.equal(sha256(await readFile(electron)), before);
  await writeFile(proof, `${JSON.stringify({ schema: "usagemonitor-native-electron-collector-conservation-r9-v1", inspection: "read-only", scope: "stopped-native-r9-versus-current-electron", saltMatches: false, nativeRows: 4, electronRows: 2 })}\n`, { mode: 0o600 });
  await assert.rejects(
    () => planNativeElectronCollectorReconciliation({ copyRoot }),
    { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_PROOF_INVALID" },
  );
  assert.equal(sha256(await readFile(electron)), before);
  await unlink(join(copyRoot, "native-local-collector-state-v1.sqlite"));
  await assert.rejects(
    () => planNativeElectronCollectorReconciliation({ copyRoot }),
    { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_UNAVAILABLE" },
  );
  assert.equal(sha256(await readFile(electron)), before);
}));

test("argument parser refuses a write flag without its explicit private-copy confirmation", () => {
  assert.throws(
    () => parseNativeElectronCollectorReconciliationArguments(["--copy-root", "/private/copies", "--apply-to-private-copy"]),
    { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONFIRMATION_REQUIRED" },
  );
  assert.deepEqual(
    parseNativeElectronCollectorReconciliationArguments(["--copy-root", "/private/copies"]),
    { copyRoot: "/private/copies", conservationProof: null, apply: false, confirm: false },
  );
});

const RECEIPT = "collector-reconciliation-receipt-v1.json";
const apply = (copyRoot, extra = {}) => reconcileNativeElectronCollectorPrivateCopy({
  copyRoot, confirmAppendOnlyPrivateCopy: true, ...extra,
});
const interrupted = () => Object.assign(new Error("Synthetic interrupted operation"), { code: "SYNTHETIC_INTERRUPTION" });

async function stopAfterCommit(copyRoot, afterBatch = 1) {
  let batches = 0;
  await assert.rejects(apply(copyRoot, {
    async openStateSession(options) {
      const session = await openLocalCollectorStateSession(options);
      return { close: () => session.close(), commit(batch) {
        const result = session.commit(batch);
        if (++batches === afterBatch) throw interrupted();
        return result;
      } };
    },
  }), { code: "SYNTHETIC_INTERRUPTION" });
}

test("same-copy recovery verifies a committed append without replaying its session", async () => fixture(async ({ copyRoot, electron }) => {
  await stopAfterCommit(copyRoot);
  assert.equal((JSON.parse(await readFile(join(copyRoot, RECEIPT), "utf8"))).status, "preflight_passed");
  const before = sha256(await readFile(electron));
  const result = await apply(copyRoot, { openStateSession() { assert.fail("append is already committed"); } });
  assert.equal(result.insertedRecordMultiplicity, 2);
  assert.equal(result.destinationRecordCountAfter, 4);
  assert.equal(sha256(await readFile(electron)), before);
}));

test("same-copy partial-batch recovery appends only missing multiplicities", async () => {
  const records = Array.from({ length: 603 }, (_, i) => record(`synthetic-partial-${i}`));
  await fixture(async ({ copyRoot, electron }) => {
    await stopAfterCommit(copyRoot);
    const partial = await readLocalCollectorState({ stateFile: electron, includeRecords: true });
    assert.equal(partial.records.length, 258);
    let inserted = 0;
    const result = await apply(copyRoot, { async openStateSession(options) {
      const session = await openLocalCollectorStateSession(options);
      return { close: () => session.close(), commit(batch) {
        const result = session.commit(batch); inserted += result.inserted; return result;
      } };
    } });
    assert.equal(inserted, 347);
    assert.equal(result.insertedRecordMultiplicity, 603);
    assert.equal(result.destinationRecordCountAfter, 605);
    const settled = await readLocalCollectorState({ stateFile: electron, includeRecords: true });
    assert.equal(settled.records.length, 605);
    assert.deepEqual(await apply(copyRoot), result);
  }, { sourceRecords: records });
});

function holdReceiptReader(path, milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(8));
  const worker = new Worker(`
    const { workerData } = require('node:worker_threads');
    const { openSync, closeSync } = require('node:fs');
    const signal = new Int32Array(workerData.signal);
    const fd = openSync(workerData.path, 'r');
    Atomics.store(signal, 0, 1); Atomics.notify(signal, 0);
    try { Atomics.wait(signal, 1, 0, workerData.milliseconds); }
    finally { closeSync(fd); Atomics.store(signal, 0, 2); Atomics.notify(signal, 0); }
  `, { eval: true, workerData: { path, milliseconds, signal: signal.buffer } });
  const exited = once(worker, "exit");
  if (Atomics.load(signal, 0) === 0) Atomics.wait(signal, 0, 0, 5_000);
  assert.equal(Atomics.load(signal, 0), 1, "synthetic reader became ready");
  return { signal, async close() { Atomics.store(signal, 1, 1); Atomics.notify(signal, 1); await exited; } };
}

test("native receipt replacement retries a transient actual target reader", async t => fixture(async ({ copyRoot }) => {
  const native = loadWindowsReleaseOperationBinding();
  const replace = native.replaceProtectedChild;
  let reader, calls = 0;
  const mock = t.mock.method(native, "replaceProtectedChild", (...args) => {
    if (args[2] === RECEIPT) {
      calls++; reader = holdReceiptReader(join(copyRoot, RECEIPT), 90);
    }
    return replace(...args);
  });
  try {
    assert.equal((await apply(copyRoot)).status, "reconciled_private_copy");
    assert.equal(calls, 1, "retry remains inside native publication");
    assert.equal(Atomics.load(reader.signal, 0), 2);
    assert.equal((await readdir(copyRoot)).includes(`${RECEIPT}.pending`), false);
  } finally { mock.mock.restore(); await reader?.close(); }
}));

test("persistent actual target reader preserves receipt and pending then resumes without append", async t => fixture(async ({ copyRoot, electron }) => {
  const native = loadWindowsReleaseOperationBinding(), replace = native.replaceProtectedChild;
  let reader;
  const mock = t.mock.method(native, "replaceProtectedChild", (...args) => {
    if (args[2] === RECEIPT) reader = holdReceiptReader(join(copyRoot, RECEIPT), 10_000);
    return replace(...args);
  });
  try {
    const start = performance.now();
    await assert.rejects(apply(copyRoot), { code: "WINDOWS_FILESYSTEM_ACCESS_DENIED" });
    assert.ok(performance.now() - start < 5_000, "persistent refusal has a finite bound");
    assert.equal(JSON.parse(await readFile(join(copyRoot, RECEIPT), "utf8")).status, "preflight_passed");
    assert.equal(JSON.parse(await readFile(join(copyRoot, `${RECEIPT}.pending`), "utf8")).status, "verified");
    assertWindowsOwnerOnly(join(copyRoot, `${RECEIPT}.pending`));
  } finally { mock.mock.restore(); await reader?.close(); }
  const before = sha256(await readFile(electron));
  const result = await apply(copyRoot, { openStateSession() { assert.fail("must not replay committed append"); } });
  assert.equal(result.destinationRecordCountAfter, 4);
  assert.equal(sha256(await readFile(electron)), before);
  assert.equal((await readdir(copyRoot)).includes(`${RECEIPT}.pending`), false);
}));

test("uncertain replacement readback recovers the actual published result", async t => fixture(async ({ copyRoot }) => {
  const native = loadWindowsReleaseOperationBinding(), replace = native.replaceProtectedChild;
  const mock = t.mock.method(native, "replaceProtectedChild", (...args) => {
    const result = replace(...args);
    if (args[2] === RECEIPT) throw interrupted();
    return result;
  });
  try { await assert.rejects(apply(copyRoot), { code: "SYNTHETIC_INTERRUPTION" }); }
  finally { mock.mock.restore(); }
  assert.equal(JSON.parse(await readFile(join(copyRoot, RECEIPT), "utf8")).status, "verified");
  const result = await apply(copyRoot, { openStateSession() { assert.fail("must not replay uncertain publication"); } });
  assert.equal(result.destinationRecordCountAfter, 4);
  assert.equal((await readdir(copyRoot)).includes(`${RECEIPT}.pending`), false);
}));

test("source bytes changing at the same record count refuse recovery before append", async () => fixture(async ({ copyRoot, native, electron }) => {
  await stopAfterCommit(copyRoot);
  const database = new DatabaseSync(native);
  try { database.exec("UPDATE records SET record_json = json_set(record_json, '$.quota.synthetic', 2)"); }
  finally { database.close(); }
  const before = sha256(await readFile(electron));
  await assert.rejects(apply(copyRoot), { code: "RELEASE_OPERATION_INPUT_MISMATCH" });
  assert.equal(sha256(await readFile(electron)), before);
}));

test("changed proofs cannot resume another operation", async () => fixture(async ({ copyRoot, proof, electron }) => {
  await stopAfterCommit(copyRoot);
  const before = sha256(await readFile(electron));
  const value = JSON.parse(await readFile(proof, "utf8"));
  await writeFile(proof, `${JSON.stringify({ ...value, syntheticProofRevision: 2 })}\n`);
  await assert.rejects(apply(copyRoot), { code: "RELEASE_OPERATION_INPUT_MISMATCH" });
  assert.equal(sha256(await readFile(electron)), before);
}));

test("changed baseline bytes cannot resume another operation", async () => fixture(async ({ copyRoot, baseline, electron }) => {
  await stopAfterCommit(copyRoot);
  const database = new DatabaseSync(baseline);
  try { database.exec("UPDATE records SET record_json = json_set(record_json, '$.quota.synthetic', 2)"); }
  finally { database.close(); }
  const before = sha256(await readFile(electron));
  await assert.rejects(apply(copyRoot), { code: "RELEASE_OPERATION_INPUT_MISMATCH" });
  assert.equal(sha256(await readFile(electron)), before);
}));

test("changed destination checkpoint refuses recovery before append", async () => fixture(async ({ copyRoot, electron, destinationCheckpoint }) => {
  await stopAfterCommit(copyRoot);
  await commitLocalCollectorState({ stateFile: electron, checkpoint: { ...destinationCheckpoint, syntheticChanged: true } });
  const before = sha256(await readFile(electron));
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_PROOF_MISMATCH" });
  assert.equal(sha256(await readFile(electron)), before);
}));

test("actual process death after commit releases mutex and resumes without duplicate append", async () => fixture(async ({ copyRoot, electron }) => {
  const moduleURL = new URL("../scripts/reconcile-native-electron-collector-observations.mjs", import.meta.url).href;
  const collectorURL = new URL("../src/local-collector-state.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { reconcileNativeElectronCollectorPrivateCopy as apply } from ${JSON.stringify(moduleURL)};
    import { openLocalCollectorStateSession } from ${JSON.stringify(collectorURL)};
    await apply({ copyRoot: process.argv[1], confirmAppendOnlyPrivateCopy: true,
      async openStateSession(options) {
        const session = await openLocalCollectorStateSession(options);
        return { close: () => session.close(), commit(batch) {
          session.commit(batch); process.exit(73);
        } };
      } });
  `, copyRoot], { encoding: "utf8", timeout: 15_000, windowsHide: true });
  assert.equal(child.status, 73, "synthetic child stopped after durable append");
  const before = sha256(await readFile(electron));
  const result = await apply(copyRoot, { openStateSession() { assert.fail("crash recovery must not replay committed append"); } });
  assert.equal(result.destinationRecordCountAfter, 4);
  assert.equal(sha256(await readFile(electron)), before);
}));

test("interruption before exclusive first receipt can resume from the existing operation journal", async t => fixture(async ({ copyRoot }) => {
  const native = loadWindowsReleaseOperationBinding(), create = native.createProtectedChild;
  const mock = t.mock.method(native, "createProtectedChild", (...args) => {
    if (args[2] === RECEIPT) throw interrupted();
    return create(...args);
  });
  try { await assert.rejects(apply(copyRoot), { code: "SYNTHETIC_INTERRUPTION" }); }
  finally { mock.mock.restore(); }
  assert.equal((await readdir(copyRoot)).includes(RECEIPT), false);
  const beforePlan = await readdir(copyRoot);
  await assert.rejects(planNativeElectronCollectorReconciliation({ copyRoot }), {
    code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_EXISTS",
  });
  assert.deepEqual(await readdir(copyRoot), beforePlan);
  assert.equal((await apply(copyRoot)).destinationRecordCountAfter, 4);
}));

test("exclusive first receipt publication never clobbers a concurrent receipt", async t => fixture(async ({ copyRoot, electron }) => {
  const native = loadWindowsReleaseOperationBinding(), create = native.createProtectedChild;
  const foreign = Buffer.from('{"synthetic":"foreign receipt"}\n');
  const mock = t.mock.method(native, "createProtectedChild", (...args) => {
    if (args[2] === RECEIPT) create(args[0], args[1], args[2], foreign);
    return create(...args);
  });
  const before = sha256(await readFile(electron));
  try { await assert.rejects(apply(copyRoot), { code: "WINDOWS_FILESYSTEM_ALREADY_EXISTS" }); }
  finally { mock.mock.restore(); }
  assert.deepEqual(await readFile(join(copyRoot, RECEIPT)), foreign);
  assert.equal(sha256(await readFile(electron)), before);
}));

test("unexpected pending evidence refuses recovery and remains preserved", async t => fixture(async ({ copyRoot, electron }) => {
  const native = loadWindowsReleaseOperationBinding(), replace = native.replaceProtectedChild;
  const mock = t.mock.method(native, "replaceProtectedChild", (...args) => {
    if (args[2] === RECEIPT) throw interrupted();
    return replace(...args);
  });
  try { await assert.rejects(apply(copyRoot), { code: "SYNTHETIC_INTERRUPTION" }); }
  finally { mock.mock.restore(); }
  const path = join(copyRoot, `${RECEIPT}.pending`), value = JSON.parse(await readFile(path));
  await writeFile(path, JSON.stringify({ ...value, insertedRecordMultiplicity: 3 }));
  const before = sha256(await readFile(electron)), pendingBefore = await readFile(path);
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE" });
  assert.equal(sha256(await readFile(electron)), before);
  assert.deepEqual(await readFile(path), pendingBefore);
}));

test("proof mutation during append refuses publication", async () => fixture(async ({ copyRoot, proof }) => {
  await assert.rejects(apply(copyRoot, { async openStateSession(options) {
    const session = await openLocalCollectorStateSession(options);
    return { commit: batch => session.commit(batch), async close() {
      await session.close();
      const value = JSON.parse(await readFile(proof));
      await writeFile(proof, JSON.stringify({ ...value, syntheticChange: true }));
    } };
  } }), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_CHANGED" });
  assert.equal(JSON.parse(await readFile(join(copyRoot, RECEIPT))).status, "preflight_passed");
}));

test("legacy receipt without a source-bound operation is preserved and refused", async () => fixture(async ({ copyRoot, electron }) => {
  const path = join(copyRoot, RECEIPT);
  writeInitialProtectedFixtureFile(path, '{"schema":"usagemonitor-native-electron-collector-reconciliation-v1","status":"preflight_passed"}\n');
  const before = sha256(await readFile(electron)), receiptBefore = await readFile(path);
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_EXISTS" });
  assert.deepEqual(await readFile(path), receiptBefore);
  assert.equal(sha256(await readFile(electron)), before);
  assert.equal((await readdir(copyRoot)).includes("operation.json"), false);
}));

test("the existing operation mutex excludes concurrent reconciliation", async () => fixture(async ({ copyRoot }) => {
  const result = await apply(copyRoot, { async openStateSession(options) {
    await assert.rejects(apply(copyRoot), { code: "RELEASE_OPERATION_BUSY" });
    return openLocalCollectorStateSession(options);
  } });
  assert.equal(result.destinationRecordCountAfter, 4);
}));

test("foreign destination rows refuse partial recovery before any further append", async () => fixture(async ({ copyRoot, electron, destinationCheckpoint }) => {
  await stopAfterCommit(copyRoot);
  await commitLocalCollectorState({ stateFile: electron, checkpoint: destinationCheckpoint, records: [record("synthetic-foreign")] });
  const before = sha256(await readFile(electron));
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONSERVATION_FAILED" });
  assert.equal(sha256(await readFile(electron)), before);
}));

test("unknown receipt fields, broad ACL and hardlinks refuse recovery", async () => fixture(async ({ copyRoot }) => {
  await stopAfterCommit(copyRoot);
  const path = join(copyRoot, RECEIPT), original = await readFile(path);
  await writeFile(path, JSON.stringify({ ...JSON.parse(original), unexpected: true }));
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE" });
  await writeFile(path, original);
  const alias = join(copyRoot, "synthetic-receipt-alias");
  await link(path, alias);
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE" });
  await unlink(alias);
  grantSyntheticEveryoneRead(path);
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE" });
}));

test("receipt identity substitution refuses publication and preserves the substituted evidence", async t => fixture(async ({ copyRoot }) => {
  const native = loadWindowsReleaseOperationBinding(), replace = native.replaceProtectedChild;
  let changed = false;
  const mock = t.mock.method(native, "replaceProtectedChild", (...args) => {
    if (args[2] === RECEIPT && !changed) {
      changed = true;
      const bytes = native.readProtectedChild(args[0], args[1], RECEIPT, 256 * 1024).data;
      native.deleteProtectedChild(args[0], args[1], RECEIPT, args[3]);
      native.createProtectedChild(args[0], args[1], RECEIPT, bytes);
    }
    return replace(...args);
  });
  try { await assert.rejects(apply(copyRoot), { code: "WINDOWS_FILESYSTEM_IDENTITY_MISMATCH" }); }
  finally { mock.mock.restore(); }
  assert.equal(changed, true);
  assert.equal(JSON.parse(await readFile(join(copyRoot, RECEIPT), "utf8")).status, "preflight_passed");
  assert.equal(JSON.parse(await readFile(join(copyRoot, `${RECEIPT}.pending`), "utf8")).status, "verified");
}));

test("missing receipt after append cannot authorize more writes", async () => fixture(async ({ copyRoot, electron }) => {
  await stopAfterCommit(copyRoot);
  await unlink(join(copyRoot, RECEIPT));
  const before = sha256(await readFile(electron));
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE" });
  assert.equal(sha256(await readFile(electron)), before);
  assert.equal((await readdir(copyRoot)).includes(RECEIPT), false);
}));

test("destination identity replacement refuses recovery", async () => fixture(async ({ copyRoot, electron }) => {
  await stopAfterCommit(copyRoot);
  const before = await readFile(electron);
  await unlink(electron);
  writeInitialProtectedFixtureFile(electron, before);
  await assert.rejects(apply(copyRoot), { code: "RELEASE_OPERATION_INPUT_MISMATCH" });
  assert.deepEqual(await readFile(electron), before);
}));

test("removed baseline records refuse recovery even when counts stay within the permitted range", async () => fixture(async ({ copyRoot, electron }) => {
  await stopAfterCommit(copyRoot);
  const database = new DatabaseSync(electron);
  try { database.exec("DELETE FROM records WHERE record_id = (SELECT min(record_id) FROM records)"); }
  finally { database.close(); }
  const before = sha256(await readFile(electron));
  await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONSERVATION_FAILED" });
  assert.equal(sha256(await readFile(electron)), before);
}));

test("unsafe root, source hardlink and unsafe proof refuse before destination mutation", async () => {
  await fixture(async ({ copyRoot, electron }) => {
    const before = sha256(await readFile(electron));
    grantSyntheticEveryoneRead(copyRoot);
    await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_UNSAFE" });
    assert.equal(sha256(await readFile(electron)), before);
  });
  await fixture(async ({ copyRoot, native, electron }) => {
    const before = sha256(await readFile(electron));
    await link(native, join(copyRoot, "synthetic-source-alias"));
    await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_UNSAFE" });
    assert.equal(sha256(await readFile(electron)), before);
  });
  await fixture(async ({ copyRoot, proof, electron }) => {
    const before = sha256(await readFile(electron));
    grantSyntheticEveryoneRead(proof);
    await assert.rejects(apply(copyRoot), { code: "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_PROOF_INVALID" });
    assert.equal(sha256(await readFile(electron)), before);
  });
});
