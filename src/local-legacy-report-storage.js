import { createHash } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  createOwnerOnlyAtomicFilePublisher,
  loadWindowsLegacyStateReadBinding,
} from "./platform/index.js";

const MAX_MIGRATABLE_REPORT_BYTES = 16 * 1024 * 1024;
const LOCAL_STATE_DIRECTORY = ".usage-monitor";
const LOCAL_LEGACY_REPORT_DIRECTORY_NAME = "legacy-reports";
const publish = createOwnerOnlyAtomicFilePublisher();

export const LOCAL_LEGACY_REPORT_FILENAMES = Object.freeze([
  "2026-07-23-codex-weekly-limit-history-report.html",
  "2026-07-24-codex-work-account-usage-report.html",
  "2026-07-24-monitoring-quality-artifact.json",
  "2026-07-24-monitoring-quality-report.html",
  "2026-07-24-simple-quota-gradient-artifact.json",
  "2026-07-24-simple-quota-gradient-report.html",
  "2026-07-24-weekly-7-day-calibration-artifact.json",
  "2026-07-24-weekly-7-day-calibration-report.html",
  "artifact.json",
]);
const KNOWN_FILENAMES = new Set(LOCAL_LEGACY_REPORT_FILENAMES);
const absent = error => ["ENOENT", "WINDOWS_FILESYSTEM_NOT_FOUND"].includes(error?.code);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function ownError(code) {
  return Object.assign(new Error("Legacy report storage operation failed."), { code });
}
function assertKnownFilename(filename) {
  if (!KNOWN_FILENAMES.has(filename)) throw ownError("unknown_legacy_report");
}
function selectedFiles(files) {
  if (!Array.isArray(files) || files.length > LOCAL_LEGACY_REPORT_FILENAMES.length) {
    throw ownError("unknown_legacy_report");
  }
  files.forEach(assertKnownFilename);
  return [...new Set(files)].sort();
}
function assertAnchor(path, anchor) {
  if (anchor === null) return;
  const child = relative(resolve(anchor), path);
  if (child === ".." || child.startsWith(`..${sep}`) || resolve(anchor, child) !== path) {
    throw ownError("unsafe_report_path");
  }
}
function nativeBinding() {
  try { return loadWindowsLegacyStateReadBinding(); }
  catch { throw ownError("legacy_report_storage_unavailable"); }
}
function optionalInspect(native, path) {
  try { return native.inspectPath(path); }
  catch (error) { if (absent(error)) return null; throw ownError("unsafe_report_path"); }
}
function inspectChild(native, target, name) {
  try { return native.inspectProtectedChild(target.path, target.identity, name); }
  catch (error) { if (absent(error)) return null; throw ownError("unsafe_report_path"); }
}
async function withRoot(native, root, callback) {
  let held;
  try { held = native.acquireLegacyStateDirectoryGuard(root); }
  catch { throw ownError("unsafe_report_path"); }
  try { return await callback(); }
  finally { native.releaseProtectedDirectoryGuard(held.guard); }
}

// Existing native guards authenticate/pin each directory. They never repair an
// existing inherited/broad DACL. Only explicitly requested missing directories
// are created, so preview and reads cannot provision state.
async function withCanonical(native, root, create, callback) {
  const guards = [];
  try {
    for (const path of [join(root, LOCAL_STATE_DIRECTORY), localLegacyReportDirectory(root)]) {
      if (create) {
        try { native.ensureDirectory(path); }
        catch { throw ownError("unsafe_report_path"); }
      } else if (optionalInspect(native, path) === null) return await callback(null);
      let held;
      try { held = native.acquireProtectedDirectoryGuard(path); }
      catch { throw ownError("unsafe_report_path"); }
      guards.push(held);
    }
    return await callback({ path: localLegacyReportDirectory(root), identity: guards.at(-1).identity });
  } finally {
    let failure;
    for (const held of guards.reverse()) {
      try { native.releaseProtectedDirectoryGuard(held.guard); }
      catch (error) { failure ??= error; }
    }
    if (failure) throw ownError("legacy_report_storage_unavailable");
  }
}

function sameStat(left, right) {
  return ["dev", "ino", "size", "nlink", "mtimeMs", "ctimeMs"].every(key => left[key] === right[key]);
}
function boundedStat(native, lease) {
  const stat = native.statSourceFile(lease);
  if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > MAX_MIGRATABLE_REPORT_BYTES) {
    throw Object.assign(ownError("source_too_large"), { bytes: stat.size });
  }
  return stat;
}
function readFrozen(native, lease, expected = boundedStat(native, lease)) {
  const bytes = Buffer.alloc(expected.size);
  try {
    for (let offset = 0; offset < bytes.length;) {
      const requested = Math.min(65_536, bytes.length - offset);
      const part = native.readSourceFile(lease, offset, requested);
      if (!Buffer.isBuffer(part) || part.length < 1 || part.length > requested) throw ownError("source_changed");
      part.copy(bytes, offset); offset += part.length; part.fill(0);
    }
    const extra = native.readSourceFile(lease, expected.size, 1);
    if (!Buffer.isBuffer(extra) || extra.length !== 0
        || !sameStat(expected, native.statSourceFile(lease))) throw ownError("source_changed");
    return bytes;
  } catch (error) { bytes.fill(0); throw error; }
}
function sourceHash(native, lease, expected) {
  const bytes = readFrozen(native, lease, expected);
  try { return digest(bytes); } finally { bytes.fill(0); }
}
function canonicalBytes(native, target, name) {
  const metadata = inspectChild(native, target, name);
  if (metadata === null) throw ownError("report_not_found");
  const lease = native.openLegacyStateFile(join(target.path, name));
  try {
    const stat = boundedStat(native, lease);
    if (stat.dev !== metadata.identity.volumeSerialNumber || stat.ino !== metadata.identity.fileId) {
      throw ownError("source_changed");
    }
    const data = readFrozen(native, lease, stat);
    try {
      const after = inspectChild(native, target, name);
      if (after === null || JSON.stringify(after.identity) !== JSON.stringify(metadata.identity)) {
        throw ownError("source_changed");
      }
      return { data, identity: metadata.identity };
    } catch (error) { data.fill(0); throw error; }
  } finally { native.closeSourceFile(lease); }
}
function canonicalHash(native, target, name) {
  const entry = canonicalBytes(native, target, name);
  try {
    return { sha256: digest(entry.data), identity: entry.identity, bytes: entry.data.length };
  } finally { entry.data.fill(0); }
}
function safeEntry(file, state, details = {}) {
  return Object.freeze({ destination: localLegacyReportRelativePath(file), file, state, ...details });
}
function safeMigrationResult(apply, entries, status) {
  return Object.freeze({ apply, entries: Object.freeze(entries), schemaVersion: "local-legacy-report-migration-v0.1", status });
}

export function localLegacyReportDirectory(root = process.cwd()) {
  return join(resolve(root), LOCAL_STATE_DIRECTORY, LOCAL_LEGACY_REPORT_DIRECTORY_NAME);
}
export function localLegacyReportRelativePath(filename) {
  assertKnownFilename(filename);
  return `${LOCAL_STATE_DIRECTORY}/${LOCAL_LEGACY_REPORT_DIRECTORY_NAME}/${filename}`;
}
export function localLegacyReportPath(root, filename) {
  assertKnownFilename(filename);
  return join(localLegacyReportDirectory(root), filename);
}
export function legacyRootReportPath(root, filename) {
  assertKnownFilename(filename);
  return join(resolve(root), filename);
}

export async function ensureLocalLegacyReportDirectory(root = process.cwd()) {
  const native = nativeBinding(), ownerRoot = resolve(root);
  return withRoot(native, ownerRoot, () => withCanonical(native, ownerRoot, true, target => {
    for (const file of LOCAL_LEGACY_REPORT_FILENAMES) inspectChild(native, target, file);
    return target.path;
  }));
}

export async function writeLocalLegacyReport(root, filename, content) {
  assertKnownFilename(filename);
  validateContent(content);
  await ensureLocalLegacyReportDirectory(root);
  return writeLegacyReportPath(localLegacyReportPath(root, filename), content, { anchor: resolve(root) });
}

function validateContent(content) {
  if (typeof content !== "string" && !Buffer.isBuffer(content) && !(content instanceof Uint8Array)) {
    throw new TypeError("Legacy report content must be a string, Buffer, or Uint8Array");
  }
  const length = typeof content === "string" ? Buffer.byteLength(content) : content.byteLength;
  if (length > MAX_MIGRATABLE_REPORT_BYTES) throw ownError("source_too_large");
}
export async function writeLegacyReportPath(path, content, { anchor = null } = {}) {
  validateContent(content);
  const absolute = resolve(path); assertAnchor(absolute, anchor);
  const native = nativeBinding();
  let held;
  try { held = native.acquireProtectedDirectoryGuard(dirname(absolute)); }
  catch { throw ownError("unsafe_report_path"); }
  try {
    inspectChild(native, { path: dirname(absolute), identity: held.identity }, basename(absolute));
    await publish(absolute, content);
    return absolute;
  } finally { native.releaseProtectedDirectoryGuard(held.guard); }
}

export async function readLegacyReportPath(path, { anchor = null } = {}) {
  const absolute = resolve(path); assertAnchor(absolute, anchor);
  const native = nativeBinding();
  let lease;
  try {
    lease = native.openLegacyStateFile(absolute);
    const bytes = readFrozen(native, lease);
    try { return bytes.toString("utf8"); } finally { bytes.fill(0); }
  } catch (error) {
    if (absent(error)) throw ownError("report_not_found");
    if (["source_too_large", "source_changed"].includes(error?.code)) throw error;
    throw ownError("unsafe_report_path");
  } finally { if (lease) native.closeSourceFile(lease); }
}

export async function resolveLocalLegacyReportReadPath(root, filename) {
  assertKnownFilename(filename);
  const ownerRoot = resolve(root), native = nativeBinding();
  return withRoot(native, ownerRoot, () => withCanonical(native, ownerRoot, false, target => {
    if (target !== null && inspectChild(native, target, filename) !== null) return localLegacyReportPath(root, filename);
    const legacy = legacyRootReportPath(root, filename), metadata = optionalInspect(native, legacy);
    if (metadata !== null && (!metadata.isRegularFile || metadata.isReparsePoint
        || !metadata.ownerMatches || metadata.identity.linkCount !== 1)) throw ownError("unsafe_report_path");
    return legacy;
  }));
}
export async function readLocalLegacyReport(root, filename) {
  assertKnownFilename(filename);
  const native = nativeBinding(), ownerRoot = resolve(root);
  return withRoot(native, ownerRoot, () => withCanonical(native, ownerRoot, false, target => {
    if (target !== null && inspectChild(native, target, filename) !== null) {
      const entry = canonicalBytes(native, target, filename);
      try { return entry.data.toString("utf8"); } finally { entry.data.fill(0); }
    }
    return readLegacyReportPath(legacyRootReportPath(root, filename), { anchor: ownerRoot });
  }));
}

async function inspectOne(native, root, file, sources) {
  let target, source;
  try {
    target = await withCanonical(native, root, false, directory => {
      if (directory === null || inspectChild(native, directory, file) === null) return null;
      return canonicalHash(native, directory, file);
    });
  } catch { return safeEntry(file, "destination_invalid"); }
  const path = legacyRootReportPath(root, file);
  let metadata;
  try { metadata = optionalInspect(native, path); }
  catch { return safeEntry(file, "unsafe_source"); }
  if (metadata === null) return safeEntry(file, target === null ? "absent" : "already_migrated");
  if (!metadata.isRegularFile || metadata.isReparsePoint) return safeEntry(file, "unsafe_source");
  if (!metadata.ownerMatches) return safeEntry(file, "foreign_owner");
  if (metadata.identity.linkCount !== 1) return safeEntry(file, "multiple_hard_links");
  try {
    source = native.openLegacyStateFile(path);
    const stat = boundedStat(native, source);
    if (stat.dev !== metadata.identity.volumeSerialNumber || stat.ino !== metadata.identity.fileId) {
      throw ownError("source_changed");
    }
    const sha256 = sourceHash(native, source, stat);
    if (target !== null) {
      return safeEntry(file, target.bytes === stat.size && target.sha256 === sha256 ? "already_migrated" : "destination_conflict");
    }
    sources.set(file, { lease: source, stat }); source = null;
    return safeEntry(file, "migratable", { bytes: stat.size, sha256 });
  } catch (error) {
    if (error?.code === "source_too_large") return safeEntry(file, "source_too_large", { bytes: error.bytes });
    return safeEntry(file, ["source_changed", "WINDOWS_FILESYSTEM_ACCESS_DENIED", "WINDOWS_FILESYSTEM_SOURCE_BUSY"].includes(error?.code)
      ? "source_changed" : "unsafe_source");
  } finally { if (source) native.closeSourceFile(source); }
}

async function withInspection({ files, root }, callback) {
  const names = selectedFiles(files), native = nativeBinding(), ownerRoot = resolve(root);
  const sources = new Map();
  return withRoot(native, ownerRoot, async () => {
    try {
      const entries = [];
      // Bound both retained leases and aggregate bytes by the fixed nine-file
      // inventory and per-file 16 MiB limit. Freeze every source before writes.
      for (const file of names) entries.push(await inspectOne(native, ownerRoot, file, sources));
      return await callback({ native, root: ownerRoot, entries, sources });
    } finally {
      let failure;
      for (const source of [...sources.values()].reverse()) {
        try { native.closeSourceFile(source.lease); } catch (error) { failure ??= error; }
      }
      if (failure) throw ownError("legacy_report_storage_unavailable");
    }
  });
}

export async function inspectLocalLegacyReportMigration({
  files = LOCAL_LEGACY_REPORT_FILENAMES, root = process.cwd(),
} = {}) {
  return withInspection({ files, root }, ({ entries }) => safeMigrationResult(false, entries,
    entries.some(entry => entry.state === "migratable") ? "ready" : "nothing_to_migrate"));
}

/**
 * Explicit copy-first migration. Sources and ACLs stay unchanged. Exclusive
 * native creation/readback preserves verified partial copies on interruption;
 * repeat inspection accepts only safe exact copies and never overwrites them.
 * Existing v0.1 `migrated` means verified canonical placement, not deletion.
 */
export async function migrateLocalLegacyReports({
  apply = false, files = LOCAL_LEGACY_REPORT_FILENAMES, root = process.cwd(),
} = {}) {
  if (!apply) return inspectLocalLegacyReportMigration({ files, root });
  return withInspection({ files, root }, async ({ native, root: ownerRoot, entries, sources }) => {
    if (entries.some(entry => !["absent", "already_migrated", "migratable"].includes(entry.state))) {
      return safeMigrationResult(true, entries, "blocked");
    }
    if (sources.size === 0) return safeMigrationResult(true, entries, "nothing_to_migrate");
    const copied = new Set();
    let attempted = false;
    try {
      await withCanonical(native, ownerRoot, true, target => {
        for (const entry of entries.filter(value => value.state === "migratable")) {
          const { lease, stat } = sources.get(entry.file);
          if (sourceHash(native, lease, stat) !== entry.sha256) throw ownError("source_changed");
          // Never unlink by pathname or overwrite a concurrently created file.
          attempted = true;
          const identity = native.copyLegacyStateFile(lease, target.path, target.identity, entry.file);
          const persisted = canonicalHash(native, target, entry.file);
          if (persisted.bytes !== entry.bytes || persisted.sha256 !== entry.sha256
              || JSON.stringify(identity) !== JSON.stringify(persisted.identity)
              || sourceHash(native, lease, stat) !== entry.sha256) throw ownError("source_changed");
          copied.add(entry.file);
        }
      });
      return safeMigrationResult(true, entries.map(entry => copied.has(entry.file)
        ? safeEntry(entry.file, "migrated", { bytes: entry.bytes, sha256: entry.sha256 }) : entry), "migrated");
    } catch (error) {
      return safeMigrationResult(true, entries.map(entry => copied.has(entry.file)
        ? safeEntry(entry.file, "migrated", { bytes: entry.bytes, sha256: entry.sha256 }) : entry),
      attempted ? "recovery_required" : error?.code === "source_changed" ? "source_changed" : "failed_without_move");
    }
  });
}
