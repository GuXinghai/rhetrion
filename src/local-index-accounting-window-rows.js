import { createHash, createHmac } from "node:crypto";
import { createLocalIndexAccountingScan } from "./local-index-accounting-cache.js";
import { readLocalIndexGenerationIdentity } from "./local-index-companion-source.js";
import {
  buildAccountingPeriodAccumulatorsByDay,
  createAccountingPeriodAccumulator,
  finalizeAccountingPeriodAccumulator,
} from "./replay-safe-accounting-cache.js";
import { ACCOUNTING_WINDOW_MS } from "./local-index-accounting-windows.js";
import { stableJson } from "./export/index.js";

const DOMAIN = "rhetrion-accounting-window-row-v2";
const MAX_WINDOWS = 4_096;

function fixedError(code) {
  return Object.assign(new Error(code), { code });
}

function normalizeKey(hmacKey) {
  if (typeof hmacKey !== "string" && !Buffer.isBuffer(hmacKey)
      && !(hmacKey instanceof Uint8Array)) {
    throw new TypeError("accounting window row HMAC key is invalid");
  }
  if (hmacKey.length === 0 || hmacKey.length > 4096) {
    throw new TypeError("accounting window row HMAC key is invalid");
  }
  return createHmac("sha256", hmacKey).update(`${DOMAIN}-key-v1`).digest();
}

function digest(value, key) {
  return createHmac("sha256", key).update(`${DOMAIN}\0`)
    .update(stableJson(value)).digest("hex");
}

function validKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** The keyed proof over one finalized UTC-day row. */
export function accountingWindowRowDigest({
  key, lowerMs, upperMs, period, hmacKey,
}) {
  return digest({ key, lowerMs, upperMs, period }, normalizeKey(hmacKey));
}

function contiguousRuns(windows) {
  const runs = [];
  for (const window of windows) {
    const prior = runs.at(-1);
    if (prior !== undefined
        && window.lowerMs === prior.at(-1).lowerMs + ACCOUNTING_WINDOW_MS) {
      prior.push(window);
    } else {
      runs.push([window]);
    }
  }
  return runs;
}

/**
 * Build the derived accounting row for named UTC days and hash it. This is the
 * output-side proof for a future windowed cache; it does not merge into the
 * shipping cache or change any reader.
 *
 * Contiguous requested days share one ordered scan. The generation is checked
 * before and after each run, so a concurrent commit fails closed instead of
 * mixing generations.
 */
export async function buildAccountingWindowRows({
  indexFile,
  windowKeys,
  hmacKey,
  declaredSpeedBaselines = [],
  includePeriod = false,
  includeAccumulator = false,
  signal = null,
  now = () => Date.now(),
} = {}) {
  if (typeof indexFile !== "string" || indexFile.length === 0) {
    throw new TypeError("accounting window row indexFile is invalid");
  }
  if (!Array.isArray(windowKeys) || windowKeys.length === 0 || windowKeys.length > MAX_WINDOWS
      || windowKeys.some(key => !validKey(key))
      || new Set(windowKeys).size !== windowKeys.length) {
    throw new TypeError("accounting window row keys are invalid");
  }
  if (!Array.isArray(declaredSpeedBaselines)) {
    throw new TypeError("accounting window row baselines are invalid");
  }
  if (typeof includePeriod !== "boolean") {
    throw new TypeError("accounting window row includePeriod must be boolean");
  }
  if (typeof includeAccumulator !== "boolean") {
    throw new TypeError("accounting window row includeAccumulator must be boolean");
  }
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const key = normalizeKey(hmacKey);
  const generation = readLocalIndexGenerationIdentity({ indexFile });
  if (generation === null) throw fixedError("accounting_window_generation_unavailable");
  const windows = [...windowKeys].sort().map(windowKey => ({
    key: windowKey,
    lowerMs: Date.parse(`${windowKey}T00:00:00.000Z`),
    upperMs: Date.parse(`${windowKey}T00:00:00.000Z`) + ACCOUNTING_WINDOW_MS,
  }));
  const scan = createLocalIndexAccountingScan({ indexFile });
  const accumulators = new Map();
  for (const run of contiguousRuns(windows)) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const built = await buildAccountingPeriodAccumulatorsByDay({
      startAt: new Date(run[0].lowerMs).toISOString(),
      endAt: new Date(run.at(-1).upperMs - 1).toISOString(),
      scan,
      signal,
      declaredSpeedBaselines,
      // The grouped path is faster but resolves a whole rollup bucket's
      // declared speed once at the bucket timestamp. On the owner corpus that
      // moved a few hundred speed-provenance events across a baseline edge, so
      // the shadow proof uses the exact per-event path until that is resolved.
      grouped: false,
    });
    for (const [dayStart, period] of built) accumulators.set(dayStart, period);
    const current = readLocalIndexGenerationIdentity({ indexFile });
    if (current === null || String(current.id) !== String(generation.id)
        || current.fingerprint !== generation.fingerprint
        || current.calculationRevision !== generation.calculationRevision) {
      throw fixedError("accounting_window_generation_changed");
    }
  }
  const rows = windows.map(window => {
    const accumulator = accumulators.get(window.lowerMs)
      ?? createAccountingPeriodAccumulator("window", "UTC day");
    const period = finalizeAccountingPeriodAccumulator(accumulator);
    const row = {
      key: window.key,
      lowerMs: window.lowerMs,
      upperMs: window.upperMs,
      rowDigest: digest({
        key: window.key, lowerMs: window.lowerMs, upperMs: window.upperMs, period,
      }, key),
    };
    if (includePeriod) row.period = period;
    if (includeAccumulator) row.accumulator = accumulator;
    return row;
  });
  return {
    schemaVersion: 1,
    generation: String(generation.id),
    generationFingerprint: generation.fingerprint,
    calculationRevision: generation.calculationRevision,
    computedAtMs: Number(now()),
    rows,
  };
}
