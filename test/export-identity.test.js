import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveAccountScopeId,
  deriveEventId,
  deriveEventOccurrenceId,
  deriveMarkerId,
  deriveMarkerOccurrenceId,
  deriveModelFingerprint,
  deriveParticipantId,
  deriveQuotaStateId,
  deriveSessionScopeId,
  deriveSnapshotId,
  deriveSnapshotObservationId,
  defaultExportSecretFile,
  defaultExportStateDirectory,
  encodeParticipantSecret,
  inspectParticipantSecret as inspectIdentity,
  loadOrCreateParticipantSecret as loadIdentity,
  participantSecretBackendRetirementFile,
  participantSecretLegacyRetirementFile,
  randomBundleId,
  rotateParticipantSecret as rotateIdentity,
  withParticipantSecretLease as leaseIdentity,
} from "../src/export-identity.js";

import { createMemoryIdentityFixture } from "./helpers/memory-participant-filesystem.js";

// These are logical lifecycle tests against an explicitly injected memory port.
// Real Windows ACL/refusal behavior is covered by the native boundary tests.
let state;
test.beforeEach(() => { state = createMemoryIdentityFixture(); });
const inspectParticipantSecret = (options) => inspectIdentity({ ...options, windowsFilesystemAdapter: state.adapter });
const loadOrCreateParticipantSecret = (options) => loadIdentity({ ...options, windowsFilesystemAdapter: state.adapter });
const rotateParticipantSecret = (options) => rotateIdentity({ ...options, windowsFilesystemAdapter: state.adapter });
const withParticipantSecretLease = (options, callback) => leaseIdentity({ ...options, windowsFilesystemAdapter: state.adapter }, callback);

const TEST_BACKEND_CAPABILITY = Object.freeze({ name: "export-identity-test" });

function memoryParticipantSecretBackend(initialSecret = null, overrides = {}) {
  let stored = initialSecret === null ? null : Buffer.from(initialSecret);
  const calls = [];
  const backend = {
    calls,
    async read(capability) {
      calls.push(["read", capability]);
      return stored === null ? null : Buffer.from(stored);
    },
    async createIfMissing(capability, candidate) {
      calls.push(["createIfMissing", capability, Buffer.from(candidate)]);
      if (stored !== null) return "existing";
      stored = Buffer.from(candidate);
      return "created";
    },
    async replaceExact(capability, expected, replacement) {
      calls.push(["replaceExact", capability, Buffer.from(expected), Buffer.from(replacement)]);
      if (stored === null) return "missing";
      if (!stored.equals(expected)) return "conflict";
      stored = Buffer.from(replacement);
      return "replaced";
    },
    async deleteExact(capability, expected) {
      calls.push(["deleteExact", capability, Buffer.from(expected)]);
      if (stored === null) return "missing";
      if (!stored.equals(expected)) return "conflict";
      stored = null;
      return "deleted";
    },
    async describe(capability) {
      calls.push(["describe", capability]);
      return { backend: "memory_keychain", status: "available" };
    },
    ...overrides,
  };
  backend.stored = () => stored === null ? null : Buffer.from(stored);
  backend.clear = () => { stored = null; };
  backend.set = (secret) => { stored = Buffer.from(secret); };
  return backend;
}

test("export identity is stable, domain-separated, and does not reveal its subject", () => {
  const secret = Buffer.alloc(32, 7);
  const raw = "adam@example.com/private/session";
  const participant = deriveParticipantId(secret);
  const session = deriveSessionScopeId(secret, raw);
  const event = deriveEventId(secret, raw);
  const account = deriveAccountScopeId(secret, raw);
  assert.match(participant, /^participant:v1:[a-f0-9]{64}$/);
  assert.match(session, /^session:v1:[a-f0-9]{64}$/);
  assert.notEqual(session.split(":").at(-1), event.split(":").at(-1));
  assert.notEqual(session.split(":").at(-1), account.split(":").at(-1));
  assert.equal(session.includes(raw), false);
  assert.equal(deriveSessionScopeId(secret, raw), session);
  assert.equal(deriveAccountScopeId(secret, "unattributed"), "unattributed");
  assert.match(randomBundleId(), /^bundle:v1:[a-f0-9]{64}$/);
});

test("export identity uses stable platform application-state paths", () => {
  assert.equal(
    defaultExportSecretFile({ platform: "win32", homeDirectory: "C:\\Users\\example", environment: { LOCALAPPDATA: "C:\\Local" } }),
    "C:\\Local\\app-usagemonitor\\export-participant-secret",
  );
  assert.equal(
    defaultExportStateDirectory({
      platform: "win32",
      homeDirectory: "D:\\Profiles\\Ada Lovelace-测试",
      environment: {},
    }),
    "D:\\Profiles\\Ada Lovelace-测试\\AppData\\Local\\app-usagemonitor",
  );
});

test("participant secret is created once and reused through the memory file port", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-secret-"));
  const secretFile = join(directory, "private", "export-secret");
  try {
    const first = await loadOrCreateParticipantSecret({ environmentSecret: null, secretFile });
    const second = await loadOrCreateParticipantSecret({ environmentSecret: null, secretFile });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.deepEqual(first.secret, second.secret);
    assert.equal((await state.stat(secretFile)).nlink, 1);
    assert.equal((await state.read(secretFile, "utf8")).trim(), encodeParticipantSecret(first.secret));
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("legacy working-directory identity migrates without changing the secret", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-secret-migrate-"));
  const legacy = join(directory, "legacy", "secret");
  const canonical = join(directory, "canonical", "secret");
  const secret = Buffer.alloc(32, 5);
  try {
    await state.directory(join(directory, "legacy"), { mode: 0o700 });
    await state.write(legacy, `${encodeParticipantSecret(secret)}\n`, { mode: 0o600 });
    const result = await loadOrCreateParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: legacy,
    });
    assert.equal(result.migrated, true);
    assert.equal(result.created, false);
    assert.deepEqual(result.secret, secret);
    assert.equal(await state.read(legacy, "utf8"), await state.read(canonical, "utf8"));
    assert.match(await state.read(participantSecretLegacyRetirementFile(canonical), "utf8"), /retired v1/);
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("inspection is non-creating and reports missing, legacy, canonical, and environment states", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-secret-inspect-"));
  const legacy = join(directory, "legacy", "secret");
  const canonical = join(directory, "canonical", "secret");
  const secret = Buffer.alloc(32, 9);
  try {
    const missing = await inspectParticipantSecret({ environmentSecret: null, secretFile: canonical, legacySecretFile: legacy });
    assert.equal(missing.status, "missing");
    assert.equal(missing.wouldCreate, true);
    assert.equal(Object.hasOwn(missing, "secret"), false);
    assert.equal(Object.hasOwn(missing, "path"), false);
    assert.deepEqual(await state.entries(directory), []);

    await state.directory(join(directory, "legacy"), { mode: 0o700 });
    await state.write(legacy, `${encodeParticipantSecret(secret)}\n`, { mode: 0o600 });
    const legacyOnly = await inspectParticipantSecret({ environmentSecret: null, secretFile: canonical, legacySecretFile: legacy });
    assert.equal(legacyOnly.source, "legacy_owner_only_file");
    assert.equal(legacyOnly.wouldMigrate, true);
    assert.equal((await state.entries(directory)).includes("canonical"), false);

    const environment = await inspectParticipantSecret({ environmentSecret: encodeParticipantSecret(secret), secretFile: canonical, legacySecretFile: legacy });
    assert.equal(environment.source, "environment");
    assert.equal(environment.rotatable, false);
    assert.equal((await state.entries(directory)).includes("canonical"), false);
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("equal canonical and legacy secrets are accepted and different secrets fail closed", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-secret-conflict-"));
  const legacy = join(directory, "legacy", "secret");
  const canonical = join(directory, "canonical", "secret");
  try {
    await state.directory(join(directory, "legacy"), { mode: 0o700 });
    await state.directory(join(directory, "canonical"), { mode: 0o700 });
    await state.write(legacy, `${encodeParticipantSecret(Buffer.alloc(32, 4))}\n`, { mode: 0o600 });
    await state.write(canonical, `${encodeParticipantSecret(Buffer.alloc(32, 4))}\n`, { mode: 0o600 });
    const equal = await inspectParticipantSecret({ environmentSecret: null, secretFile: canonical, legacySecretFile: legacy });
    assert.equal(equal.status, "ready");
    assert.equal(equal.conflict, false);

    await state.write(legacy, `${encodeParticipantSecret(Buffer.alloc(32, 6))}\n`, { mode: 0o600 });
    const conflict = await inspectParticipantSecret({ environmentSecret: null, secretFile: canonical, legacySecretFile: legacy });
    assert.equal(conflict.status, "conflict");
    assert.equal(Object.hasOwn(conflict, "secret"), false);
    await assert.rejects(
      loadOrCreateParticipantSecret({ environmentSecret: null, secretFile: canonical, legacySecretFile: legacy }),
      (error) => error.code === "EXPORT_IDENTITY_CONFLICT",
    );
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("concurrent legacy migration converges on one canonical secret", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-secret-migration-race-"));
  const legacy = join(directory, "legacy", "secret");
  const canonical = join(directory, "canonical", "secret");
  const secret = Buffer.alloc(32, 10);
  try {
    await state.directory(join(directory, "legacy"), { mode: 0o700 });
    await state.write(legacy, `${encodeParticipantSecret(secret)}\n`, { mode: 0o600 });
    const results = await Promise.all(Array.from({ length: 12 }, () => loadOrCreateParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: legacy,
    })));
    results.forEach((result) => assert.deepEqual(result.secret, secret));
    assert.deepEqual((await loadOrCreateParticipantSecret({ environmentSecret: null, secretFile: canonical, legacySecretFile: legacy })).secret, secret);
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("file rotation preserves identity while its Windows replacement gate is unavailable", async () => {
  const canonical = join(tmpdir(), "memory-rotation", "secret");
  const options = { environmentSecret: null, secretFile: canonical, legacySecretFile: null };
  const before = await loadOrCreateParticipantSecret(options);
  await assert.rejects(rotateParticipantSecret(options), /confirmRotation: true/);
  await assert.rejects(rotateParticipantSecret({ ...options, confirmRotation: true,
    environmentSecret: encodeParticipantSecret(before.secret) }),
    { code: "EXPORT_IDENTITY_ENVIRONMENT_ROTATION_REFUSED" });
  await assert.rejects(rotateParticipantSecret({ ...options, confirmRotation: true }),
    { code: "EXPORT_IDENTITY_WINDOWS_ROTATION_REPLACEMENT_UNAVAILABLE" });
  assert.deepEqual((await loadOrCreateParticipantSecret(options)).secret, before.secret);
  assert.deepEqual(await state.entries(join(tmpdir(), "memory-rotation")), ["secret"]);
});

test("backend inspection is non-mutating, content-free, and environment override remains explicit", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-backend-inspect-"));
  const canonical = join(directory, "state", "secret");
  const backendSecret = Buffer.alloc(32, 41);
  const backend = memoryParticipantSecretBackend(backendSecret);
  try {
    const inspection = await inspectParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: null,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    assert.deepEqual(inspection.backend, { backend: "memory_keychain", status: "available" });
    assert.equal(inspection.source, "secret_backend");
    assert.equal(inspection.backendState, "present");
    assert.equal(inspection.ownerFileState, "missing");
    assert.equal(Object.hasOwn(inspection, "secret"), false);
    assert.equal(Object.hasOwn(inspection, "path"), false);
    assert.deepEqual(await state.entries(directory), []);

    backend.calls.length = 0;
    const override = await loadOrCreateParticipantSecret({
      environmentSecret: encodeParticipantSecret(Buffer.alloc(32, 42)),
      secretFile: canonical,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    assert.equal(override.source, "environment");
    assert.deepEqual(backend.calls, []);
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("owner-file and legacy identities migrate exactly to the backend and cannot resurrect", async () => {
  for (const sourceKind of ["canonical", "legacy"]) {
    const directory = await state.tempDirectory(join(tmpdir(), `app-usagemonitor-backend-migrate-${sourceKind}-`));
    const canonical = join(directory, "state", "secret");
    const legacy = join(directory, "legacy", "secret");
    const source = sourceKind === "canonical" ? canonical : legacy;
    const original = Buffer.alloc(32, sourceKind === "canonical" ? 43 : 44);
    const backend = memoryParticipantSecretBackend();
    try {
      await state.directory(join(directory, sourceKind === "canonical" ? "state" : "legacy"), { recursive: true, mode: 0o700 });
      await state.write(source, `${encodeParticipantSecret(original)}\n`, { mode: 0o600 });
      const migrated = await loadOrCreateParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: legacy,
        participantSecretBackend: backend,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      });
      assert.equal(migrated.source, "secret_backend");
      assert.equal(migrated.migrated, true);
      assert.deepEqual(migrated.secret, original);
      assert.deepEqual(backend.stored(), original);
      assert.match(await state.read(participantSecretBackendRetirementFile(canonical), "utf8"), /backend retired v1/);
      assert.match(await state.read(participantSecretLegacyRetirementFile(canonical), "utf8"), /retired v1/);
      await assert.rejects(state.read(source, "utf8"), { code: "ENOENT" });
      assert.equal(migrated.secretFilesRemoved, 1);
      assert.equal(migrated.secretFilesRetained, 0);
      const cleaned = await inspectParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: legacy,
        participantSecretBackend: backend,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      });
      assert.equal(sourceKind === "canonical" ? cleaned.ownerFileState : cleaned.legacyState, "retired_removed");

      backend.clear();
      const recreated = await loadOrCreateParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: legacy,
        participantSecretBackend: backend,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      });
      assert.equal(recreated.created, true);
      assert.equal(recreated.migrated, false);
      assert.notDeepEqual(recreated.secret, original);
      assert.deepEqual(backend.stored(), recreated.secret);
    } finally {
      await state.remove(directory, { recursive: true, force: true });
    }
  }
});

test("backend migration retirement is durable before cleanup and crash residue is recovered", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-backend-cleanup-recovery-"));
  const canonical = join(directory, "state", "secret");
  const original = Buffer.alloc(32, 84);
  const backend = memoryParticipantSecretBackend();
  let crash = true;
  try {
    await state.directory(join(directory, "state"), { recursive: true, mode: 0o700 });
    await state.write(canonical, `${encodeParticipantSecret(original)}\n`, { mode: 0o600 });
    await assert.rejects(
      loadOrCreateParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: null,
        participantSecretBackend: backend,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
        migrationHook(point) {
          if (crash && point === "after-retirement-before-cleanup") {
            crash = false;
            throw new Error("simulated migration crash");
          }
        },
      }),
      /simulated migration crash/,
    );
    assert.deepEqual(backend.stored(), original);
    assert.equal((await state.read(canonical, "utf8")).trim(), encodeParticipantSecret(original));
    assert.match(await state.read(participantSecretBackendRetirementFile(canonical), "utf8"), /backend retired v1/);
    const residue = await inspectParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: null,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    assert.equal(residue.ownerFileState, "retired_retained");

    const recovered = await loadOrCreateParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: null,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    assert.equal(recovered.ownerFileCleanup, "removed");
    assert.equal(recovered.secretFilesRemoved, 1);
    await assert.rejects(state.read(canonical, "utf8"), { code: "ENOENT" });
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("backend cleanup never removes a same-user replacement after retirement", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-backend-cleanup-replacement-"));
  const canonical = join(directory, "state", "secret");
  const original = Buffer.alloc(32, 85);
  const replacement = Buffer.alloc(32, 86);
  const backend = memoryParticipantSecretBackend();
  let replaced = false;
  try {
    await state.directory(join(directory, "state"), { recursive: true, mode: 0o700 });
    await state.write(canonical, `${encodeParticipantSecret(original)}\n`, { mode: 0o600 });
    const migrated = await loadOrCreateParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: null,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
      async migrationHook(point) {
        if (!replaced && point === "before-owner-secret-removal") {
          replaced = true;
          const staged = join(directory, "state", "same-user-replacement");
          await state.write(staged, `${encodeParticipantSecret(replacement)}\n`, { mode: 0o600 });
          await state.rename(staged, canonical);
        }
      },
    });
    assert.equal(migrated.ownerFileCleanup, "retained_changed");
    assert.equal(migrated.secretFilesRemoved, 0);
    assert.equal(migrated.secretFilesRetained, 1);
    assert.equal((await state.read(canonical, "utf8")).trim(), encodeParticipantSecret(replacement));
    assert.deepEqual(backend.stored(), original);
    const inspection = await inspectParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: null,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    assert.equal(inspection.ownerFileState, "retired_retained");
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("backend migration accepts equal dual state and refuses every disagreement", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-backend-conflict-"));
  const canonical = join(directory, "state", "secret");
  const legacy = join(directory, "legacy", "secret");
  const shared = Buffer.alloc(32, 45);
  const backend = memoryParticipantSecretBackend(shared);
  try {
    await state.directory(join(directory, "state"), { recursive: true, mode: 0o700 });
    await state.directory(join(directory, "legacy"), { recursive: true, mode: 0o700 });
    await state.write(canonical, `${encodeParticipantSecret(shared)}\n`, { mode: 0o600 });
    await state.write(legacy, `${encodeParticipantSecret(shared)}\n`, { mode: 0o600 });
    const equal = await loadOrCreateParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: legacy,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    assert.deepEqual(equal.secret, shared);
    assert.equal(equal.migrated, true);
    assert.equal(equal.secretFilesRemoved, 2);
    assert.equal(equal.secretFilesRetained, 0);
    await assert.rejects(state.read(canonical, "utf8"), { code: "ENOENT" });
    await assert.rejects(state.read(legacy, "utf8"), { code: "ENOENT" });

    await state.remove(participantSecretBackendRetirementFile(canonical));
    await state.remove(participantSecretLegacyRetirementFile(canonical));
    await state.write(legacy, `${encodeParticipantSecret(Buffer.alloc(32, 46))}\n`, { mode: 0o600 });
    const conflict = await inspectParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: legacy,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.conflict, true);
    await assert.rejects(
      loadOrCreateParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: legacy,
        participantSecretBackend: backend,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      }),
      (error) => error.code === "EXPORT_IDENTITY_CONFLICT",
    );
    assert.deepEqual(backend.stored(), shared);
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("backend rotation uses exact replacement/readback and shares the publication lease", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-backend-rotate-"));
  const canonical = join(directory, "state", "secret");
  const backend = memoryParticipantSecretBackend();
  let finishLease;
  let leaseStarted;
  const started = new Promise((resolve) => { leaseStarted = resolve; });
  const finish = new Promise((resolve) => { finishLease = resolve; });
  try {
    const created = await loadOrCreateParticipantSecret({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: null,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    const leased = withParticipantSecretLease({
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: null,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    }, async (identity) => {
      leaseStarted(identity.secret);
      await finish;
      return "published";
    });
    await started;
    await assert.rejects(
      rotateParticipantSecret({
        confirmRotation: true,
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: null,
        participantSecretBackend: backend,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      }),
      (error) => error.code === "EXPORT_IDENTITY_ROTATION_LOCKED",
    );
    finishLease();
    assert.equal(await leased, "published");

    backend.calls.length = 0;
    const rotated = await rotateParticipantSecret({
      confirmRotation: true,
      environmentSecret: null,
      secretFile: canonical,
      legacySecretFile: null,
      participantSecretBackend: backend,
      participantSecretCapability: TEST_BACKEND_CAPABILITY,
    });
    assert.equal(rotated.pseudonymsChanged, true);
    assert.notDeepEqual(rotated.secret, created.secret);
    assert.deepEqual(rotated.secret, backend.stored());
    const replaceCall = backend.calls.find(([method]) => method === "replaceExact");
    assert.deepEqual(replaceCall[2], created.secret);
    assert.deepEqual(replaceCall[3], rotated.secret);
    for (const derive of [deriveParticipantId, deriveSessionScopeId, deriveEventId,
      deriveEventOccurrenceId, deriveSnapshotId, deriveSnapshotObservationId,
      deriveQuotaStateId, deriveMarkerId, deriveMarkerOccurrenceId,
      deriveAccountScopeId, deriveModelFingerprint]) {
      assert.notEqual(derive(created.secret, "synthetic-subject"), derive(rotated.secret, "synthetic-subject"));
    }
  } finally {
    finishLease?.();
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("backend rotation failure checkpoints preserve a complete identity and release the lease", async () => {
  const canonical = join(tmpdir(), "memory-backend-checkpoints", "secret");
  const backend = memoryParticipantSecretBackend(Buffer.alloc(32, 51));
  const options = { environmentSecret: null, secretFile: canonical, legacySecretFile: null,
    confirmRotation: true, participantSecretBackend: backend,
    participantSecretCapability: TEST_BACKEND_CAPABILITY };
  const original = backend.stored();
  await assert.rejects(rotateParticipantSecret({ ...options, failpoint: "before-backend-replace" }),
    { code: "EXPORT_IDENTITY_ROTATION_FAILPOINT" });
  assert.deepEqual(backend.stored(), original);
  await assert.rejects(rotateParticipantSecret({ ...options, failpoint: "after-backend-replace" }),
    { code: "EXPORT_IDENTITY_ROTATION_FAILPOINT" });
  assert.notDeepEqual(backend.stored(), original);
  assert.equal(backend.stored().length, 32);
  assert.equal((await inspectParticipantSecret(options)).status, "ready");
  assert.equal(state.adapter.files.has(`${canonical}.rotation-lock`), false);
  const recovered = await rotateParticipantSecret(options);
  assert.deepEqual(recovered.secret, backend.stored());
});

test("participant identity leases fail when their lock is removed or replaced", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-lock-loss-"));
  const canonical = join(directory, "state", "secret");
  const backend = memoryParticipantSecretBackend(Buffer.alloc(32, 94));
  const options = {
    environmentSecret: null,
    secretFile: canonical,
    legacySecretFile: null,
    participantSecretBackend: backend,
    participantSecretCapability: TEST_BACKEND_CAPABILITY,
  };
  try {
    await assert.rejects(
      withParticipantSecretLease(options, async () => {
        await state.remove(`${canonical}.rotation-lock`);
        return "must-not-succeed";
      }),
      (error) => error.code === "EXPORT_IDENTITY_ROTATION_LOCK_LOST",
    );

    await assert.rejects(
      withParticipantSecretLease(options, async () => {
        const lockPath = `${canonical}.rotation-lock`;
        await state.remove(lockPath);
        await state.write(lockPath, "replacement\n", { mode: 0o600 });
        return "must-not-succeed";
      }),
      (error) => error.code === "EXPORT_IDENTITY_ROTATION_LOCK_LOST",
    );
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("adversarial backend failures and malformed values fail closed without content disclosure", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-backend-adversarial-"));
  const canonical = join(directory, "state", "secret");
  const canary = "DO-NOT-LEAK-adversarial-backend";
  try {
    const locked = memoryParticipantSecretBackend(null, {
      async read() {
        const error = new Error(canary);
        error.code = "export_identity_keychain_locked";
        throw error;
      },
    });
    await assert.rejects(
      inspectParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: null,
        participantSecretBackend: locked,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      }),
      (error) => {
        assert.equal(error.code, "export_identity_keychain_locked");
        assert.equal(error.message, "Participant identity backend operation failed");
        assert.equal(`${error.stack}\n${JSON.stringify(error)}`.includes(canary), false);
        return true;
      },
    );

    const migrationRequired = memoryParticipantSecretBackend(null, {
      async read() {
        const error = new Error(canary);
        error.code = "export_identity_keychain_migration_required";
        throw error;
      },
    });
    await assert.rejects(
      inspectParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: null,
        participantSecretBackend: migrationRequired,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      }),
      (error) => {
        assert.equal(
          error.code,
          "export_identity_keychain_migration_required",
        );
        assert.equal(
          error.message,
          "Participant identity backend operation failed",
        );
        assert.equal(
          `${error.stack}\n${JSON.stringify(error)}`.includes(canary),
          false,
        );
        return true;
      },
    );

    const malformedSecret = Buffer.alloc(31, 93);
    const malformed = memoryParticipantSecretBackend(null, {
      async read() { return malformedSecret; },
    });
    await assert.rejects(
      inspectParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: null,
        participantSecretBackend: malformed,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      }),
      (error) => error.code === "EXPORT_IDENTITY_BACKEND_INVALID_VALUE",
    );
    assert.deepEqual(malformedSecret, Buffer.alloc(31));

    const hostileDescription = memoryParticipantSecretBackend(null, {
      async describe() {
        return new Proxy({}, { get() { throw new Error(canary); } });
      },
    });
    await assert.rejects(
      inspectParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: null,
        participantSecretBackend: hostileDescription,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      }),
      (error) => {
        assert.equal(error.code, "EXPORT_IDENTITY_BACKEND_OPERATION_FAILED");
        assert.equal(`${error.stack}\n${JSON.stringify(error)}`.includes(canary), false);
        return true;
      },
    );
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("a same-user backend create race cannot silently replace a file identity", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-backend-create-race-"));
  const canonical = join(directory, "state", "secret");
  const expected = Buffer.alloc(32, 47);
  const racer = Buffer.alloc(32, 48);
  const backend = memoryParticipantSecretBackend();
  backend.createIfMissing = async () => {
    backend.set(racer);
    return "existing";
  };
  try {
    await state.directory(join(directory, "state"), { recursive: true, mode: 0o700 });
    await state.write(canonical, `${encodeParticipantSecret(expected)}\n`, { mode: 0o600 });
    await assert.rejects(
      loadOrCreateParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: null,
        participantSecretBackend: backend,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      }),
      (error) => error.code === "EXPORT_IDENTITY_CONFLICT",
    );
    assert.deepEqual(backend.stored(), racer);
    await assert.rejects(state.read(participantSecretBackendRetirementFile(canonical), "utf8"), { code: "ENOENT" });
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});

test("file replacement during backend migration is detected before retirement", async () => {
  const directory = await state.tempDirectory(join(tmpdir(), "app-usagemonitor-backend-file-race-"));
  const canonical = join(directory, "state", "secret");
  const expected = Buffer.alloc(32, 49);
  const replacement = Buffer.alloc(32, 50);
  const backend = memoryParticipantSecretBackend();
  const baseCreate = backend.createIfMissing;
  backend.createIfMissing = async (...args) => {
    const outcome = await baseCreate(...args);
    const staged = join(directory, "state", "replacement");
    await state.write(staged, `${encodeParticipantSecret(replacement)}\n`, { mode: 0o600 });
    await state.rename(staged, canonical);
    return outcome;
  };
  try {
    await state.directory(join(directory, "state"), { recursive: true, mode: 0o700 });
    await state.write(canonical, `${encodeParticipantSecret(expected)}\n`, { mode: 0o600 });
    await assert.rejects(
      loadOrCreateParticipantSecret({
        environmentSecret: null,
        secretFile: canonical,
        legacySecretFile: null,
        participantSecretBackend: backend,
        participantSecretCapability: TEST_BACKEND_CAPABILITY,
      }),
      (error) => error.code === "EXPORT_IDENTITY_MIGRATION_RACE",
    );
    assert.deepEqual(backend.stored(), expected);
    assert.equal((await state.read(canonical, "utf8")).trim(), encodeParticipantSecret(replacement));
    await assert.rejects(state.read(participantSecretBackendRetirementFile(canonical), "utf8"), { code: "ENOENT" });
  } finally {
    await state.remove(directory, { recursive: true, force: true });
  }
});
