import { createHash, createHmac } from "node:crypto";
import { setImmediate as yieldTurn } from "node:timers/promises";
import {
  APP_PRICE_REGISTRY_MANIFEST,
  LOCAL_API_PRICING_METHOD_VERSION,
} from "@app-usagemonitor/accounting";
import {
  DEFAULT_UNKNOWN_SPEED_POLICY,
  unknownSpeedCalculationIdentity,
} from "./unknown-speed-policy.js";
import { openLocalIndexStore } from "./local-index-store.js";

// A window is a fixed UTC day. The receipt is a content-free proof of which
// committed accounting inputs belong to the window; it is not a second fact
// ledger and it does not yet contain derived output rows.
export const ACCOUNTING_WINDOW_MS = 86_400_000;
export const ACCOUNTING_WINDOW_RECEIPT_VERSION = 1;
// Bumped when the hashed field order or predicate changes.
export const ACCOUNTING_WINDOW_ALGORITHM_VERSION = 2;
const DOMAIN = "rhetrion-accounting-window-v2";
const MIN_DATE_MS = Date.parse("0001-01-01T00:00:00.000Z");
const MAX_DATE_MS = Date.parse("9999-12-31T23:59:59.999Z");
const MAX_YIELD_EVERY = 1_000_000;
const DEFAULT_YIELD_EVERY = 50_000;

const USAGE_FIELDS = [
  "source_id", "source_offset", "observed_at_ms", "event_key", "session_id",
  "account_scope_id", "model_id", "tier_id", "surface_id",
  "quota_observation_id", "tier_observed_at_ms", "reasoning_effort", "flags",
  "work_directory_id", "tokens_in_uncached", "tokens_in_cache_read",
  "tokens_in_cache_write", "tokens_out_text", "tokens_out_reasoning",
  "tokens_out_combined", "total_input_context",
  "source_local", "source_ordinal", "model_key", "model_recognition",
  "api_service_tier", "billing_surface", "codex_speed_mode", "tier_source",
  "provider_tier_raw", "surface", "thread_source", "agent_scope",
  "lineage_disposition", "session_local", "account_scope_local",
  "account_scope_status", "account_scope_plan_type",
];
const QUOTA_FIELDS = [
  "source_id", "source_offset", "slot_order", "observed_at_ms", "provider",
  "plan_type", "limit_id", "slot", "used_percent", "resets_at_ms",
  "duration_mins", "admission", "surface_id", "source_local", "source_ordinal",
  "surface", "thread_source", "agent_scope", "lineage_disposition",
];

const USAGE_SQL = `SELECT
  u.source_id AS source_id, u.source_offset AS source_offset,
  u.observed_at_ms AS observed_at_ms, hex(u.event_key) AS event_key,
  u.session_id AS session_id, u.account_scope_id AS account_scope_id,
  u.model_id AS model_id, u.tier_id AS tier_id, u.surface_id AS surface_id,
  u.quota_observation_id AS quota_observation_id,
  u.tier_observed_at_ms AS tier_observed_at_ms,
  u.reasoning_effort AS reasoning_effort, u.flags AS flags,
  u.work_directory_id AS work_directory_id,
  u.tokens_in_uncached AS tokens_in_uncached,
  u.tokens_in_cache_read AS tokens_in_cache_read,
  u.tokens_in_cache_write AS tokens_in_cache_write,
  u.tokens_out_text AS tokens_out_text,
  u.tokens_out_reasoning AS tokens_out_reasoning,
  u.tokens_out_combined AS tokens_out_combined,
  u.total_input_context AS total_input_context,
  hex(s.source_local) AS source_local, s.source_ordinal AS source_ordinal,
  m.model_id AS model_key, m.recognition AS model_recognition,
  t.api_service_tier AS api_service_tier, t.billing_surface AS billing_surface,
  t.codex_speed_mode AS codex_speed_mode, t.tier_source AS tier_source,
  t.provider_tier_raw AS provider_tier_raw,
  c.surface AS surface, c.thread_source AS thread_source,
  c.agent_scope AS agent_scope, c.lineage_disposition AS lineage_disposition,
  hex(ses.session_local) AS session_local,
  hex(a.scope_local) AS account_scope_local,
  a.status AS account_scope_status, a.plan_type AS account_scope_plan_type
  FROM usage_event u
  JOIN source s ON s.id = u.source_id
  JOIN model m ON m.id = u.model_id
  JOIN tier_semantics t ON t.id = u.tier_id
  JOIN surface_class c ON c.id = u.surface_id
  LEFT JOIN session ses ON ses.id = u.session_id
  LEFT JOIN account_scope a ON a.id = u.account_scope_id
  WHERE u.source_offset <= s.scanned_bytes
  ORDER BY u.observed_at_ms, s.source_ordinal, s.source_local,
           u.source_offset`;
const QUOTA_SQL = `SELECT
  q.source_id AS source_id, q.source_offset AS source_offset,
  q.slot_order AS slot_order, q.observed_at_ms AS observed_at_ms,
  q.provider AS provider, q.plan_type AS plan_type, q.limit_id AS limit_id,
  q.slot AS slot, q.used_percent AS used_percent,
  q.resets_at_ms AS resets_at_ms, q.duration_mins AS duration_mins,
  q.admission AS admission, q.surface_id AS surface_id,
  hex(s.source_local) AS source_local, s.source_ordinal AS source_ordinal,
  c.surface AS surface, c.thread_source AS thread_source,
  c.agent_scope AS agent_scope, c.lineage_disposition AS lineage_disposition
  FROM quota_occurrence q
  JOIN source s ON s.id = q.source_id
  JOIN surface_class c ON c.id = q.surface_id
  WHERE q.admission = 'admitted' AND q.source_offset <= s.scanned_bytes
  ORDER BY q.observed_at_ms, s.source_ordinal, s.source_local,
           q.source_offset, q.slot_order`;

function fixedError(code) {
  return Object.assign(new Error(code), { code });
}

function normalizeHmacKey(hmacKey) {
  if (hmacKey === undefined || hmacKey === null) return null;
  if (typeof hmacKey !== "string" && !Buffer.isBuffer(hmacKey)
      && !(hmacKey instanceof Uint8Array)) {
    throw new TypeError("accounting window HMAC key is invalid");
  }
  if (hmacKey.length === 0 || hmacKey.length > 4096) {
    throw new TypeError("accounting window HMAC key is invalid");
  }
  return createHmac("sha256", hmacKey).update(`${DOMAIN}-key-v1`).digest();
}

function digestValue(value, key, domain) {
  const hash = key === null ? createHash("sha256") : createHmac("sha256", key);
  hash.update(`${domain}\0`);
  hash.update(JSON.stringify(value));
  return hash.digest("hex");
}

function windowKey(atMs) {
  if (!Number.isSafeInteger(atMs) || atMs < MIN_DATE_MS || atMs > MAX_DATE_MS) {
    throw fixedError("accounting_window_fact_time_invalid");
  }
  return new Date(atMs).toISOString().slice(0, 10);
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

function hashRow(hash, row, fields) {
  hash.update(JSON.stringify(fields.map(field => row[field])));
  hash.update("\n");
}

function readableDatabase(database) {
  return database.prepare("SELECT commit_seq, calculation_revision FROM store_state WHERE id = 1").get();
}

function readBasis(database, unknownSpeedPolicy, key) {
  const meta = Object.fromEntries(database.prepare(`SELECT key, value FROM meta
    WHERE key IN ('family','parser_version','rollup_basis','impact_schema_version')`).all()
    .map(row => [row.key, row.value]));
  const rollupStarts = database.prepare(
    "SELECT start_tokens FROM rollup_context_start ORDER BY start_tokens",
  ).all().map(row => Number(row.start_tokens));
  const basis = {
    algorithmVersion: ACCOUNTING_WINDOW_ALGORITHM_VERSION,
    family: meta.family ?? null,
    parserVersion: meta.parser_version ?? null,
    rollupBasis: meta.rollup_basis ?? null,
    impactSchemaVersion: meta.impact_schema_version ?? null,
    priceRegistryVersion: APP_PRICE_REGISTRY_MANIFEST.version,
    priceRegistryObservedAt: APP_PRICE_REGISTRY_MANIFEST.observedAt,
    pricingMethodVersion: LOCAL_API_PRICING_METHOD_VERSION,
    unknownSpeedPolicy: unknownSpeedCalculationIdentity(unknownSpeedPolicy),
    rollupContextStarts: rollupStarts,
  };
  return { basis, fingerprint: digestValue(basis, key, `${DOMAIN}-basis`) };
}

function finalizeWindow(window, key) {
  const usageCount = window.usageCount;
  const quotaCount = window.quotaCount;
  const usageDigest = (window.usageHash ?? createDigest(key)).digest("hex");
  const quotaDigest = (window.quotaHash ?? createDigest(key)).digest("hex");
  return {
    key: window.key,
    lowerMs: window.lowerMs,
    upperMs: window.upperMs,
    usageCount,
    quotaCount,
    factCount: usageCount + quotaCount,
    factDigest: digestValue({
      key: window.key,
      lowerMs: window.lowerMs,
      upperMs: window.upperMs,
      usageCount,
      quotaCount,
      usageDigest,
      quotaDigest,
    }, key, `${DOMAIN}-window`),
  };
}

function createDigest(key) {
  return key === null ? createHash("sha256") : createHmac("sha256", key);
}

function receiptForDigest(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    algorithmVersion: receipt.algorithmVersion,
    windowMs: receipt.windowMs,
    status: receipt.status,
    keyed: receipt.keyed,
    basisFingerprint: receipt.basisFingerprint,
    basis: receipt.basis,
    commitSeq: receipt.commitSeq,
    calculationRevision: receipt.calculationRevision,
    usageCount: receipt.usageCount,
    quotaCount: receipt.quotaCount,
    factCount: receipt.factCount,
    windows: receipt.windows,
  };
}

function computeReceiptDigest(receipt, key) {
  return digestValue(receiptForDigest(receipt), key, `${DOMAIN}-receipt`);
}

/**
 * Build content-free per-window input receipts from committed index facts.
 *
 * The scan uses the same committed predicates as the accounting reader:
 * usage rows at or before the source cursor, and admitted quota occurrences at
 * or before the cursor. The function is read-only and does not consume the
 * accounting cache. It is a shadow/audit primitive until a caller explicitly
 * consumes the receipts.
 *
 * A key is required by default (invariant I5); `allowUnkeyed` exists only for
 * isolated tests and must never be used for a persisted receipt.
 */
export async function createAccountingWindowReceipts({
  indexFile,
  hmacKey = null,
  allowUnkeyed = false,
  unknownSpeedPolicy = DEFAULT_UNKNOWN_SPEED_POLICY,
  signal = null,
  yieldEvery = DEFAULT_YIELD_EVERY,
  now = () => Date.now(),
} = {}) {
  if (typeof indexFile !== "string" || indexFile.length === 0) {
    throw new TypeError("accounting window indexFile is invalid");
  }
  if (typeof allowUnkeyed !== "boolean") {
    throw new TypeError("accounting window allowUnkeyed must be boolean");
  }
  if (!Number.isSafeInteger(yieldEvery) || yieldEvery < 1 || yieldEvery > MAX_YIELD_EVERY) {
    throw new TypeError("accounting window yieldEvery is invalid");
  }
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const key = normalizeHmacKey(hmacKey);
  if (key === null && !allowUnkeyed) throw fixedError("accounting_window_key_required");
  let database;
  try {
    database = openLocalIndexStore(indexFile, { readOnly: true });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw fixedError("accounting_window_source_unavailable");
  }
  let primaryError = null;
  try {
    database.exec("BEGIN");
    try {
      const state = readableDatabase(database);
      const commitSeq = Number(state.commit_seq);
      const calculationRevision = Number(state.calculation_revision);
      if (!Number.isSafeInteger(commitSeq) || commitSeq < 0
          || !Number.isSafeInteger(calculationRevision) || calculationRevision < 0) {
        throw fixedError("accounting_window_source_unavailable");
      }
      const windows = new Map();
      let processed = 0;
      const usage = database.prepare(USAGE_SQL);
      for (const row of usage.iterate()) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const window = windowFor(windows, windowKey(Number(row.observed_at_ms)));
        if (window.usageHash === null) window.usageHash = createDigest(key);
        hashRow(window.usageHash, row, USAGE_FIELDS);
        window.usageCount += 1;
        processed += 1;
        if (processed % yieldEvery === 0) {
          await yieldTurn();
          if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        }
      }
      const quota = database.prepare(QUOTA_SQL);
      for (const row of quota.iterate()) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const window = windowFor(windows, windowKey(Number(row.observed_at_ms)));
        if (window.quotaHash === null) window.quotaHash = createDigest(key);
        hashRow(window.quotaHash, row, QUOTA_FIELDS);
        window.quotaCount += 1;
        processed += 1;
        if (processed % yieldEvery === 0) {
          await yieldTurn();
          if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        }
      }
      const finalized = [...windows.values()]
        .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
        .map(window => finalizeWindow(window, key));
      const usageCount = finalized.reduce((sum, window) => sum + window.usageCount, 0);
      const quotaCount = finalized.reduce((sum, window) => sum + window.quotaCount, 0);
      const factCount = usageCount + quotaCount;
      if (factCount > 0 && commitSeq < 1) {
        throw fixedError("accounting_window_unpublished_facts");
      }
      const { basis, fingerprint: basisFingerprint } = readBasis(
        database, unknownSpeedPolicy, key,
      );
      const receipt = {
        schemaVersion: ACCOUNTING_WINDOW_RECEIPT_VERSION,
        algorithmVersion: ACCOUNTING_WINDOW_ALGORITHM_VERSION,
        windowMs: ACCOUNTING_WINDOW_MS,
        status: "input",
        keyed: key !== null,
        basisFingerprint,
        basis,
        commitSeq,
        calculationRevision,
        computedAtMs: Number(now()),
        usageCount,
        quotaCount,
        factCount,
        windows: finalized,
      };
      if (!Number.isSafeInteger(receipt.computedAtMs) || receipt.computedAtMs < 0) {
        throw fixedError("accounting_window_clock_invalid");
      }
      receipt.receiptDigest = computeReceiptDigest(receipt, key);
      return receipt;
    } finally {
      try { database.exec("COMMIT"); } catch { /* read transaction already closed */ }
    }
  } catch (error) {
    primaryError = error;
    if (error?.name === "AbortError") throw error;
    if (typeof error?.code === "string" && error.code.startsWith("accounting_window_")) throw error;
    throw fixedError("accounting_window_source_unavailable");
  } finally {
    try {
      database.close();
    } catch (error) {
      if (primaryError === null) throw fixedError("accounting_window_source_unavailable");
    }
  }
}

function validDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

/**
 * Validate receipt structure, coverage, and the top-level integrity digest.
 * A keyed receipt requires its key; a missing key fails closed.
 */
export function assertAccountingWindowReceipts(receipts, { hmacKey = null } = {}) {
  if (!receipts || typeof receipts !== "object" || Array.isArray(receipts)
      || receipts.schemaVersion !== ACCOUNTING_WINDOW_RECEIPT_VERSION
      || receipts.algorithmVersion !== ACCOUNTING_WINDOW_ALGORITHM_VERSION
      || receipts.windowMs !== ACCOUNTING_WINDOW_MS
      || receipts.status !== "input"
      || typeof receipts.keyed !== "boolean"
      || !receipts.basis || typeof receipts.basis !== "object" || Array.isArray(receipts.basis)
      || !validDigest(receipts.basisFingerprint)
      || !validDigest(receipts.receiptDigest)
      || !Number.isSafeInteger(receipts.commitSeq) || receipts.commitSeq < 0
      || !Number.isSafeInteger(receipts.calculationRevision) || receipts.calculationRevision < 0
      || !Number.isSafeInteger(receipts.computedAtMs) || receipts.computedAtMs < 0
      || !Array.isArray(receipts.windows)) {
    throw fixedError("accounting_window_receipts_invalid");
  }
  const key = normalizeHmacKey(hmacKey);
  if (receipts.keyed && key === null) throw fixedError("accounting_window_key_required");
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
      || receipts.factCount !== factCount
      || (factCount > 0 && receipts.commitSeq < 1)) {
    throw fixedError("accounting_window_receipts_invalid");
  }
  if (computeReceiptDigest(receipts, key) !== receipts.receiptDigest) {
    throw fixedError("accounting_window_receipts_invalid");
  }
  return receipts;
}

/**
 * Compare two receipt sets. A basis change is reported separately: a caller
 * must not treat it as ordinary dirty windows.
 */
export function compareAccountingWindowReceipts(before, after, { hmacKey = null } = {}) {
  assertAccountingWindowReceipts(before, { hmacKey });
  assertAccountingWindowReceipts(after, { hmacKey });
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
  return {
    basisChanged: before.basisFingerprint !== after.basisFingerprint,
    changed, added, removed,
  };
}
