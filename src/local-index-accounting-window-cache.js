import { createHash } from "node:crypto";
import {
  assertAccountingWindowReceipts,
  compareAccountingWindowReceipts,
  normalizeDeclaredSpeedBaselines,
} from "./local-index-accounting-windows.js";
import { stableJson } from "./export/index.js";
import {
  accountingWindowRowDigest,
  buildAccountingWindowRows,
} from "./local-index-accounting-window-rows.js";
import { buildAccountingRollingPeriods } from "./local-index-accounting-window-fold.js";
import { readLocalIndexGenerationIdentity } from "./local-index-companion-source.js";
import {
  createAccountingPeriodAccumulator,
  exportAccountingPeriodAccumulator,
  finalizeAccountingPeriodAccumulator,
  importAccountingPeriodAccumulator,
} from "./replay-safe-accounting-cache.js";

export const ACCOUNTING_WINDOW_CACHE_VERSION = 3;
const MAX_DAYS = 4_096;
// `matched` records a successful parity audit against a shipping rebuild.
// `source` records a window cache that a shipping fast path consumed as its
// authoritative periods/history source. Both are explicit; a cache without an
// audit was never used for a reader-visible claim.
const AUDIT_STATUSES = new Set(["matched", "source"]);

function fixedError(code) {
  return Object.assign(new Error(code), { code });
}

function validKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

// A day row that fails verification is recoverable: the shadow pass drops the
// affected days and rebuilds them. Every other cache error is not.
const RECOVERABLE_DAY_REASONS = new Set([
  "day_digest_mismatch",
  "day_missing",
  "day_revision_mismatch",
]);
const WINDOW_CACHE_ERROR_PREFIX = "accounting_window_cache_";

/**
 * Map a window-cache error to the recoverable day reason it names, or null.
 * The prefix and the closed reason set live beside the code that throws them so
 * no caller has to re-slice the vocabulary.
 */
export function accountingWindowCacheErrorReason(error) {
  const code = error?.code;
  if (typeof code !== "string"
      || !code.startsWith(WINDOW_CACHE_ERROR_PREFIX)) return null;
  const reason = code.slice(WINDOW_CACHE_ERROR_PREFIX.length);
  return RECOVERABLE_DAY_REASONS.has(reason) ? reason : null;
}

function assertReceiptBaselines(receipts, declaredSpeedBaselines) {
  const normalized = normalizeDeclaredSpeedBaselines(declaredSpeedBaselines);
  if (stableJson(normalized) !== stableJson(receipts.declaredSpeedBaselines)) {
    throw fixedError("accounting_window_cache_baselines_mismatch");
  }
  return normalized;
}

function assertGenerationUnchanged(indexFile, identity) {
  const current = readLocalIndexGenerationIdentity({ indexFile });
  if (current === null || String(current.id) !== String(identity.id)
      || current.fingerprint !== identity.fingerprint
      || current.calculationRevision !== identity.calculationRevision) {
    throw fixedError("accounting_window_cache_generation_changed");
  }
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

/**
 * Verify every stored day's keyed output digest. A cache that fails this check
 * is not a trusted last-good artifact and must be treated as invalid.
 */
export function verifyAccountingWindowDays(cache, hmacKey) {
  validateCache(cache);
  dayMap(cache, hmacKey);
  return true;
}

/**
 * A content-only identity for the persisted day snapshots and their input
 * receipts. It deliberately excludes anchors and wall-clock publication
 * fields: advancing `endMs` without new facts must not change it. A shipping
 * cache records this digest so a later fast path can prove that the window
 * state it is about to mutate is exactly the state that shipping cache
 * already consumed.
 */
export function accountingWindowCacheDigest(cache) {
  validateCache(cache);
  return createHash("sha256").update(stableJson({
    schemaVersion: ACCOUNTING_WINDOW_CACHE_VERSION,
    basisFingerprint: cache.basisFingerprint,
    calculationRevision: cache.calculationRevision,
    receiptDigest: cache.receipts.receiptDigest,
    days: cache.days.map(day => [day.key, day.rowDigest]),
  })).digest("hex");
}

function dayMap(cache, hmacKey) {
  const map = new Map();
  for (const day of cache.days) {
    const accumulator = importAccountingPeriodAccumulator(day.snapshot);
    const period = finalizeAccountingPeriodAccumulator(accumulator);
    const expected = accountingWindowRowDigest({
      key: day.key,
      lowerMs: day.lowerMs,
      upperMs: day.upperMs,
      period,
      hmacKey,
    });
    if (expected !== day.rowDigest) {
      throw fixedError("accounting_window_cache_day_digest_mismatch");
    }
    map.set(day.lowerMs, accumulator);
  }
  return map;
}

function endOfReceipts(receipts) {
  if (receipts.windows.length === 0) return 0;
  return receipts.windows.at(-1).upperMs - 1;
}

async function fold(cache, {
  indexFile, hmacKey, endMs, declaredSpeedBaselines, signal,
}) {
  const lastFactMs = endOfReceipts(cache.receipts);
  const anchorMs = endMs ?? lastFactMs;
  const historyEndMs = Math.max(anchorMs, lastFactMs);
  const folded = await buildAccountingRollingPeriods({
    indexFile,
    endMs: anchorMs,
    historyEndMs,
    dayAccumulators: dayMap(cache, hmacKey),
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

function buildDaysFromAccumulators({
  receipts, dayAccumulators, hmacKey, dayAccumulatorsRevision,
}) {
  if (!Number.isSafeInteger(dayAccumulatorsRevision)
      || dayAccumulatorsRevision !== receipts.calculationRevision) {
    throw fixedError("accounting_window_cache_day_revision_mismatch");
  }
  return receipts.windows.map(window => {
    const accumulator = dayAccumulators.get(window.lowerMs);
    if (accumulator === undefined && window.factCount > 0) {
      // An absent day is only legitimately empty when the receipt also proves
      // it has no facts. Otherwise the seed belongs to a different revision
      // and must never be published as an empty day.
      throw fixedError("accounting_window_cache_day_missing");
    }
    const period = finalizeAccountingPeriodAccumulator(
      accumulator ?? createAccountingPeriodAccumulator("window", "UTC day"),
    );
    return {
      key: window.key,
      lowerMs: window.lowerMs,
      upperMs: window.upperMs,
      rowDigest: accountingWindowRowDigest({
        key: window.key,
        lowerMs: window.lowerMs,
        upperMs: window.upperMs,
        period,
        hmacKey,
      }),
      snapshot: exportAccountingPeriodAccumulator(accumulator),
    };
  }).sort((left, right) => left.lowerMs - right.lowerMs);
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
  dayAccumulators = null,
  dayAccumulatorsRevision = null,
  endMs = null,
  signal = null,
  now = () => Date.now(),
} = {}) {
  if (dayAccumulators !== null && !(dayAccumulators instanceof Map)) {
    throw new TypeError("accounting window cache dayAccumulators must be a Map or null");
  }
  if (dayAccumulatorsRevision !== null
      && (!Number.isSafeInteger(dayAccumulatorsRevision)
        || dayAccumulatorsRevision < 0)) {
    throw new TypeError(
      "accounting window cache dayAccumulatorsRevision must be a non-negative safe integer or null",
    );
  }
  assertAccountingWindowReceipts(receipts, { hmacKey });
  assertReceiptBaselines(receipts, declaredSpeedBaselines);
  const identity = readLocalIndexGenerationIdentity({ indexFile });
  if (identity === null || identity.calculationRevision !== receipts.calculationRevision) {
    throw fixedError("accounting_window_cache_generation_changed");
  }
  const seeded = dayAccumulators !== null && dayAccumulators.size > 0;
  const days = seeded
    ? buildDaysFromAccumulators({
      receipts, dayAccumulators, hmacKey, dayAccumulatorsRevision,
    })
    : await buildDays({
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
  await fold(cache, {
    indexFile, hmacKey, endMs, declaredSpeedBaselines, signal,
  });
  assertGenerationUnchanged(indexFile, identity);
  return validateCache(cache);
}

function dirtyFromMsFor(comparison, receipts, previousReceipts) {
  const next = new Map(receipts.windows.map(window => [window.key, window.lowerMs]));
  const prior = new Map(previousReceipts.windows.map(window => [window.key, window.lowerMs]));
  let from = null;
  const note = value => {
    if (!Number.isSafeInteger(value)) return;
    from = from === null ? value : Math.min(from, value);
  };
  for (const key of [...comparison.changed, ...comparison.added]) note(next.get(key));
  for (const key of comparison.removed) note(prior.get(key));
  return from;
}

function repairedKeysFor(receipts, repairFromMs, repairToMs) {
  if (repairFromMs === null) return [];
  return receipts.windows
    .filter(window => window.upperMs > repairFromMs
      && window.lowerMs <= repairToMs)
    .map(window => window.key);
}

function mergeDirtyFrom(comparisonDirtyMs, repairFromMs) {
  if (repairFromMs === null) return comparisonDirtyMs;
  return comparisonDirtyMs === null
    ? repairFromMs
    : Math.min(comparisonDirtyMs, repairFromMs);
}

function validRepairRange(fromMs, toMs) {
  return (fromMs === null && toMs === null)
    || (Number.isSafeInteger(fromMs) && Number.isSafeInteger(toMs)
      && fromMs >= 0 && fromMs <= toMs);
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
  dayAccumulators = null,
  dayAccumulatorsRevision = null,
  // A manual repair forces every UTC day overlapping this inclusive range to
  // be rebuilt even when its receipt digest did not move.
  repairFromMs = null,
  repairToMs = null,
  endMs = null,
  signal = null,
  now = () => Date.now(),
} = {}) {
  validateCache(previous);
  assertAccountingWindowReceipts(receipts, { hmacKey });
  assertReceiptBaselines(receipts, declaredSpeedBaselines);
  if (dayAccumulators !== null && !(dayAccumulators instanceof Map)) {
    throw new TypeError("accounting window cache dayAccumulators must be a Map or null");
  }
  if (!validRepairRange(repairFromMs, repairToMs)) {
    throw new TypeError("accounting window cache repair range is invalid");
  }
  const comparison = compareAccountingWindowReceipts(previous.receipts, receipts, { hmacKey });
  if (comparison.basisChanged) {
    return {
      cache: await createAccountingWindowCache({
        indexFile, receipts, hmacKey, declaredSpeedBaselines,
        dayAccumulators, dayAccumulatorsRevision, endMs, signal, now,
      }),
      basisChanged: true,
      rebuiltKeys: receipts.windows.map(window => window.key),
      repaired: [],
      added: comparison.added,
      removed: comparison.removed,
      changed: comparison.changed,
      dirtyFromMs: mergeDirtyFrom(
        dirtyFromMsFor(comparison, receipts, previous.receipts),
        repairFromMs,
      ),
    };
  }
  const repaired = repairedKeysFor(receipts, repairFromMs, repairToMs);
  const rebuiltKeys = [...new Set([
    ...comparison.changed,
    ...comparison.added,
    ...repaired,
  ])].sort();
  const identity = readLocalIndexGenerationIdentity({ indexFile });
  if (identity === null || identity.calculationRevision !== receipts.calculationRevision) {
    throw fixedError("accounting_window_cache_generation_changed");
  }
  const lastFactMs = endOfReceipts(receipts);
  const anchorMs = endMs ?? lastFactMs;
  const historyEndMs = Math.max(anchorMs, lastFactMs);
  if (rebuiltKeys.length === 0
      && comparison.removed.length === 0
      && previous.periodEndMs === anchorMs
      && previous.historyEndMs === historyEndMs) {
    // The per-window digests did not move, so the usage days, folded periods,
    // and history are unchanged even when the publication/receipt watermark
    // advanced. Keep the expensive artifacts and refresh only the metadata.
    const cache = {
      ...previous,
      generation: String(identity.id),
      generationFingerprint: identity.fingerprint,
      calculationRevision: receipts.calculationRevision,
      computedAtMs: Number(now()),
      receipts,
    };
    return {
      cache: validateCache(cache),
      basisChanged: false,
      rebuiltKeys: [],
      repaired: [],
      added: comparison.added,
      removed: comparison.removed,
      changed: comparison.changed,
      unchanged: true,
      dirtyFromMs: null,
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
  await fold(cache, {
    indexFile, hmacKey, endMs, declaredSpeedBaselines, signal,
  });
  assertGenerationUnchanged(indexFile, identity);
  return {
    cache: validateCache(cache),
    basisChanged: false,
    rebuiltKeys,
    repaired,
    added: comparison.added,
    removed: comparison.removed,
    changed: comparison.changed,
    unchanged: false,
    dirtyFromMs: mergeDirtyFrom(
      dirtyFromMsFor(comparison, receipts, previous.receipts),
      repairFromMs,
    ),
  };
}
