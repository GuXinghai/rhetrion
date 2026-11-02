import { createHash, createHmac } from "node:crypto";
import { openLocalIndexStore, withReadSnapshot } from "./local-index-store.js";

// A window is a fixed UTC day. The receipt is a content-free proof of which
// committed facts belong to the window; it is not a second fact ledger.
export const ACCOUNTING_WINDOW_MS = 86_400_000;
export const ACCOUNTING_WINDOW_RECEIPT_VERSION = 1;
export const ACCOUNTING_WINDOW_ALGORITHM_VERSION = 1;
const DOMAIN = "rhetrion-accounting-window-v1";
const MAX_DATE_MS = 8_640_000_000_000_000;

const USAGE_FIELDS = [
  "source_id", "source_offset", "observed_at_ms", "event_key", "session_id",
  "account_scope_id", "model_id", "tier_id", "surface_id",
  "quota_observation_id", "tier_observed_at_ms", "reasoning_effort", "flags",
  "work_directory_id", "tokens_in_uncached", "tokens_in_cache_read",
  "tokens_in_cache_write", "tokens_out_text", "tokens_out_reasoning",
  "tokens_out_combined", "total_input_context",
];
const QUOTA_FIELDS = [
  "source_id", "source_offset", "slot_order", "observed_at_ms", "provider",
  "plan_type", "limit_id", "slot", "used_percent", "resets_at_ms",
  "duration_mins", "admission",
];

const USAGE_SQL = `SELECT ${USAGE_FIELDS.map(field => field === "event_key"
  ? "hex(event_key) AS event_key" : field).join(",")}
  FROM usage_event
  ORDER BY observed_at_ms, source_id, source_offset`;
const QUOTA_SQL = `SELECT ${QUOTA_FIELDS.join(",")}
  FROM quota_occurrence
  ORDER BY observed_at_ms, source_id, source_offset, slot_order`;

function fixedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createDigest(hmacKey) {
  return hmacKey === null ? createHash("sha256") : createHmac("sha256", hmacKey);
}

function normalizeHmacKey(hmacKey) {
  if (hmacKey === undefined || hmacKey === null) return null;
  if (typeof hmacKey === "string") {
    if (hmacKey.length === 0 || hmacKey.length > 4096) {
      throw new TypeError("accounting window HMAC key is invalid");
    }
    return hmacKey;
  }
  if (Buffer.isBuffer(hmacKey) || hmacKey instanceof Uint8Array) {
    if (hmacKey.length === 0 || hmacKey.length > 4096) {
      throw new TypeError("accounting window HMAC key is invalid");
    }
    return hmacKey;
  }
  throw new TypeError("accounting window HMAC key is invalid");
}

function windowKey(atMs) {
  if (!Number.isSafeInteger(atMs) || atMs < 0 || atMs > MAX_DATE_MS) {
    throw fixedError("accounting_window_fact_time_invalid");
  }
  const date = new Date(atMs);
  if (!Number.isFinite(date.getTime())) throw fixedError("accounting_window_fact_time_invalid");
  return date.toISOString().slice(0, 10);
}

function windowBounds(key) {
  const lowerMs = Date.parse(`${key}T00:00:00.000Z`);
  if (!Number.isSafeInteger(lowerMs) || new Date(lowerMs).toISOString().slice(0, 10) !== key) {
    throw fixedError("accounting_window_key_invalid");
  }
  return { lowerMs, upperMs: lowerMs + ACCOUNTING_WINDOW_MS };
}

function newWindow(key) {
  return {
    key,
    ...windowBounds(key),
    usageCount: 0,
    quotaCount: 0,
    usageHash: null,
    quotaHash: null,
  };
}

function windowFor(state, key) {
  let value = state.get(key);
  if (value === undefined) {
    value = newWindow(key);
    state.set(key, value);
  }
  return value;
}

function hashRow(hash, row) {
  hash.update(JSON.stringify(row));
  hash.update("\n");
}

function finalizeWindow(window, hmacKey) {
  const usageCount = window.usageCount;
  const quotaCount = window.quotaCount;
  const usageDigest = (window.usageHash ?? createDigest(hmacKey)).digest("hex");
  const quotaDigest = (window.quotaHash ?? createDigest(hmacKey)).digest("hex");
  const final = createDigest(hmacKey);
  final.update(`${DOMAIN}\0${ACCOUNTING_WINDOW_RECEIPT_VERSION}\0`);
  final.update(`${window.key}\0${window.lowerMs}\0${window.upperMs}\0`);
  final.update(`${usageCount}\0${quotaCount}\0${usageDigest}\0${quotaDigest}`);
  return {
    key: window.key,
    lowerMs: window.lowerMs,
    upperMs: window.upperMs,
    usageCount,
    quotaCount,
    factCount: usageCount + quotaCount,
    factDigest: final.digest("hex"),
  };
}

/**
 * Build content-free per-window receipts from committed index facts.
 *
 * The function is read-only and does not consult the accounting cache. It is a
 * shadow/audit primitive until a caller explicitly consumes the receipts.
 */
export function createAccountingWindowReceipts({ indexFile, hmacKey = null, signal = null } = {}) {
  if (typeof indexFile !== "string" || indexFile.length === 0) {
    throw new TypeError("accounting window indexFile is invalid");
  }
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const key = normalizeHmacKey(hmacKey);
  const database = openLocalIndexStore(indexFile, { readOnly: true });
  try {
    return withReadSnapshot(database, ({ commitSeq }) => {
      const state = new Map();
      const usage = database.prepare(USAGE_SQL);
      for (const row of usage.iterate()) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const observedAtMs = row.observed_at_ms;
        const window = windowFor(state, windowKey(observedAtMs));
        if (window.usageHash === null) window.usageHash = createDigest(key);
        hashRow(window.usageHash, USAGE_FIELDS.map(field => row[field]));
        window.usageCount += 1;
      }
      const quota = database.prepare(QUOTA_SQL);
      for (const row of quota.iterate()) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const window = windowFor(state, windowKey(row.observed_at_ms));
        if (window.quotaHash === null) window.quotaHash = createDigest(key);
        hashRow(window.quotaHash, QUOTA_FIELDS.map(field => row[field]));
        window.quotaCount += 1;
      }
      if (state.size === 0) return {
        schemaVersion: ACCOUNTING_WINDOW_RECEIPT_VERSION,
        algorithmVersion: ACCOUNTING_WINDOW_ALGORITHM_VERSION,
        windowMs: ACCOUNTING_WINDOW_MS,
        commitSeq,
        usageCount: 0,
        quotaCount: 0,
        factCount: 0,
        windows: [],
      };
      const windows = [...state.values()]
        .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
        .map(window => finalizeWindow(window, key));
      return {
        schemaVersion: ACCOUNTING_WINDOW_RECEIPT_VERSION,
        algorithmVersion: ACCOUNTING_WINDOW_ALGORITHM_VERSION,
        windowMs: ACCOUNTING_WINDOW_MS,
        commitSeq,
        usageCount: windows.reduce((sum, window) => sum + window.usageCount, 0),
        quotaCount: windows.reduce((sum, window) => sum + window.quotaCount, 0),
        factCount: windows.reduce((sum, window) => sum + window.factCount, 0),
        windows,
      };
    });
  } finally {
    database.close();
  }
}

function validDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

/**
 * Validate receipt structure and internal totals. This is a proof-shape check,
 * not a comparison with a different generation.
 */
export function assertAccountingWindowReceipts(receipts) {
  if (!receipts || typeof receipts !== "object" || Array.isArray(receipts)
      || receipts.schemaVersion !== ACCOUNTING_WINDOW_RECEIPT_VERSION
      || receipts.algorithmVersion !== ACCOUNTING_WINDOW_ALGORITHM_VERSION
      || receipts.windowMs !== ACCOUNTING_WINDOW_MS
      || !Number.isSafeInteger(receipts.commitSeq) || receipts.commitSeq < 0
      || !Array.isArray(receipts.windows)) {
    throw fixedError("accounting_window_receipts_invalid");
  }
  let usageCount = 0, quotaCount = 0, factCount = 0, previous = null;
  for (const window of receipts.windows) {
    if (!window || typeof window !== "object" || Array.isArray(window)
        || typeof window.key !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/u.test(window.key)
        || !Number.isSafeInteger(window.lowerMs) || !Number.isSafeInteger(window.upperMs)
        || window.upperMs - window.lowerMs !== ACCOUNTING_WINDOW_MS
        || window.lowerMs !== Date.parse(`${window.key}T00:00:00.000Z`)
        || !Number.isSafeInteger(window.usageCount) || window.usageCount < 0
        || !Number.isSafeInteger(window.quotaCount) || window.quotaCount < 0
        || window.factCount !== window.usageCount + window.quotaCount
        || !validDigest(window.factDigest)
        || previous !== null && window.key <= previous) {
      throw fixedError("accounting_window_receipts_invalid");
    }
    usageCount += window.usageCount;
    quotaCount += window.quotaCount;
    factCount += window.factCount;
    previous = window.key;
  }
  if (receipts.usageCount !== usageCount
      || receipts.quotaCount !== quotaCount
      || receipts.factCount !== factCount) {
    throw fixedError("accounting_window_receipts_invalid");
  }
  return receipts;
}

/**
 * Compare two receipt sets. Only windows whose digest or presence changed are
 * returned; this is the small set an incremental refresh would recompute.
 */
export function compareAccountingWindowReceipts(before, after) {
  assertAccountingWindowReceipts(before);
  assertAccountingWindowReceipts(after);
  const left = new Map(before.windows.map(window => [window.key, window]));
  const right = new Map(after.windows.map(window => [window.key, window]));
  const changed = [], added = [], removed = [];
  for (const [key, window] of right) {
    const prior = left.get(key);
    if (prior === undefined) added.push(key);
    else if (prior.factDigest !== window.factDigest
        || prior.factCount !== window.factCount) changed.push(key);
  }
  for (const key of left.keys()) if (!right.has(key)) removed.push(key);
  return { changed, added, removed };
}
