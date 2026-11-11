// The device salt and the local one-way digests derived from it.
//
// The salt file keeps its historical name (`local-unified-index-device-salt-v1`):
// it is the durable root of local and hosted pseudonym continuity and must
// never be rotated, renamed or regenerated. Every index generation, past and
// future, derives its join keys from it.

import { createHmac, createSecretKey } from "node:crypto";
import { dirname, resolve } from "node:path";
import { readExistingDeviceSalt as readIndexSalt, readOrCreateDeviceSalt as createIndexSalt } from "./local-index-identity.js";

const MAX_SECRET_BYTES = 256;

const LOCAL_DIGEST_KEYS = new WeakMap();

function fixedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function defaultLocalUnifiedIndexPath(root = process.cwd()) {
  return resolve(root, ".usage-monitor", "local-unified-index-v1.sqlite");
}

export function defaultLocalUnifiedIndexSecretPath(
  indexFile = defaultLocalUnifiedIndexPath(),
) {
  return resolve(dirname(resolve(indexFile)), "local-unified-index-device-salt-v1");
}

function saltFailure(error) {
  return fixedError(error?.code === "local_index_secret_invalid"
    ? "local_unified_index_secret_invalid" : "local_unified_index_secret_unavailable");
}

/**
 * The device salt. 32 random bytes, owner-only, created once and never
 * rotated: it is the key for `session_local`, which is the join key of the
 * whole index. Rotation is deliberately not offered — the value it protects
 * never leaves this machine, and rotating it would orphan every stored row.
 */
export async function readOrCreateDeviceSalt(
  secretFile = defaultLocalUnifiedIndexSecretPath(),
) {
  try { return await createIndexSalt(secretFile); }
  catch (error) { throw saltFailure(error); }
}

/**
 * Read an existing device salt without creating directories, changing mode,
 * or otherwise mutating the path. Recovery preparation uses this stricter
 * operation so a missing or damaged live identity cannot be silently repaired
 * while constructing a candidate.
 */
export async function readExistingDeviceSalt(
  secretFile = defaultLocalUnifiedIndexSecretPath(),
) {
  try { return await readIndexSalt(secretFile); }
  catch (error) { throw saltFailure(error); }
}

function reusableLocalDigestKey(deviceSalt) {
  const bytes = Buffer.isBuffer(deviceSalt)
    ? deviceSalt
    : new Uint8Array(
      deviceSalt.buffer,
      deviceSalt.byteOffset,
      deviceSalt.byteLength,
    );
  // `localDigest` remains a general byte-buffer API. Only retain key material
  // inside the same bound enforced for an on-disk device secret; unusually
  // large caller-owned buffers keep the one-shot behavior.
  if (bytes.byteLength > MAX_SECRET_BYTES) return deviceSalt;
  let cached = LOCAL_DIGEST_KEYS.get(deviceSalt);
  if (cached === undefined || !cached.bytes.equals(bytes)) {
    cached = {
      // Keep a comparison copy so a caller that mutates a supplied view gets a
      // freshly keyed digest, exactly as it did before this cache existed.
      bytes: Buffer.from(bytes),
      key: createSecretKey(bytes),
    };
    LOCAL_DIGEST_KEYS.set(deviceSalt, cached);
  }
  return cached.key;
}

/**
 * The single local one-way derivation used by this index.
 *
 * Domain-separated exactly as the rest of the product does it: a
 * NUL-terminated `app-usagemonitor/<domain>/v1\0` label is committed before the
 * subject, so a session id can never collide with an account scope id.
 * Returns 32 raw bytes; the old shape stored 64 hex characters for the same
 * information.
 */
export function localDigest(deviceSalt, domain, subject) {
  if (!Buffer.isBuffer(deviceSalt) && !ArrayBuffer.isView(deviceSalt)) {
    throw new TypeError("deviceSalt must be a byte buffer");
  }
  if (typeof domain !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(domain)) {
    throw new TypeError("domain must be a short lowercase label");
  }
  if (typeof subject !== "string" || subject.length < 1 || subject.length > 4096) {
    throw new TypeError("subject must be a bounded string");
  }
  return createHmac("sha256", reusableLocalDigestKey(deviceSalt))
    .update(`app-usagemonitor/${domain}/v1\0`, "utf8")
    .update(subject, "utf8")
    .digest();
}

export function sessionLocal(deviceSalt, codexSessionId) {
  return localDigest(deviceSalt, "unified-index-session", codexSessionId);
}

export function scopeLocal(deviceSalt, accountScopeId) {
  return localDigest(deviceSalt, "unified-index-scope", accountScopeId);
}

export function sourceLocal(deviceSalt, rolloutKey) {
  return localDigest(deviceSalt, "unified-index-source", rolloutKey);
}

/**
 * A persisted fork-replay snapshot key. The raw key is a "|"-joined tuple of
 * cumulative token counters; membership is the only question the boundary
 * check ever asks, so what is stored is a salted digest of it.
 */
export function snapshotLocal(deviceSalt, snapshotKey) {
  return localDigest(deviceSalt, "unified-index-snapshot", snapshotKey);
}
