import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import * as contract from "../src/export/index.js";
import {
  createOwnerOnlyExportWorkspaceDiscardPreflight,
  createOwnerOnlyExportWorkspaceDiscardStorage,
} from "../src/platform/index.js";
import { localExportWorkspace } from "../src/local-node-runtime.js";
import { createProtectedFixtureTempDirectory, writeInitialProtectedFixtureFile } from "./helpers/windows-owner-only-fixture.js";

// Logical identity injection over disposable real files. No native qualification
// is inferred from these chosen IDs; the executable discard suite covers real
// Windows workspace admission, locks, links and process termination separately.
function injectIdentity(t, identities, { beforeOpen = () => {} } = {}) {
  const originalLstat = fs.lstat;
  const originalOpen = fs.open;
  const physical = new Map();
  function selected(path, stats, options) {
    let identity = identities.get(resolve(path));
    // A real hardlink/quarantine keeps the same physical object even after its
    // canonical name disappears. Keep its injected identity on every name.
    for (const [name, value] of identities) {
      try { physical.set(name, lstatSync(name, { bigint: true })); } catch { /* Retain last object. */ }
      const source = physical.get(name);
      const dev = options?.bigint ? source?.dev : Number(source?.dev);
      const ino = options?.bigint ? source?.ino : Number(source?.ino);
      if (!identity && stats.dev === dev && stats.ino === ino) identity = value;
    }
    if (!identity) return stats;
    for (const field of ["dev", "ino"]) {
      if (identity[field] !== undefined) stats[field] = options?.bigint ? identity[field] : Number(identity[field]);
    }
    return stats;
  }
  t.mock.method(fs, "lstat", async (path, options) => selected(path, await originalLstat(path, options), options));
  t.mock.method(fs, "open", async (path, ...args) => {
    beforeOpen(path);
    const handle = await originalOpen(path, ...args);
    return new Proxy(handle, { get(target, key) {
      if (key === "stat") return async (options) => selected(path, await target.stat(options), options);
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

async function fixture(t) {
  const root = await createProtectedFixtureTempDirectory(join(tmpdir(), "discard-exact-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const database = join(root, "workspace.sqlite3");
  writeInitialProtectedFixtureFile(database, "content-free synthetic workspace");
  const shared = {
    ...Object.fromEntries(Object.entries(contract).filter(([key]) => key.startsWith("assertValidExportWorkspaceDiscard"))),
    workspaceDatabaseBasename: "workspace.sqlite3", roles: contract.EXPORT_WORKSPACE_DISCARD_ROLES,
    journalBasename: contract.EXPORT_WORKSPACE_DISCARD_JOURNAL_BASENAME,
    markerBasename: contract.EXPORT_WORKSPACE_DISCARD_COMMIT_MARKER_BASENAME,
    receiptBasename: contract.EXPORT_WORKSPACE_DISCARD_RECEIPT_BASENAME,
    quarantinePrefix: contract.EXPORT_WORKSPACE_DISCARD_QUARANTINE_PREFIX,
    workspaceLockBasename: contract.EXPORT_WORKSPACE_DISCARD_WORKSPACE_LOCK_BASENAME,
    transactionBasename: contract.EXPORT_WORKSPACE_DISCARD_TRANSACTION_BASENAME,
    stableJson: contract.stableJson,
    readBoundedDirectoryEntries: async (directory) => (await fs.readdir(directory)).sort(),
    planVersion: contract.EXPORT_WORKSPACE_DISCARD_PLAN_VERSION,
    orderVersion: contract.EXPORT_WORKSPACE_DISCARD_ORDER_VERSION,
  };
  const preflight = createOwnerOnlyExportWorkspaceDiscardPreflight({ ...shared,
    maximumWorkspaceBytes: 1024 * 1024, isTrustedResourceLimitError: () => false,
    inspectExportWorkspaceDiscardState: async () => ({ hasManifestState: false,
      poisoned: false, scanComplete: false, chunkCount: 0 }),
    journalVersion: contract.EXPORT_WORKSPACE_DISCARD_JOURNAL_VERSION,
    preflightVersion: contract.EXPORT_WORKSPACE_DISCARD_PREFLIGHT_VERSION,
  });
  const storage = createOwnerOnlyExportWorkspaceDiscardStorage({ ...shared, ...preflight,
    withExistingExportWorkspaceLease: localExportWorkspace.withExistingExportWorkspaceLease,
    commitMarkerVersion: contract.EXPORT_WORKSPACE_DISCARD_COMMIT_MARKER_VERSION,
    receiptVersion: contract.EXPORT_WORKSPACE_DISCARD_RECEIPT_VERSION,
    confirmationTokenPattern: contract.EXPORT_WORKSPACE_DISCARD_CONFIRMATION_TOKEN_PATTERN,
  });
  return { root, database, preflight, storage };
}

const FIRST = 9007199254740992n;
const SECOND = FIRST + 1n;

function legacyToken(domain, subject, byteCount, length) {
  const bytes = createHash("sha256").update(domain).update("\0").update(subject).digest().subarray(0, byteCount);
  return [...bytes].map((byte) => byte.toString(2).padStart(8, "0")).join("")
    .match(/.{1,5}/g).map((bits) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[parseInt(bits.padEnd(5, "0"), 2)])
    .join("").slice(0, length);
}

test("a v0.1 confirmation cannot authorize the exact v0.2 plan", async (t) => {
  const value = await fixture(t);
  const built = await value.preflight.buildLocalExportWorkspaceDiscardPlan({ workspaceDirectory: value.root });
  const { stats, parent } = built.directory;
  const oldSubject = contract.stableJson({ directory: {
    device: Number(stats.dev), inode: Number(stats.ino),
    parentDevice: Number(parent.stats.dev), parentInode: Number(parent.stats.ino),
  }, eligibility: built.journal.eligibility,
  inventory: built.internalInventory.map(({ role, evidence }) => ({ role,
    device: Number(evidence.device), inode: Number(evidence.inode),
    linkCount: evidence.linkCount, byteSize: evidence.byteSize, digest: evidence.digest,
  })) });
  const oldPlan = legacyToken("app-usagemonitor/export-workspace-discard-plan/v1", oldSubject, 13, 20);
  const oldConfirmation = legacyToken("app-usagemonitor/export-workspace-discard-confirmation/v1", oldPlan, 10, 16);
  assert.notEqual(oldConfirmation, built.summary.confirmationToken);
  await assert.rejects(value.storage.discardLocalExportWorkspace({ workspaceDirectory: value.root,
    confirmationToken: oldConfirmation }), { code: "export_workspace_discard_execute_confirmation" });
  assert.deepEqual(await fs.readdir(value.root), ["workspace.sqlite3"]);
});

test("discard confirmation distinguishes adjacent large file, directory and parent identities", async (t) => {
  const value = await fixture(t);
  const identities = new Map();
  injectIdentity(t, identities);
  for (const [path, field] of [value.database, value.root, dirname(value.root)]
    .flatMap((path) => ["dev", "ino"].map((field) => [path, field]))) {
    identities.clear();
    identities.set(path, { [field]: FIRST });
    const first = await value.preflight.planLocalExportWorkspaceDiscard({ workspaceDirectory: value.root });
    identities.set(path, { [field]: SECOND });
    const second = await value.preflight.planLocalExportWorkspaceDiscard({ workspaceDirectory: value.root });
    assert.notEqual(first.confirmationToken, second.confirmationToken);
    await assert.rejects(value.storage.discardLocalExportWorkspace({ workspaceDirectory: value.root,
      confirmationToken: first.confirmationToken }), { code: "export_workspace_discard_execute_confirmation" });
    assert.deepEqual(await fs.readdir(value.root), ["workspace.sqlite3"]);
  }
});

test("discard token inputs require canonical exact U64 identities", async (t) => {
  const { preflight } = await fixture(t);
  const evidence = { device: "0", inode: "18446744073709551615", linkCount: 1,
    byteSize: 1, digest: "a".repeat(64) };
  assert.equal(typeof preflight.workspaceDiscardEvidenceToken("plan", "role", evidence), "string");
  const directory = { stats: { dev: "0", ino: "18446744073709551615" },
    parent: { stats: { dev: "0", ino: "1" } } };
  assert.equal(typeof preflight.workspaceDiscardDirectoryIdentityToken("plan", directory), "string");
  for (const inode of [0, 1, 9007199254740992, 1n, "0", "01", "+1", "1.0", "-1",
    "18446744073709551616", "340282366920938463463374607431768211455"]) {
    assert.throws(() => preflight.workspaceDiscardEvidenceToken("plan", "role", { ...evidence, inode }),
      /configuration is invalid/);
    assert.throws(() => preflight.workspaceDiscardDirectoryIdentityToken("plan", {
      ...directory, stats: { ...directory.stats, ino: inode },
    }), /configuration is invalid/);
  }
});

test("discard reads large identities through the U64 maximum and refuses lossy or overflow stats before mutation", async (t) => {
  const value = await fixture(t);
  const identities = new Map();
  injectIdentity(t, identities);
  const tokens = new Set();
  for (const ino of [9007199254740991n, FIRST, SECOND, 18446744073709551615n]) {
    identities.set(value.database, { ino });
    tokens.add((await value.preflight.planLocalExportWorkspaceDiscard({ workspaceDirectory: value.root })).confirmationToken);
  }
  assert.equal(tokens.size, 4);
  for (const ino of [9007199254740992, -1n, 18446744073709551616n, "0042"]) {
    identities.set(value.database, { ino });
    await assert.rejects(value.preflight.planLocalExportWorkspaceDiscard({ workspaceDirectory: value.root }),
      (error) => error.code.startsWith("export_workspace_discard_"));
    assert.deepEqual(await fs.readdir(value.root), ["workspace.sqlite3"]);
  }
});

test("discard rejects an adjacent-identity substitution between pathname stat and descriptor open", async (t) => {
  const value = await fixture(t);
  const identities = new Map([[value.database, { ino: FIRST }]]);
  injectIdentity(t, identities, { beforeOpen(path) {
    if (resolve(path) === value.database) identities.set(value.database, { ino: SECOND });
  } });
  await assert.rejects(value.preflight.planLocalExportWorkspaceDiscard({ workspaceDirectory: value.root }),
    { code: "export_workspace_discard_artifact_changed" });
  assert.deepEqual(await fs.readdir(value.root), ["workspace.sqlite3"]);
});

test("discard recovery rejects changed sidecar, directory and parent identities without deleting inventory", async (t) => {
  for (const kind of ["sidecar", "directory", "parent"]) await t.test(kind, async (t) => {
    const value = await fixture(t);
    const sidecar = `${value.database}-journal`;
    writeInitialProtectedFixtureFile(sidecar, "inactive synthetic sidecar");
    const path = kind === "sidecar" ? sidecar : kind === "directory" ? value.root : dirname(value.root);
    const identities = new Map([[path, { ino: FIRST }]]);
    injectIdentity(t, identities);
    const options = { workspaceDirectory: value.root };
    const plan = await value.preflight.planLocalExportWorkspaceDiscard(options);
    await assert.rejects(value.storage.discardLocalExportWorkspace({ ...options,
      confirmationToken: plan.confirmationToken,
      failpoint(stage) { if (stage === "after_journal_commit") throw new Error("synthetic pause"); },
    }), /synthetic pause/);
    identities.set(path, { ino: SECOND });
    await assert.rejects(value.storage.recoverLocalExportWorkspaceDiscard(options),
      { code: "export_workspace_discard_execute_replacement" });
    assert.equal(await fs.readFile(sidecar, "utf8"), "inactive synthetic sidecar");
    assert.equal(await fs.readFile(value.database, "utf8"), "content-free synthetic workspace");
  });
});

test("discard quarantine refuses an adjacent-identity replacement introduced after linking", async (t) => {
  const value = await fixture(t);
  const identities = new Map([[value.database, { ino: FIRST }]]);
  injectIdentity(t, identities);
  const options = { workspaceDirectory: value.root };
  const plan = await value.preflight.planLocalExportWorkspaceDiscard(options);
  await assert.rejects(value.storage.discardLocalExportWorkspace({ ...options,
    confirmationToken: plan.confirmationToken,
    async linkFile(from, to) {
      await fs.link(from, to);
      if (from === value.database) identities.set(to, { ino: SECOND });
    },
  }), { code: "export_workspace_discard_execute_replacement" });
  const quarantine = join(value.root, `${contract.EXPORT_WORKSPACE_DISCARD_QUARANTINE_PREFIX}00`);
  for (const path of [value.database, quarantine]) {
    assert.equal(await fs.readFile(path, "utf8"), "content-free synthetic workspace");
  }
});

test("discard control cleanup preserves adjacent-identity canonical and quarantine replacements", async (t) => {
  for (const kind of ["journal", "marker"]) await t.test(kind, async (t) => {
    const value = await fixture(t);
    const control = join(value.root, kind === "journal" ? contract.EXPORT_WORKSPACE_DISCARD_JOURNAL_BASENAME
      : contract.EXPORT_WORKSPACE_DISCARD_COMMIT_MARKER_BASENAME);
    const quarantine = join(value.root, `${contract.EXPORT_WORKSPACE_DISCARD_QUARANTINE_PREFIX}${kind === "journal" ? "journal" : "commit"}`);
    const identities = new Map([[control, { ino: FIRST }]]);
    injectIdentity(t, identities);
    const options = { workspaceDirectory: value.root };
    const plan = await value.preflight.planLocalExportWorkspaceDiscard(options);
    await assert.rejects(value.storage.discardLocalExportWorkspace({ ...options,
      confirmationToken: plan.confirmationToken,
      async linkFile(from, to) {
        await fs.link(from, to);
        if (from === control) identities.set(to, { ino: SECOND });
      },
    }), { code: "export_workspace_discard_execute_replacement" });
    const bytes = await fs.readFile(control);
    assert.deepEqual(await fs.readFile(quarantine), bytes);
    const before = (await fs.readdir(value.root)).sort();
    await assert.rejects(value.storage.recoverLocalExportWorkspaceDiscard(options),
      (error) => ["export_workspace_discard_execute_journal_invalid", "export_workspace_discard_execute_commit_invalid"]
        .includes(error.code));
    assert.deepEqual((await fs.readdir(value.root)).sort(), before);
    assert.deepEqual(await fs.readFile(control), bytes);
    assert.deepEqual(await fs.readFile(quarantine), bytes);
  });
});

test("discard preserves a same-byte adjacent-identity replacement during committed recovery", async (t) => {
  const value = await fixture(t);
  const identities = new Map([[value.database, { ino: FIRST }]]);
  injectIdentity(t, identities);
  const options = { workspaceDirectory: value.root };
  const plan = await value.preflight.planLocalExportWorkspaceDiscard(options);
  await assert.rejects(value.storage.discardLocalExportWorkspace({ ...options,
    confirmationToken: plan.confirmationToken,
    failpoint(stage) { if (stage === "after_journal_commit") throw new Error("synthetic pause"); },
  }), /synthetic pause/);
  const before = await fs.readFile(value.database);
  identities.set(value.database, { ino: SECOND });
  await assert.rejects(value.storage.recoverLocalExportWorkspaceDiscard(options),
    { code: "export_workspace_discard_execute_replacement" });
  assert.deepEqual(await fs.readFile(value.database), before);
  identities.set(value.database, { ino: FIRST });
  // Restoring a mocked Node stat id cannot authorize the different real
  // Windows object. Native deletion independently binds the journal identity.
  await assert.rejects(value.storage.recoverLocalExportWorkspaceDiscard(options),
    { code: "export_workspace_discard_execute_replacement" });
  assert.deepEqual(await fs.readFile(value.database), before);
  assert.ok(!(await fs.readdir(value.root)).includes(contract.EXPORT_WORKSPACE_DISCARD_RECEIPT_BASENAME));
});
