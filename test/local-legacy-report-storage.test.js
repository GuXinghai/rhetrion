import { sourceFixtureFile } from "./helpers/windows-source-fixture.js";
import { mkdtemp, mkdir, writeFile } from "./helpers/windows-source-fixture.js";
import assert from "node:assert/strict";
import { appendFileSync, closeSync, openSync, renameSync } from "node:fs";
import { link, readdir, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertWindowsOwnerOnly, grantSyntheticEveryoneRead } from "./helpers/windows-owner-only-fixture.js";
import { loadWindowsLegacyStateReadBinding } from "../src/platform/index.js";
import { runLocalLegacyReportMigration } from "../scripts/migrate-local-legacy-reports.mjs";
import {
  ensureLocalLegacyReportDirectory,
  inspectLocalLegacyReportMigration,
  localLegacyReportPath,
  migrateLocalLegacyReports,
  readLegacyReportPath,
  readLocalLegacyReport,
  writeLegacyReportPath,
  writeLocalLegacyReport,
  resolveLocalLegacyReportReadPath,
} from "../src/local-legacy-report-storage.js";

async function fixtureRoot() {
  return mkdtemp(join(tmpdir(), "usage-monitor-legacy-report-storage-"));
}

test("legacy report migration previews exact hashes without mutating files", async () => {
  const root = await fixtureRoot();
  const source = join(root, "artifact.json");
  try {
    await writeFile(source, "{\"private\":true}\n", { mode: 0o600 });
    const result = await inspectLocalLegacyReportMigration({
      files: ["artifact.json"],
      root,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.entries[0].state, "migratable");
    assert.equal(result.entries[0].bytes, 17);
    assert.match(result.entries[0].sha256, /^[a-f0-9]{64}$/u);
    assert.equal(await readFile(source, "utf8"), "{\"private\":true}\n");
    await assert.rejects(readFile(localLegacyReportPath(root, "artifact.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("legacy report migration copies known files while preserving source identity and ACL", async () => {
  const root = await fixtureRoot();
  const source = join(root, "artifact.json");
  const destination = localLegacyReportPath(root, "artifact.json");
  try {
    await writeFile(source, "{\"private\":true}\n", { mode: 0o644 });
    const native = loadWindowsLegacyStateReadBinding();
    const sourceBefore = native.inspectPath(source);
    const result = await migrateLocalLegacyReports({
      apply: true,
      files: ["artifact.json"],
      root,
    });
    assert.equal(result.status, "migrated");
    assert.equal(result.entries[0].state, "migrated");
    assert.equal(await readFile(destination, "utf8"), "{\"private\":true}\n");
    assert.equal(await readFile(source, "utf8"), "{\"private\":true}\n");
    assert.deepEqual(native.inspectPath(source), sourceBefore);
    assertWindowsOwnerOnly(destination);
    assertWindowsOwnerOnly(join(root, ".usage-monitor", "legacy-reports"));
    assert.notDeepEqual(native.inspectPath(destination).identity, sourceBefore.identity);
    const repeated = await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] });
    assert.equal(repeated.status, "nothing_to_migrate");
    assert.equal(repeated.entries[0].state, "already_migrated");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("migration refuses to overwrite an existing private report", async () => {
  const root = await fixtureRoot();
  const source = join(root, "artifact.json");
  const destination = localLegacyReportPath(root, "artifact.json");
  try {
    await writeFile(source, "{\"root\":true}\n", { mode: 0o600 });
    await writeLocalLegacyReport(root, "artifact.json", "{\"canonical\":true}\n");
    const result = await migrateLocalLegacyReports({
      apply: true,
      files: ["artifact.json"],
      root,
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.entries[0].state, "destination_conflict");
    assert.equal(await readFile(source, "utf8"), "{\"root\":true}\n");
    assert.equal(await readFile(destination, "utf8"), "{\"canonical\":true}\n");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("read resolution prefers the canonical report but preserves old root reports as a compatibility fallback", async () => {
  const root = await fixtureRoot();
  const source = join(root, "artifact.json");
  const destination = localLegacyReportPath(root, "artifact.json");
  try {
    await writeFile(source, "{\"root\":true}\n", { mode: 0o600 });
    assert.equal(await resolveLocalLegacyReportReadPath(root, "artifact.json"), source);
    await writeLocalLegacyReport(root, "artifact.json", "{\"canonical\":true}\n");
    assert.equal(await resolveLocalLegacyReportReadPath(root, "artifact.json"), destination);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("canonical report writes replace atomically, remain owner-only, and clean their exact staging file", async () => {
  const root = await fixtureRoot();
  const destination = localLegacyReportPath(root, "artifact.json");
  const reportDirectory = join(root, ".usage-monitor", "legacy-reports");
  try {
    assert.equal(await writeLocalLegacyReport(root, "artifact.json", "first\n"), destination);
    assert.equal(await readFile(destination, "utf8"), "first\n");
    assertWindowsOwnerOnly(destination);
    assert.deepEqual(await readdir(reportDirectory), ["artifact.json"]);

    assert.equal(await writeLocalLegacyReport(root, "artifact.json", "second\n"), destination);
    assert.equal(await readFile(destination, "utf8"), "second\n");
    assertWindowsOwnerOnly(destination);
    assert.deepEqual(await readdir(reportDirectory), ["artifact.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("canonical final and ancestor symlinks are rejected before a report read or write", async () => {
  const root = await fixtureRoot();
  const outside = await fixtureRoot();
  const outsideSecret = join(outside, "secret.json");
  const canonicalDirectory = join(root, ".usage-monitor", "legacy-reports");
  const canonicalPath = localLegacyReportPath(root, "artifact.json");
  try {
    await writeFile(outsideSecret, "must remain private\n", { mode: 0o600 });
    await ensureLocalLegacyReportDirectory(root);
    await symlink(outsideSecret, canonicalPath);
    await assert.rejects(
      resolveLocalLegacyReportReadPath(root, "artifact.json"),
      { code: "unsafe_report_path" },
    );
    await assert.rejects(ensureLocalLegacyReportDirectory(root), { code: "unsafe_report_path" });
    await assert.rejects(
      writeLocalLegacyReport(root, "artifact.json", "must not publish\n"),
      { code: "unsafe_report_path" },
    );
    assert.equal(await readFile(outsideSecret, "utf8"), "must remain private\n");

    await rm(join(root, ".usage-monitor"), { force: true, recursive: true });
    await symlink(outside, join(root, ".usage-monitor"));
    await assert.rejects(
      resolveLocalLegacyReportReadPath(root, "artifact.json"),
      { code: "unsafe_report_path" },
    );
    await assert.rejects(ensureLocalLegacyReportDirectory(root), { code: "unsafe_report_path" });
    await assert.rejects(
      writeLocalLegacyReport(root, "artifact.json", "must not publish\n"),
      { code: "unsafe_report_path" },
    );
    assert.equal(await readFile(outsideSecret, "utf8"), "must remain private\n");
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("legacy source symlinks are blocked instead of being migrated from outside the owner tree", async () => {
  const root = await fixtureRoot();
  const outside = await fixtureRoot();
  const outsideSecret = join(outside, "secret.json");
  try {
    await writeFile(outsideSecret, "outside-only\n", { mode: 0o600 });
    await symlink(outsideSecret, join(root, "artifact.json"));
    const result = await migrateLocalLegacyReports({
      apply: true,
      files: ["artifact.json"],
      root,
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.entries[0].state, "unsafe_source");
    await assert.rejects(readFile(localLegacyReportPath(root, "artifact.json")));
    assert.equal(await readFile(outsideSecret, "utf8"), "outside-only\n");
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

// Frozen native source leases now deny writer sharing. Exercise a real append
// at the read boundary and require refusal, rather than weakening protection to
// keep the old Node FileHandle mutation seam callable.
test("native migration source lease refuses actual growth during its bounded read", async (t) => {
  const root = await fixtureRoot();
  const source = join(root, "artifact.json");
  const maximumBytes = 16 * 1024 * 1024;
  try {
    await writeFile(source, Buffer.alloc(maximumBytes, 0x61), { mode: 0o600 });
    const native = loadWindowsLegacyStateReadBinding(), realRead = native.readSourceFile;
    let attempts = 0;
    t.mock.method(native, "readSourceFile", (...args) => {
      if (attempts === 0) {
        attempts++;
        assert.throws(() => appendFileSync(source, "x"), error => ["EPERM", "EACCES", "EBUSY"].includes(error.code));
      }
      return realRead(...args);
    });
    const result = await inspectLocalLegacyReportMigration({
      files: ["artifact.json"],
      root,
    });
    assert.equal(attempts, 1, "native read seam was exercised");
    assert.equal(result.entries[0].state, "migratable");
    assert.equal(result.status, "ready");
    assert.equal((await stat(source)).size, maximumBytes);
    await assert.rejects(readFile(localLegacyReportPath(root, "artifact.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("native migration detects an inconsistent final size after its overflow probe", async (t) => {
  const root = await fixtureRoot();
  const source = join(root, "artifact.json");
  const maximumBytes = 16 * 1024 * 1024;
  try {
    await writeFile(source, Buffer.alloc(maximumBytes, 0x61), { mode: 0o600 });
    const native = loadWindowsLegacyStateReadBinding(), realRead = native.readSourceFile, realStat = native.statSourceFile;
    let probes = 0;
    t.mock.method(native, "readSourceFile", (...args) => {
      const read = realRead(...args);
      if (args[1] === maximumBytes && args[2] === 1) {
        probes++;
        assert.throws(() => appendFileSync(source, "x"), error => ["EPERM", "EACCES", "EBUSY"].includes(error.code));
      }
      return read;
    });
    t.mock.method(native, "statSourceFile", lease => {
      const stat = realStat(lease);
      return probes ? { ...stat, size: stat.size + 1 } : stat;
    });
    const result = await inspectLocalLegacyReportMigration({
      files: ["artifact.json"],
      root,
    });
    assert.equal(probes, 1, "the native seam saw the overflow probe");
    assert.equal(result.entries[0].state, "source_changed");
    assert.equal(result.status, "nothing_to_migrate");
    await assert.rejects(readFile(localLegacyReportPath(root, "artifact.json")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function isolated(t) {
  const root = await fixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("preview creates no state, reads remain bounded and generated summaries omit content and root", async t => {
  const root = await isolated(t), file = "artifact.json";
  await writeFile(join(root, file), "synthetic-private-content-canary");
  const before = await readdir(root);
  const result = await inspectLocalLegacyReportMigration({ root, files: [file] });
  assert.deepEqual(await readdir(root), before);
  assert.equal(JSON.stringify(result).includes(root), false);
  assert.equal(JSON.stringify(result).includes("synthetic-private-content-canary"), false);
  assert.equal(await readLocalLegacyReport(root, file), "synthetic-private-content-canary");
  assert.deepEqual(await readdir(root), before);
  await assert.rejects(readLegacyReportPath(join(root, "missing.html")), { code: "report_not_found" });
});

test("reports larger than the protected-state one MiB limit can be copied and read within the report limit", async t => {
  const root = await isolated(t), bytes = Buffer.alloc(1024 * 1024 + 91, 0x61);
  await writeFile(join(root, "artifact.json"), bytes);
  const result = await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] });
  assert.equal(result.status, "migrated");
  assert.deepEqual(await readFile(localLegacyReportPath(root, "artifact.json")), bytes);
  assert.equal(await readLocalLegacyReport(root, "artifact.json"), bytes.toString());
  assert.equal((await inspectLocalLegacyReportMigration({ root, files: ["artifact.json"] })).entries[0].state, "already_migrated");
});

test("oversized reports refuse before copying and unknown filenames never become targets", async t => {
  const root = await isolated(t), length = 16 * 1024 * 1024 + 1;
  await writeFile(join(root, "artifact.json"), Buffer.alloc(length));
  const result = await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] });
  assert.equal(result.status, "blocked");
  assert.equal(result.entries[0].state, "source_too_large");
  assert.equal(result.entries[0].bytes, length);
  assert.deepEqual(await readdir(root), ["artifact.json"]);
  await assert.rejects(writeLocalLegacyReport(root, "artifact.json", Buffer.alloc(length)), { code: "source_too_large" });
  assert.deepEqual(await readdir(root), ["artifact.json"]);
  await assert.rejects(inspectLocalLegacyReportMigration({ root, files: ["../private.html"] }), { code: "unknown_legacy_report" });
  await assert.rejects(writeLocalLegacyReport(root, "../private.html", "x"), { code: "unknown_legacy_report" });
});

test("partial multi-report copy preserves both sources and exact completed copies for a safe repeat", async t => {
  const root = await isolated(t), native = loadWindowsLegacyStateReadBinding();
  const files = ["2026-07-24-monitoring-quality-artifact.json", "artifact.json"];
  for (const name of files) await writeFile(join(root, name), `synthetic-${name}`);
  const before = files.map(name => native.inspectPath(join(root, name)));
  const original = native.copyLegacyStateFile;
  const mock = t.mock.method(native, "copyLegacyStateFile", (...args) => {
    if (args[3] === "artifact.json") throw Object.assign(new Error("Synthetic copy refusal"), { code: "WINDOWS_FILESYSTEM_ACCESS_DENIED" });
    return original(...args);
  });
  try {
    const result = await migrateLocalLegacyReports({ apply: true, root, files });
    assert.equal(result.status, "recovery_required");
    assert.equal(result.entries[0].state, "migrated");
    assert.equal(await readLocalLegacyReport(root, files[0]), `synthetic-${files[0]}`);
  } finally { mock.mock.restore(); }
  assert.deepEqual(files.map(name => native.inspectPath(join(root, name))), before);
  assert.equal((await migrateLocalLegacyReports({ apply: true, root, files })).status, "migrated");
  assert.equal((await migrateLocalLegacyReports({ apply: true, root, files })).status, "nothing_to_migrate");
  for (const name of files) {
    assert.equal(await readFile(join(root, name), "utf8"), `synthetic-${name}`);
    assertWindowsOwnerOnly(localLegacyReportPath(root, name));
  }
});

test("uncertain copy return preserves the verified file and repeat verifies it without copying", async t => {
  const root = await isolated(t), native = loadWindowsLegacyStateReadBinding();
  await writeFile(join(root, "artifact.json"), "synthetic original");
  const original = native.copyLegacyStateFile;
  const mock = t.mock.method(native, "copyLegacyStateFile", (...args) => {
    original(...args); throw new Error("Synthetic post-copy interruption");
  });
  try { assert.equal((await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] })).status, "recovery_required"); }
  finally { mock.mock.restore(); }
  const noReplay = t.mock.method(native, "copyLegacyStateFile", () => assert.fail("verified copy must not be replayed"));
  try {
    assert.equal((await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] })).status, "nothing_to_migrate");
  } finally { noReplay.mock.restore(); }
});

test("a destination arriving after preview is not overwritten or deleted", async t => {
  const root = await isolated(t), native = loadWindowsLegacyStateReadBinding();
  await writeFile(join(root, "artifact.json"), "synthetic source");
  const original = native.copyLegacyStateFile;
  const mock = t.mock.method(native, "copyLegacyStateFile", (...args) => {
    native.createProtectedChild(args[1], args[2], args[3], Buffer.from("synthetic conflict"));
    return original(...args);
  });
  try { assert.equal((await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] })).status, "recovery_required"); }
  finally { mock.mock.restore(); }
  assert.equal(await readFile(localLegacyReportPath(root, "artifact.json"), "utf8"), "synthetic conflict");
  assert.equal(await readFile(join(root, "artifact.json"), "utf8"), "synthetic source");
  const repeated = await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] });
  assert.equal(repeated.status, "blocked");
  assert.equal(repeated.entries[0].state, "destination_conflict");
});

test("frozen sources and root remain pinned throughout copying", async t => {
  const root = await isolated(t), native = loadWindowsLegacyStateReadBinding();
  const source = join(root, "artifact.json"); await writeFile(source, "synthetic source");
  const original = native.copyLegacyStateFile;
  let exercised = false;
  t.mock.method(native, "copyLegacyStateFile", (...args) => {
    exercised = true;
    for (const [from, to] of [[source, `${source}.substitute`], [root, `${root}.substitute`]]) {
      assert.throws(() => renameSync(from, to), error => ["EPERM", "EACCES", "EBUSY"].includes(error.code));
    }
    assert.throws(() => appendFileSync(source, "x"), error => ["EPERM", "EACCES", "EBUSY"].includes(error.code));
    return original(...args);
  });
  assert.equal((await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] })).status, "migrated");
  assert.equal(exercised, true);
});

test("an existing writer or source hardlink prevents migration", async t => {
  const root = await isolated(t), source = join(root, "artifact.json");
  await writeFile(source, "synthetic source");
  const writer = openSync(source, "r+");
  try {
    const result = await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] });
    assert.equal(result.status, "blocked");
    assert.equal(result.entries[0].state, "source_changed");
  } finally { closeSync(writer); }
  await link(source, join(root, "synthetic-alias"));
  const result = await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] });
  assert.equal(result.status, "blocked");
  assert.equal(result.entries[0].state, "multiple_hard_links");
  assert.equal((await readdir(root)).includes(".usage-monitor"), false);
});

test("unsafe existing destination DACL is refused and never repaired", async t => {
  const root = await isolated(t), native = loadWindowsLegacyStateReadBinding();
  await writeLocalLegacyReport(root, "artifact.json", "synthetic canonical");
  const path = localLegacyReportPath(root, "artifact.json"); grantSyntheticEveryoneRead(path);
  const before = native.inspectPath(path);
  await assert.rejects(writeLocalLegacyReport(root, "artifact.json", "replacement"), { code: "unsafe_report_path" });
  await assert.rejects(readLocalLegacyReport(root, "artifact.json"), { code: "unsafe_report_path" });
  assert.deepEqual(native.inspectPath(path), before);
  assert.equal(await readFile(path, "utf8"), "synthetic canonical");
});

test("explicit paths require protected existing parents and honor their anchor", async t => {
  const root = await isolated(t), file = "artifact.json";
  grantSyntheticEveryoneRead(root);
  await assert.rejects(writeLegacyReportPath(join(root, file), "x"), { code: "unsafe_report_path" });
  const path = await writeLocalLegacyReport(root, file, "original");
  assert.equal(await writeLegacyReportPath(path, "replacement", { anchor: root }), path);
  assert.equal(await readLegacyReportPath(path, { anchor: root }), "replacement");
  await assert.rejects(readLegacyReportPath(path, { anchor: join(root, "foreign") }), { code: "unsafe_report_path" });
});

test("migration CLI remains read-only by default and help states source preservation", async t => {
  const root = await isolated(t); await writeFile(join(root, "artifact.json"), "synthetic source");
  const before = await readdir(root);
  assert.equal((await runLocalLegacyReportMigration(["--root", root])).apply, false);
  assert.deepEqual(await readdir(root), before);
  assert.match((await runLocalLegacyReportMigration(["--help"])).help, /without overwriting or deleting sources/u);
  await assert.rejects(runLocalLegacyReportMigration(["--root", root, "--apply", "--dry-run"]), {
    code: "legacy_report_arguments_invalid",
  });
  assert.deepEqual(await readdir(root), before);
  await assert.rejects(runLocalLegacyReportMigration(["--synthetic-private-argument"]), error => {
    assert.equal(error.code, "legacy_report_arguments_invalid");
    assert.equal(error.message.includes("synthetic-private"), false); return true;
  });
});

test("substitution between source inspection and frozen open fails closed", async t => {
  const root = await isolated(t), source = join(root, "artifact.json");
  await writeFile(source, "synthetic original");
  const native = loadWindowsLegacyStateReadBinding(), open = native.openLegacyStateFile;
  let swapped = false;
  t.mock.method(native, "openLegacyStateFile", path => {
    if (path === source && !swapped) {
      swapped = true;
      renameSync(source, `${source}.original`);
      sourceFixtureFile(source);
      appendFileSync(source, "synthetic substitute");
    }
    return open(path);
  });
  const result = await migrateLocalLegacyReports({ apply: true, root, files: ["artifact.json"] });
  assert.equal(swapped, true);
  assert.equal(result.status, "blocked");
  assert.equal(result.entries[0].state, "source_changed");
  assert.equal((await readdir(root)).includes(".usage-monitor"), false);
  assert.equal(await readFile(`${source}.original`, "utf8"), "synthetic original");
});
