import { createLocalIndexAccountingScan } from "./local-index-accounting-cache.js";
import {
  buildReplaySafeAccountingPeriod,
  createAccountingPeriodAccumulator,
  finalizeAccountingPeriodAccumulator,
  mergeAccountingPeriodAccumulator,
} from "./replay-safe-accounting-cache.js";

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 365;
const PERIODS = Object.freeze([
  Object.freeze({ id: "24h", label: "Last 24 hours", durationMs: DAY_MS }),
  Object.freeze({ id: "7d", label: "Last 7 days", durationMs: 7 * DAY_MS }),
  Object.freeze({ id: "30d", label: "Last 30 days", durationMs: 30 * DAY_MS }),
  Object.freeze({ id: "all", label: `Cached ${DEFAULT_WINDOW_DAYS}-day window`, durationMs: null }),
]);

function dayStart(ms) {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function fixedError(code) {
  return Object.assign(new Error(code), { code });
}

/**
 * Fold pre-built UTC-day accumulators into the four cached periods. A range
 * that is not day-aligned recomputes at most its two edge days; interior days
 * are merged from the map. `edgeToleranceMs` reproduces the shipping period
 * pass's five-minute late-event tail; history remains strict.
 */
export async function buildAccountingRollingPeriods({
  indexFile,
  endMs,
  dayAccumulators,
  scan = null,
  declaredSpeedBaselines = [],
  includeHistory = false,
  historyEndMs = endMs,
  signal = null,
} = {}) {
  if (typeof indexFile !== "string" || indexFile.length === 0) {
    throw new TypeError("accounting rolling indexFile is invalid");
  }
  if (!Number.isSafeInteger(endMs) || endMs < 0) {
    throw new TypeError("accounting rolling endMs is invalid");
  }
  if (!(dayAccumulators instanceof Map)) {
    throw new TypeError("accounting rolling dayAccumulators must be a Map");
  }
  if (!Array.isArray(declaredSpeedBaselines)) {
    throw new TypeError("accounting rolling baselines are invalid");
  }
  if (typeof includeHistory !== "boolean") {
    throw new TypeError("accounting rolling includeHistory must be boolean");
  }
  if (!Number.isSafeInteger(historyEndMs) || historyEndMs < endMs) {
    throw new TypeError("accounting rolling historyEndMs is invalid");
  }
  const reader = scan ?? createLocalIndexAccountingScan({ indexFile });
  const days = new Map(dayAccumulators);
  const fragments = new Map();
  // Capture the known history beginning before rolling-period edge builds add
  // empty days to the working map.
  const historyStartMs = [...days.keys()].sort((left, right) => left - right)[0] ?? null;

  const buildRange = async (startMs, finishMs) => {
    const built = await buildReplaySafeAccountingPeriod({
      id: "window",
      label: "UTC day",
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(finishMs).toISOString(),
      scan: reader,
      signal,
      declaredSpeedBaselines,
      includeAccumulator: true,
    });
    if (!built.accumulator) throw fixedError("accounting_rolling_accumulator_unavailable");
    return built.accumulator;
  };

  const getDay = async key => {
    if (days.has(key)) return days.get(key);
    const accumulator = await buildRange(key, key + DAY_MS - 1);
    days.set(key, accumulator);
    return accumulator;
  };

  const getFragment = async (startMs, finishMs) => {
    const key = `${startMs}:${finishMs}`;
    if (!fragments.has(key)) fragments.set(key, await buildRange(startMs, finishMs));
    return fragments.get(key);
  };

  const fold = async (id, label, startMs, finishMs) => {
    const target = createAccountingPeriodAccumulator(id, label);
    const first = dayStart(startMs);
    const last = dayStart(finishMs);
    if (first === last) {
      mergeAccountingPeriodAccumulator(target, await getFragment(startMs, finishMs));
    } else {
      if (startMs === first) {
        mergeAccountingPeriodAccumulator(target, await getDay(first));
      } else {
        mergeAccountingPeriodAccumulator(
          target, await getFragment(startMs, first + DAY_MS - 1),
        );
      }
      for (let at = first + DAY_MS; at < last; at += DAY_MS) {
        mergeAccountingPeriodAccumulator(target, await getDay(at));
      }
      if (finishMs === last + DAY_MS - 1) {
        mergeAccountingPeriodAccumulator(target, await getDay(last));
      } else {
        mergeAccountingPeriodAccumulator(
          target, await getFragment(last, finishMs),
        );
      }
    }
    return finalizeAccountingPeriodAccumulator(target);
  };

  const periods = [];
  for (const period of PERIODS) {
    signal?.throwIfAborted?.();
    const startMs = period.durationMs === null
      ? endMs - DEFAULT_WINDOW_DAYS * DAY_MS
      : endMs - period.durationMs;
    periods.push(await fold(period.id, period.label, startMs, endMs));
  }
  let history = null;
  if (includeHistory) {
    history = await fold(
      "history", "Indexed history", historyStartMs ?? endMs, historyEndMs,
    );
  }
  return { periods, history, dayAccumulators: days };
}
