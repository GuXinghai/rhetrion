import {
  assertAccountingWindowReceipts,
  compareAccountingWindowReceipts,
} from "./local-index-accounting-windows.js";
import { buildAccountingWindowRows } from "./local-index-accounting-window-rows.js";
import { buildAccountingRollingPeriods } from "./local-index-accounting-window-fold.js";
import { readLocalIndexGenerationIdentity } from "./local-index-companion-source.js";
import {
  exportAccountingPeriodAccumulator,
  importAccountingPeriodAccumulator,
} from "./replay-safe-accounting-cache.js";

export const ACCOUNTING_WINDOW_CACHE_VERSION = 2;
const MAX_DAYS = 4_096;
const AUDIT_STATUSES = new Set(["matched"]);

function fixedError(code) {
  return Object.assign(new Error(code), { code });
}

function validKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function validateCache(cache) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)
      || cache.schemaVersion !== ACCOUNTING_WINDOW_CACHE_VERSION
      || typeof cache.basisFingerprint !== "string"
      || typeof cache.generation !== "string"
      || typeof cache.generationFingerprint !== "string"
      || !Number.isSafeInteger(cache.calculationRevision)
      || !Number.isSafeInteger(cache.periodEndMs) || cache.periodEndMs < 0
      || !Number.isSafeInteger(cache.historyEndMs)
      || cache.historyEndMs < cache.periodEndMs
      || !Array.isArray(cache.days) || cache.days.length > MAX_DAYS
      || !Array.isArray(cache.periods) || cache.periods.length !== 4
      || !cache.receipts || typeof cache.receipts !== "object"
      || (cache.audit !== null && (
        typeof cache.audit !== "object" || Array.isArray(cache.audit)
        || !AUDIT_STATUSES.has(cache.audit.status)
        || !Number.isSafeInteger(cache.audit.comparedAtMs)
        || cache.audit.periods !== 4
        || typeof cache.audit.history !== "boolean"
      ))) {
    throw fixedError("accounting_window_cache_invalid");
  }
  const seen = new Set();
  for (const day of cache.days) {
    if (!day || typeof day !== "object" || Array.isArray(day)
        || !validKey(day.key) || !Number.isSafeInteger(day.lowerMs)
        || day.upperMs - day.lowerMs !== 86_400_000
        || typeof day.rowDigest !== "string"
        || !day.snapshot || typeof day.snapshot !== "object"
        || seen.has(day.key)) {
      throw fixedError("accounting_window_cache_invalid");
    }
    seen.add(day.key);
  }
  return cache;
}

function dayMap(cache) {
  const map = new Map();
  for (const day of cache.days) {
    map.set(day.lowerMs, importAccountingPeriodAccumulator(day.snapshot, {
      trusted: true,
    }));
  }
  return map;
}

function endOfReceipts(receipts) {
  if (receipts.windows.length === 0) return Date.now();
  return receipts.windows.at(-1).upperMs - 1;
}

async function fold(cache, { indexFile, endMs, declaredSpeedBaselines, signal }) {
  const lastFactMs = endOfReceipts(cache.receipts);
  const anchorMs = endMs ?? lastFactMs;
  const historyEndMs = Math.max(anchorMs, lastFactMs);
  const folded = await buildAccountingRollingPeriods({
    indexFile,
    endMs: anchorMs,
    historyEndMs,
    dayAccumulators: dayMap(cache),
    declaredSpeedBaselines,
    includeHistory: true,
    signal,
  });
  cache.periodEndMs = anchorMs;
  cache.historyEndMs = historyEndMs;
  cache.periods = folded.periods;
  cache.history = folded.history;
  return cache;
}

async function buildDays({ indexFile, keys, hmacKey, declaredSpeedBaselines, signal }) {
  if (keys.length === 0) return [];
  const built = await buildAccountingWindowRows({
    indexFile, windowKeys: keys, hmacKey, declaredSpeedBaselines,
    includeAccumulator: true, signal,
  });
  const byKey = new Map(built.rows.map(row => [row.key, row]));
  return keys.map(key => {
    const row = byKey.get(key);
    if (!row?.accumulator) throw fixedError("accounting_window_cache_day_missing");
    return {
      key,
      lowerMs: row.lowerMs,
      upperMs: row.upperMs,
      rowDigest: row.rowDigest,
      snapshot: exportAccountingPeriodAccumulator(row.accumulator),
    };
  }).sort((left, right) => left.lowerMs - right.lowerMs);
}

/**
 * Build the shadow window cache from all current input receipts. This is the
 * initial/full-basis path; it does not publish or install the cache.
 */
export async function createAccountingWindowCache({
  indexFile,
  receipts,
  hmacKey,
  declaredSpeedBaselines = [],
  endMs = null,
  signal = null,
  now = () => Date.now(),
} = {}) {
  assertAccountingWindowReceipts(receipts, { hmacKey });
  const identity = readLocalIndexGenerationIdentity({ indexFile });
  if (identity === null || identity.calculationRevision !== receipts.calculationRevision) {
    throw fixedError("accounting_window_cache_generation_changed");
  }
  const days = await buildDays({
    indexFile, keys: receipts.windows.map(window => window.key),
    hmacKey, declaredSpeedBaselines, signal,
  });
  const cache = {
    schemaVersion: ACCOUNTING_WINDOW_CACHE_VERSION,
    basisFingerprint: receipts.basisFingerprint,
    generation: String(identity.id),
    generationFingerprint: identity.fingerprint,
    calculationRevision: receipts.calculationRevision,
    computedAtMs: Number(now()),
    receipts,
    days,
    periodEndMs: 0,
    historyEndMs: 0,
    periods: [],
    history: null,
    audit: null,
  };
  await fold(cache, { indexFile, endMs, declaredSpeedBaselines, signal });
  return validateCache(cache);
}

/**
 * Update a shadow window cache from new receipts. Only changed/added windows
 * are rebuilt; unchanged day snapshots are preserved and folded again.
 */
export async function updateAccountingWindowCache({
  previous,
  indexFile,
  receipts,
  hmacKey,
  declaredSpeedBaselines = [],
  endMs = null,
  signal = null,
  now = () => Date.now(),
} = {}) {
  validateCache(previous);
  assertAccountingWindowReceipts(receipts, { hmacKey });
  const comparison = compareAccountingWindowReceipts(previous.receipts, receipts, { hmacKey });
  if (comparison.basisChanged) {
    return {
      cache: await createAccountingWindowCache({
        indexFile, receipts, hmacKey, declaredSpeedBaselines, endMs, signal, now,
      }),
      basisChanged: true,
      rebuiltKeys: receipts.windows.map(window => window.key),
      added: comparison.added,
      removed: comparison.removed,
      changed: comparison.changed,
    };
  }
  const rebuiltKeys = [...new Set([...comparison.changed, ...comparison.added])].sort();
  const identity = readLocalIndexGenerationIdentity({ indexFile });
  if (identity === null || identity.calculationRevision !== receipts.calculationRevision) {
    throw fixedError("accounting_window_cache_generation_changed");
  }
  const lastFactMs = endOfReceipts(receipts);
  const anchorMs = endMs ?? lastFactMs;
  const historyEndMs = Math.max(anchorMs, lastFactMs);
  if (rebuiltKeys.length === 0
      && previous.periodEndMs === anchorMs
      && previous.historyEndMs === historyEndMs
      && previous.receipts.commitSeq === receipts.commitSeq
      && previous.receipts.calculationRevision === receipts.calculationRevision
      && previous.generation === String(identity.id)
      && previous.generationFingerprint === identity.fingerprint) {
    return {
      cache: previous,
      basisChanged: false,
      rebuiltKeys: [],
      added: [],
      removed: [],
      changed: [],
      unchanged: true,
    };
  }
  const previousDays = new Map(previous.days.map(day => [day.key, day]));
  const newDays = await buildDays({
    indexFile, keys: rebuiltKeys, hmacKey, declaredSpeedBaselines, signal,
  });
  const newByKey = new Map(newDays.map(day => [day.key, day]));
  const days = receipts.windows.map(window => {
    const rebuilt = newByKey.get(window.key);
    if (rebuilt) return rebuilt;
    const prior = previousDays.get(window.key);
    if (!prior) throw fixedError("accounting_window_cache_day_missing");
    return prior;
  }).sort((left, right) => left.lowerMs - right.lowerMs);
  const cache = {
    schemaVersion: ACCOUNTING_WINDOW_CACHE_VERSION,
    basisFingerprint: receipts.basisFingerprint,
    generation: String(identity.id),
    generationFingerprint: identity.fingerprint,
    calculationRevision: receipts.calculationRevision,
    computedAtMs: Number(now()),
    receipts,
    days,
    periodEndMs: 0,
    historyEndMs: 0,
    periods: [],
    history: null,
    audit: null,
  };
  await fold(cache, { indexFile, endMs, declaredSpeedBaselines, signal });
  return {
    cache: validateCache(cache),
    basisChanged: false,
    rebuiltKeys,
    added: comparison.added,
    removed: comparison.removed,
    changed: comparison.changed,
    unchanged: false,
  };
}
