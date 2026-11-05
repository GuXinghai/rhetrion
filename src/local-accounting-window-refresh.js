import { isDeepStrictEqual } from "node:util";
import { readExistingDeviceSalt } from "./local-device-salt.js";
import {
  DEFAULT_UNKNOWN_SPEED_POLICY,
} from "./unknown-speed-policy.js";
import {
  assertAccountingWindowReceipts,
  createAccountingWindowReceipts,
  updateAccountingWindowReceipts,
} from "./local-index-accounting-windows.js";
import {
  accountingWindowCacheDigest,
  accountingWindowCacheErrorReason,
  createAccountingWindowCache,
  updateAccountingWindowCache,
  verifyAccountingWindowDays,
} from "./local-index-accounting-window-cache.js";
import {
  readLocalCollectorAccountingWindowCache,
  writeLocalCollectorAccountingWindowCache,
} from "./local-collector-state.js";

function fixedError(code) {
  return Object.assign(new Error(code), { code });
}

const MAX_MISMATCH_FIELDS = 32;

function mismatchPaths(left, right, path = [], out = []) {
  if (out.length >= MAX_MISMATCH_FIELDS || Object.is(left, right)) return out;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) out.push(`${path.join(".")}.length`);
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      mismatchPaths(left[index], right[index], [...path, index], out);
      if (out.length >= MAX_MISMATCH_FIELDS) break;
    }
    return out;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      mismatchPaths(left[key], right[key], [...path, key], out);
      if (out.length >= MAX_MISMATCH_FIELDS) break;
    }
    return out;
  }
  out.push(path.join("."));
  return out;
}

function summary({
  status, receiptMode, rebuiltKeys = [], repairedKeys = [],
  dirtyDays = 0, scopeDays = 0,
  periodsMatched = null,
  historyMatched = null, unchanged = false, reason = null, mismatchFields = null,
  digest = null, previousDigest = null, dirtyFromMs = null,
}) {
  return {
    status,
    receiptMode,
    rebuiltDays: rebuiltKeys.length,
    repairedDays: repairedKeys.length,
    dirtyDays,
    scopeDays,
    periodsMatched,
    historyMatched,
    unchanged,
    ...(reason === null ? {} : { reason }),
    ...(mismatchFields === null ? {} : { mismatchFields }),
    ...(digest === null ? {} : { digest }),
    ...(previousDigest === null ? {} : { previousDigest }),
    ...(dirtyFromMs === null ? {} : { dirtyFromMs }),
  };
}

/**
 * Maintain the shadow window cache beside the shipping accounting cache.
 *
 * A full accounting rebuild may pass its exact periods/history as the expected
 * output: the cache is persisted only when both match. A normal reuse cycle
 * updates the cache but makes no reader claim.
 */
export async function refreshAccountingWindowShadow({
  indexFile,
  stateFile,
  secretFile = null,
  hmacKey = null,
  unknownSpeedPolicy = DEFAULT_UNKNOWN_SPEED_POLICY,
  declaredSpeedBaselines = [],
  endMs,
  expectedPeriods = null,
  expectedHistory = null,
  // `foreground` may update an existing cache and publish source-audited
  // state, but never creates a cache or rebuilds one under a new basis.
  // `maintain` is the post-rebuild maintenance pass: it may create or rebuild.
  mode = "maintain",
  // Optional observer for the exact in-memory cache of this pass. The message
  // is read-only: mutating it would corrupt the value the caller persists.
  onCache = null,
  dayAccumulators = null,
  dayAccumulatorsRevision = null,
  // Manual repair of an inclusive UTC-day range. The maintenance pass rebuilds
  // every overlapping day even when its receipt digest did not move.
  repairFromMs = null,
  repairToMs = null,
  signal = null,
  now = () => Date.now(),
  readCache = readLocalCollectorAccountingWindowCache,
  writeCache = writeLocalCollectorAccountingWindowCache,
} = {}) {
  if (typeof indexFile !== "string" || indexFile.length === 0) {
    throw new TypeError("accounting window shadow indexFile is invalid");
  }
  if (typeof stateFile !== "string" || stateFile.length === 0) {
    throw new TypeError("accounting window shadow stateFile is invalid");
  }
  if (!Number.isSafeInteger(endMs) || endMs < 0) {
    throw new TypeError("accounting window shadow endMs is invalid");
  }
  if (!["foreground", "maintain"].includes(mode)) {
    throw new TypeError("accounting window shadow mode must be foreground or maintain");
  }
  const foreground = mode === "foreground";
  if (onCache !== null && typeof onCache !== "function") {
    throw new TypeError("accounting window shadow onCache must be a function or null");
  }
  if (dayAccumulators !== null && !(dayAccumulators instanceof Map)) {
    throw new TypeError("accounting window shadow dayAccumulators must be a Map or null");
  }
  if (dayAccumulatorsRevision !== null
      && (!Number.isSafeInteger(dayAccumulatorsRevision)
        || dayAccumulatorsRevision < 0)) {
    throw new TypeError(
      "accounting window shadow dayAccumulatorsRevision must be a non-negative safe integer or null",
    );
  }
  if (!((repairFromMs === null && repairToMs === null)
      || (Number.isSafeInteger(repairFromMs)
        && Number.isSafeInteger(repairToMs)
        && repairFromMs >= 0
        && repairFromMs <= repairToMs))) {
    throw new TypeError("accounting window shadow repair range is invalid");
  }
  if (!Array.isArray(declaredSpeedBaselines)) {
    throw new TypeError("accounting window shadow baselines are invalid");
  }
  if (expectedPeriods !== null
      && (!Array.isArray(expectedPeriods) || expectedPeriods.length !== 4)) {
    throw new TypeError("accounting window shadow expectedPeriods are invalid");
  }
  if (expectedHistory !== null && typeof expectedHistory !== "object") {
    throw new TypeError("accounting window shadow expectedHistory is invalid");
  }
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  let key = hmacKey;
  if (key === null) {
    if (typeof secretFile !== "string" || secretFile.length === 0) {
      throw fixedError("accounting_window_key_required");
    }
    key = await readExistingDeviceSalt(secretFile);
  }
  const stored = await readCache({ stateFile });
  let previous = stored.status === "available" ? stored.cache : null;
  let invalidReason = stored.status === "invalid" ? "cache_invalid" : null;
  if (previous !== null) {
    try {
      assertAccountingWindowReceipts(previous.receipts, { hmacKey: key });
    } catch (error) {
      if (error?.name === "AbortError" || error instanceof TypeError) throw error;
      previous = null;
      invalidReason = "receipts_invalid";
    }
  }
  if (previous !== null) {
    try {
      verifyAccountingWindowDays(previous, key);
    } catch (error) {
      if (error?.name === "AbortError" || error instanceof TypeError) throw error;
      previous = null;
      invalidReason = "cache_days_invalid";
    }
  }
  // The digest of the state this pass starts from. A shipping cache records
  // the digest it consumed; equality proves the incremental dirty set below
  // is relative to exactly that state, even after a failed publication.
  const previousDigest = previous === null
    ? null
    : accountingWindowCacheDigest(previous);
  // The number of window-days this pass covers. Public counters use it to
  // bound an unavailable or mismatched scope without exposing day identities.
  let scopeDays = previous?.receipts?.windows?.length ?? 0;
  if (previous === null && foreground) {
    return summary({
      status: invalidReason === null ? "absent" : "invalid",
      receiptMode: null,
      reason: invalidReason,
      scopeDays,
    });
  }
  let receipts;
  let receiptMode;
  let receiptReason = null;
  if (previous !== null) {
    const update = await updateAccountingWindowReceipts({
      previous: previous.receipts,
      indexFile,
      hmacKey: key,
      unknownSpeedPolicy,
      declaredSpeedBaselines,
      signal,
      now,
    });
    if (update.mode === "full") {
      receipts = await createAccountingWindowReceipts({
        indexFile, hmacKey: key, unknownSpeedPolicy,
        declaredSpeedBaselines, signal, now,
      });
      receiptMode = "full";
      receiptReason = update.reason;
    } else {
      receipts = update.receipts;
      receiptMode = update.mode;
    }
  } else {
    receipts = await createAccountingWindowReceipts({
      indexFile, hmacKey: key, unknownSpeedPolicy,
      declaredSpeedBaselines, signal, now,
    });
    receiptMode = "full";
  }
  scopeDays = receipts.windows.length;
  if (previous !== null
      && receipts.basisFingerprint !== previous.basisFingerprint
      && foreground) {
    return summary({
      status: "deferred",
      receiptMode,
      reason: "basis_changed",
      scopeDays,
    });
  }
  let cache;
  let rebuiltKeys = [];
  let repairedKeys = [];
  let dirtyDays = 0;
  let unchanged = false;
  let dirtyFromMs = null;
  if (previous !== null) {
    let updated;
    try {
      updated = await updateAccountingWindowCache({
        previous,
        indexFile,
        receipts,
        hmacKey: key,
        declaredSpeedBaselines,
        dayAccumulators,
        dayAccumulatorsRevision,
        repairFromMs,
        repairToMs,
        endMs,
        signal,
        now,
      });
    } catch (error) {
      const reason = accountingWindowCacheErrorReason(error);
      if (reason !== null) {
        return summary({ status: "invalid", receiptMode, reason, scopeDays });
      }
      throw error;
    }
    cache = updated.cache;
    rebuiltKeys = updated.rebuiltKeys;
    repairedKeys = updated.repaired ?? [];
    dirtyDays = updated.dirtyDays ?? 0;
    unchanged = updated.unchanged === true;
    dirtyFromMs = updated.dirtyFromMs ?? null;
  } else {
    try {
      cache = await createAccountingWindowCache({
        indexFile,
        receipts,
        hmacKey: key,
        declaredSpeedBaselines,
        dayAccumulators,
        dayAccumulatorsRevision,
        endMs,
        signal,
        now,
      });
    } catch (error) {
      const reason = accountingWindowCacheErrorReason(error);
      if (reason !== null) {
        return summary({ status: "invalid", receiptMode, reason, scopeDays });
      }
      throw error;
    }
    rebuiltKeys = receipts.windows.map(window => window.key);
    dirtyDays = receipts.windows.length;
    dirtyFromMs = receipts.windows.length === 0
      ? null
      : Math.min(...receipts.windows.map(window => window.lowerMs));
  }
  const digest = accountingWindowCacheDigest(cache);
  let periodsMatched = null;
  let historyMatched = null;
  if (expectedPeriods !== null) {
    periodsMatched = isDeepStrictEqual(cache.periods, expectedPeriods);
    historyMatched = expectedHistory === null
      ? null
      : isDeepStrictEqual(cache.history, expectedHistory);
    if (!periodsMatched || historyMatched === false) {
      const mismatchFields = [];
      for (const [index, expected] of expectedPeriods.entries()) {
        for (const path of mismatchPaths(cache.periods[index], expected)) {
          mismatchFields.push(`${expected.id ?? index}.${path}`);
          if (mismatchFields.length >= MAX_MISMATCH_FIELDS) break;
        }
        if (mismatchFields.length >= MAX_MISMATCH_FIELDS) break;
      }
      if (historyMatched === false && expectedHistory !== null
          && mismatchFields.length < MAX_MISMATCH_FIELDS) {
        for (const path of mismatchPaths(cache.history, expectedHistory)) {
          mismatchFields.push(`history.${path}`);
          if (mismatchFields.length >= MAX_MISMATCH_FIELDS) break;
        }
      }
      return summary({
        status: "mismatch",
        receiptMode,
        rebuiltKeys,
        dirtyDays,
        scopeDays,
        periodsMatched,
        historyMatched,
        unchanged,
        reason: receiptReason ?? "period_mismatch",
        mismatchFields,
      });
    }
  }
  // Time advance alone changes the folded anchors but not the stored day
  // snapshots. Rewriting an 8 MB cache every scheduler tick would be pure
  // write amplification; readers can fold the persisted days at any anchor.
  // A manual repair rebuilds days even when the index receipt did not move.
  // Treat that as a durable change so the repaired cache is published and the
  // caller cannot report completion against the old stored digest.
  const factsChanged = previous === null
    || receiptMode !== "unchanged"
    || repairedKeys.length > 0
    || dirtyDays > 0;
  const auditAdded = expectedPeriods !== null
    && (previous === null || previous.audit === null);
  const expose = () => {
    if (onCache !== null) onCache(cache);
  };
  if (!factsChanged && !auditAdded) {
    expose();
    return summary({
      status: "unchanged", receiptMode, rebuiltKeys, repairedKeys, dirtyDays, scopeDays,
      periodsMatched,
      historyMatched, unchanged: true, digest, previousDigest,
    });
  }
  cache.audit = expectedPeriods === null
    ? {
      status: "source",
      comparedAtMs: Number(now()),
      periods: 4,
      history: true,
    }
    : {
      status: "matched",
      comparedAtMs: Number(now()),
      periods: 4,
      history: expectedHistory !== null,
    };
  expose();
  signal?.throwIfAborted?.();
  await writeCache({ stateFile, cache, signal });
  return summary({
    status: previous === null ? "created" : "updated",
    receiptMode,
    rebuiltKeys,
    repairedKeys,
    dirtyDays,
    scopeDays,
    periodsMatched,
    historyMatched,
    unchanged,
    reason: receiptReason,
    digest,
    previousDigest,
    dirtyFromMs,
  });
}
