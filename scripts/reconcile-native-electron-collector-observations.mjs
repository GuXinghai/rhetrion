#!/usr/bin/env node
/**
 * Reconciles a stopped native collector-state copy into an Electron
 * collector-state copy. It is deliberately not a migration entrypoint:
 * callers must first make three private, stopped-state copies in one 0700
 * directory. The live application paths are never accepted by this tool.
 *
 * Default mode is read-only. `--apply-to-private-copy` appends only source
 * record multiplicities missing from the Electron copy and leaves the
 * Electron checkpoint and all other metadata unchanged. Repeating explicit
 * apply resumes only an authenticated operation in the same private copy.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  forEachLocalCollectorRecord,
  inspectLocalCollectorStateStorage,
  openLocalCollectorStateSession,
  readLocalCollectorState,
} from "../src/local-collector-state.js";
import { stableJson } from "../src/storage.js";
import { loadWindowsReleaseOperationBinding } from "../src/platform/index.js";
import { openOperation } from "./lib/release-operation.mjs";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCHEMA = "usagemonitor-native-electron-collector-reconciliation-v1";
const PROOF_SCHEMA = "usagemonitor-native-electron-collector-conservation-r9-v1";
const PROOF_INSPECTION = "read-only";
const PROOF_SCOPE = "stopped-native-r9-versus-current-electron";
const MAX_PROOF_BYTES = 256 * 1024;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const COPY_NAMES = Object.freeze({
  native: "native-local-collector-state-v1.sqlite",
  electron: "electron-local-collector-state-v1.sqlite",
  electronBefore: "electron-local-collector-state-before-reconcile.sqlite",
});
const RECEIPT_NAME = "collector-reconciliation-receipt-v1.json";
const PENDING_NAME = `${RECEIPT_NAME}.pending`;

function fail(message, code = "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function checkpointDigest(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? sha256(stableJson(value))
    : null;
}

function metaDigest(value) {
  return sha256(stableJson(value));
}

function recordKey(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail("collector record is invalid", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_STATE_INVALID");
  }
  const kind = typeof record.kind === "string" ? record.kind : "unknown";
  return `${kind}\0${sha256(stableJson(record))}`;
}

function safeAbsolutePath(value, option) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(`${option} must be an absolute path`);
  }
  const path = resolve(value);
  if (path === value || value.startsWith("/")) return path;
  fail(`${option} must be an absolute path`);
}

function samePath(left, right) {
  return resolve(left) === resolve(right);
}

async function privateRegularFile(path, { maximumBytes = Number.MAX_SAFE_INTEGER } = {}) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail("private reconciliation input is unavailable", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_UNAVAILABLE");
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
      || metadata.size < 1 || metadata.size > maximumBytes
      || (typeof process.getuid === "function" && metadata.uid !== process.getuid())
      || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)) {
    fail("private reconciliation input is unsafe", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_UNSAFE");
  }
  await realpath(path).catch(() => fail(
    "private reconciliation input cannot be resolved",
    "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_UNSAFE",
  ));
  return metadata;
}

async function privateDirectory(path) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail("copy root is unavailable", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_COPY_ROOT_UNAVAILABLE");
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()
      || (typeof process.getuid === "function" && metadata.uid !== process.getuid())
      || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)) {
    fail("copy root is unsafe", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_COPY_ROOT_UNSAFE");
  }
  return await realpath(path).catch(() => fail(
    "copy root cannot be resolved", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_COPY_ROOT_UNSAFE",
  ));
}

function copyPaths(copyRoot) {
  return Object.freeze({
    native: join(copyRoot, COPY_NAMES.native),
    electron: join(copyRoot, COPY_NAMES.electron),
    electronBefore: join(copyRoot, COPY_NAMES.electronBefore),
    receipt: join(copyRoot, RECEIPT_NAME),
  });
}

async function regularProof(path, native) {
  await privateRegularFile(path, { maximumBytes: MAX_PROOF_BYTES });
  let value, bytes;
  try {
    const parent = native.inspectPath(dirname(path));
    bytes = native.readProtectedChild(dirname(path), parent.identity, basename(path), MAX_PROOF_BYTES).data;
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("identity conservation proof is invalid", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_PROOF_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.schema !== PROOF_SCHEMA || value.inspection !== PROOF_INSPECTION
      || value.scope !== PROOF_SCOPE || value.saltMatches !== true
      || !Number.isSafeInteger(value.nativeRows) || value.nativeRows < 0
      || !Number.isSafeInteger(value.electronRows) || value.electronRows < 0) {
    fail("identity conservation proof is not accepted", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_PROOF_INVALID");
  }
  return Object.freeze({ nativeRows: value.nativeRows, electronRows: value.electronRows, sha256: sha256(bytes) });
}

async function hashFile(path) {
  const handle = await open(path, constants.O_RDONLY | NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1) {
      fail("private reconciliation input changed", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_CHANGED");
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.dev !== before.dev || after.ino !== before.ino) {
      fail("private reconciliation input changed", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_CHANGED");
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

async function stateSummary(stateFile) {
  const [state, storage] = await Promise.all([
    readLocalCollectorState({ stateFile, includeRecords: false }),
    inspectLocalCollectorStateStorage({ stateFile }),
  ]);
  if (state.status !== "available" || storage.status !== "available"
      || checkpointDigest(state.checkpoint) === null) {
    fail("collector-state copy is incomplete", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_STATE_INVALID");
  }
  return Object.freeze({
    recordCount: storage.recordCount,
    checkpointDigest: checkpointDigest(state.checkpoint),
    accountingCacheDigest: metaDigest(state.accountingCache),
    legacyRefreshUseDigest: metaDigest(state.legacyRefreshUse),
    migrationDigest: metaDigest(state.migration),
    checkpoint: state.checkpoint,
  });
}

async function multiset(stateFile) {
  const counts = new Map();
  const result = await forEachLocalCollectorRecord({
    stateFile,
    onRecord(record) {
      const key = recordKey(record);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    },
  });
  if (result.status !== "available") {
    fail("collector-state copy is unavailable", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_STATE_INVALID");
  }
  return counts;
}

async function missingRecords({ sourceFile, destinationFile, onMissing = null }) {
  const available = await multiset(destinationFile);
  let sourceRecords = 0;
  let missing = 0;
  const sourceResult = await forEachLocalCollectorRecord({
    stateFile: sourceFile,
    async onRecord(record) {
      sourceRecords += 1;
      const key = recordKey(record);
      const count = available.get(key) ?? 0;
      if (count > 0) {
        if (count === 1) available.delete(key);
        else available.set(key, count - 1);
        return;
      }
      missing += 1;
      if (onMissing !== null) await onMissing(record);
    },
  });
  if (sourceResult.status !== "available") {
    fail("source collector-state copy is unavailable", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_SOURCE_UNAVAILABLE");
  }
  return Object.freeze({ sourceRecords, missing });
}

function sameStateMetadata(left, right) {
  return left.checkpointDigest === right.checkpointDigest
    && left.accountingCacheDigest === right.accountingCacheDigest
    && left.legacyRefreshUseDigest === right.legacyRefreshUseDigest
    && left.migrationDigest === right.migrationDigest;
}

function optionalProtectedRead(context, name) {
  try {
    return context.native.readProtectedChild(context.root, context.rootIdentity, name, MAX_PROOF_BYTES);
  } catch (error) {
    if (["ENOENT", "WINDOWS_FILESYSTEM_NOT_FOUND"].includes(error?.code)) return null;
    fail("reconciliation evidence is unsafe", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE");
  }
}

function receiptValue(entry) {
  try { return JSON.parse(entry.data.toString("utf8")); }
  catch { fail("reconciliation receipt is invalid", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE"); }
}

function receiptBytes(value) { return Buffer.from(`${stableJson(value)}\n`, "utf8"); }

function assertReceipt(entry, expected) {
  if (entry === null || stableJson(receiptValue(entry)) !== stableJson(expected)) {
    fail("reconciliation receipt does not match this operation", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE");
  }
}

function sameIdentity(left, right) { return stableJson(left) === stableJson(right); }

async function withPrivateCopies(copyRoot, callback) {
  const root = await privateDirectory(safeAbsolutePath(copyRoot, "--copy-root"));
  let native, lease;
  try {
    native = loadWindowsReleaseOperationBinding();
    lease = native.acquireProtectedDirectoryGuard(root);
  } catch {
    fail("protected private-copy access is unavailable", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_UNSAFE");
  }
  const guards = [];
  try {
    for (const name of Object.values(COPY_NAMES)) {
      await privateRegularFile(join(root, name));
      try { guards.push(native.acquireProtectedChildGuard(root, lease.identity, name).guard); }
      catch { fail("private reconciliation input is unsafe", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_UNSAFE"); }
    }
    return await callback({ native, root, rootIdentity: lease.identity, paths: copyPaths(root) });
  } finally {
    let releaseError;
    for (const guard of guards.reverse()) {
      try { native.releaseCredentialAuditFileGuard(guard); }
      catch (error) { releaseError ??= error; }
    }
    try { native.releaseProtectedDirectoryGuard(lease.guard); }
    catch (error) { releaseError ??= error; }
    if (releaseError) throw releaseError;
  }
}

// The native expected-identity replacement owns bounded retries of only its
// uncommitted rename. Never retry append, unlink the old receipt, or replay an
// uncertain publication. The protected pending value survives a failed call.
function updateReceipt(context, current, value) {
  const { native, root, rootIdentity } = context;
  const bytes = receiptBytes(value);
  let pending = optionalProtectedRead(context, PENDING_NAME);
  if (pending === null) {
    native.createProtectedChild(root, rootIdentity, PENDING_NAME, bytes);
    pending = optionalProtectedRead(context, PENDING_NAME);
  }
  assertReceipt(pending, value);
  const observed = optionalProtectedRead(context, RECEIPT_NAME);
  if (observed === null || !sameIdentity(current.identity, observed.identity)
      || !current.data.equals(observed.data)) {
    fail("reconciliation receipt changed", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE");
  }
  if (!observed.data.equals(bytes)) {
    native.replaceProtectedChild(root, rootIdentity, RECEIPT_NAME, current.identity, bytes);
    assertReceipt(optionalProtectedRead(context, RECEIPT_NAME), value);
  }
  native.deleteProtectedChild(root, rootIdentity, PENDING_NAME, pending.identity);
}

function contentFreeResult({ source, destination, missing, applied, inserted = 0, conservation = null }) {
  return Object.freeze({
    schema: SCHEMA,
    status: applied ? "reconciled_private_copy" : "planned_private_copy_only",
    sourceRecordCount: source.recordCount,
    destinationRecordCountBefore: destination.recordCount,
    missingSourceRecordMultiplicity: missing,
    identitySaltProven: true,
    destinationCheckpointPreserved: applied ? conservation?.checkpointPreserved ?? false : null,
    destinationMetadataPreserved: applied ? conservation?.metadataPreserved ?? false : null,
    destinationExistingRecordsPreserved: applied ? conservation?.existingRecordsPreserved ?? false : null,
    insertedRecordMultiplicity: inserted,
    destinationRecordCountAfter: conservation?.recordCountAfter ?? destination.recordCount,
  });
}

async function preflight(context, { conservationProof, resume = false }) {
  const { root, paths, native: filesystem } = context;
  const receipt = optionalProtectedRead(context, RECEIPT_NAME);
  const operation = optionalProtectedRead(context, "operation.json");
  if ((!resume && operation !== null) || (receipt !== null && (!resume || operation === null))) {
    fail("reconciliation receipt requires a matching operation", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_EXISTS");
  }
  const proofPath = safeAbsolutePath(
    conservationProof ?? join(root, "collector-conservation.json"),
    "--conservation-proof",
  );
  const proof = await regularProof(proofPath, filesystem);
  const [native, electron, electronBefore] = await Promise.all([
    stateSummary(paths.native), stateSummary(paths.electron), stateSummary(paths.electronBefore),
  ]);
  if (proof.nativeRows !== native.recordCount || proof.electronRows !== electronBefore.recordCount
      || !sameStateMetadata(electronBefore, electron)) {
    fail("private copies do not match the accepted conservation proof", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_PROOF_MISMATCH");
  }
  const [electronHash, beforeHash] = await Promise.all([hashFile(paths.electron), hashFile(paths.electronBefore)]);
  if (operation === null && electronHash !== beforeHash) {
    fail("Electron baseline copy does not match destination copy", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_BASELINE_MISMATCH");
  }
  const nativeHash = await hashFile(paths.native);
  const missing = await missingRecords({ sourceFile: paths.native, destinationFile: paths.electronBefore });
  const binding = {
    schema: SCHEMA, rootIdentity: context.rootIdentity,
    files: Object.fromEntries(Object.entries(COPY_NAMES).map(([key, name]) => [
      key, filesystem.inspectProtectedChild(root, context.rootIdentity, name).identity,
    ])),
    sourceSha256: nativeHash, baselineSha256: beforeHash, proofSha256: proof.sha256,
    checkpointDigest: electronBefore.checkpointDigest,
  };
  return Object.freeze({ paths, native, electronBefore, operation, binding, proofPath,
    proofHash: proof.sha256, filesystem,
    baselineHash: beforeHash, nativeHash, missing: missing.missing });
}

export async function planNativeElectronCollectorReconciliation(options = {}) {
  return withPrivateCopies(options.copyRoot, async context => {
    const prepared = await preflight(context, options);
    await verifyInputs(prepared);
    return contentFreeResult({ source: prepared.native, destination: prepared.electronBefore,
      missing: prepared.missing, applied: false });
  });
}

async function verifyInputs(prepared) {
  if (await hashFile(prepared.paths.native) !== prepared.nativeHash
      || await hashFile(prepared.paths.electronBefore) !== prepared.baselineHash
      || (await regularProof(prepared.proofPath, prepared.filesystem)).sha256 !== prepared.proofHash) {
    fail("private reconciliation input changed", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_INPUT_CHANGED");
  }
}

async function verifyDestination(prepared, { complete = false } = {}) {
  const baseline = await multiset(prepared.paths.electronBefore);
  const source = await multiset(prepared.paths.native);
  const destination = await multiset(prepared.paths.electron);
  for (const [key, count] of baseline) {
    if ((destination.get(key) ?? 0) < count) {
      fail("baseline records changed", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONSERVATION_FAILED");
    }
  }
  for (const [key, count] of destination) {
    if (count > Math.max(baseline.get(key) ?? 0, source.get(key) ?? 0)) {
      fail("destination has unrelated records", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONSERVATION_FAILED");
    }
  }
  const after = await stateSummary(prepared.paths.electron);
  const inserted = after.recordCount - prepared.electronBefore.recordCount;
  if (!sameStateMetadata(after, prepared.electronBefore) || inserted < 0 || inserted > prepared.missing
      || (complete && inserted !== prepared.missing)) {
    fail("private-copy conservation failed", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONSERVATION_FAILED");
  }
  await verifyInputs(prepared);
  return { inserted };
}

function initialReceipt(prepared) {
  return {
    schema: SCHEMA,
    status: "preflight_passed",
    sourceRecordCount: prepared.native.recordCount,
    destinationRecordCountBefore: prepared.electronBefore.recordCount,
    missingSourceRecordMultiplicity: prepared.missing,
    identitySaltProven: true,
    destinationCheckpointDigest: prepared.electronBefore.checkpointDigest,
    destinationBaselineSha256: prepared.baselineHash,
  };
}

function completedReceipt(prepared) {
  const result = contentFreeResult({
    source: prepared.native,
    destination: prepared.electronBefore,
    missing: prepared.missing,
    applied: true,
    inserted: prepared.missing,
    conservation: { checkpointPreserved: true, metadataPreserved: true,
      existingRecordsPreserved: true, recordCountAfter: prepared.electronBefore.recordCount + prepared.missing },
  });
  return { ...initialReceipt(prepared), status: "verified", insertedRecordMultiplicity: prepared.missing, result };
}

export async function reconcileNativeElectronCollectorPrivateCopy({
  copyRoot, conservationProof = null, confirmAppendOnlyPrivateCopy = false,
  openStateSession = openLocalCollectorStateSession,
} = {}) {
  if (confirmAppendOnlyPrivateCopy !== true) {
    fail("private-copy reconciliation requires explicit confirmation", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONFIRMATION_REQUIRED");
  }
  if (typeof openStateSession !== "function") throw new TypeError("State session factory must be a function");
  return withPrivateCopies(copyRoot, async context => {
    const prepared = await preflight(context, { conservationProof, resume: true });
    // Existing source-bound operation journal and OS-backed mutex serialize
    // cooperating processes, including restart. No new durable format is used.
    const operation = await openOperation({ directory: context.root, kind: "maintenance",
      binding: prepared.binding, resume: prepared.operation !== null });
    try {
      const destination = await verifyDestination(prepared);
      const initial = initialReceipt(prepared), completed = completedReceipt(prepared);
      let current = optionalProtectedRead(context, RECEIPT_NAME);
      const pending = optionalProtectedRead(context, PENDING_NAME);
      if (pending !== null) {
        assertReceipt(pending, completed);
        if (destination.inserted !== prepared.missing) {
          fail("pending receipt does not match destination", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE");
        }
      }
      if (current === null) {
        if (pending !== null || destination.inserted !== 0) {
          fail("reconciliation receipt is missing", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_RECEIPT_UNSAFE");
        }
        context.native.createProtectedChild(context.root, context.rootIdentity, RECEIPT_NAME, receiptBytes(initial));
        current = optionalProtectedRead(context, RECEIPT_NAME);
      }
      const value = receiptValue(current);
      assertReceipt(current, value?.status === "verified" ? completed : initial);
      if (value.status === "verified") {
        await verifyDestination(prepared, { complete: true });
        if (pending !== null) updateReceipt(context, current, completed);
        return completed.result;
      }
      if (destination.inserted < prepared.missing) {
        const session = await openStateSession({ stateFile: prepared.paths.electron });
        let batch = [];
        try {
          await missingRecords({ sourceFile: prepared.paths.native, destinationFile: prepared.paths.electron,
            async onMissing(record) {
              batch.push(record);
              if (batch.length >= 256) {
                session.commit({ checkpoint: prepared.electronBefore.checkpoint, records: batch });
                batch = [];
              }
            } });
          if (batch.length > 0) session.commit({ checkpoint: prepared.electronBefore.checkpoint, records: batch });
        } finally { await session.close(); }
      }
      await verifyDestination(prepared, { complete: true });
      updateReceipt(context, current, completed);
      return completed.result;
    } finally { operation.close(); }
  });
}

export function parseNativeElectronCollectorReconciliationArguments(argv) {
  if (!Array.isArray(argv)) throw new TypeError("collector reconciliation arguments must be an array");
  const options = { copyRoot: null, conservationProof: null, apply: false, confirm: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--copy-root") options.copyRoot = argv[++index] ?? null;
    else if (value === "--conservation-proof") options.conservationProof = argv[++index] ?? null;
    else if (value === "--apply-to-private-copy") options.apply = true;
    else if (value === "--confirm-append-only-private-copy") options.confirm = true;
    else fail("collector reconciliation arguments are invalid");
  }
  if (typeof options.copyRoot !== "string" || options.copyRoot.length === 0) {
    fail("collector reconciliation requires --copy-root");
  }
  if (options.confirm && !options.apply) fail("confirmation requires --apply-to-private-copy");
  if (options.apply && !options.confirm) {
    fail("private-copy reconciliation requires --confirm-append-only-private-copy", "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_CONFIRMATION_REQUIRED");
  }
  return Object.freeze(options);
}

async function main() {
  const options = parseNativeElectronCollectorReconciliationArguments(process.argv.slice(2));
  const result = options.apply
    ? await reconcileNativeElectronCollectorPrivateCopy({
      copyRoot: options.copyRoot,
      conservationProof: options.conservationProof,
      confirmAppendOnlyPrivateCopy: options.confirm,
    })
    : await planNativeElectronCollectorReconciliation({
      copyRoot: options.copyRoot,
      conservationProof: options.conservationProof,
    });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && samePath(resolve(process.argv[1]), SCRIPT_FILE)) {
  main().catch((error) => {
    process.stderr.write(`${error?.code ?? "NATIVE_ELECTRON_COLLECTOR_RECONCILIATION_FAILED"}\n`);
    process.exitCode = 1;
  });
}
