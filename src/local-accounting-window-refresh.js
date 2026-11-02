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
  createAccountingWindowCache,
  updateAccountingWindowCache,
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
  status, receiptMode, rebuiltKeys = [], periodsMatched = null,
  historyMatched = null, unchanged = false, reason = null, mismatchFields = null,
}) {
  return {
    status,
    receiptMode,
    rebuiltDays: rebuiltKeys.length,
    periodsMatched,
    historyMatched,
    unchanged,
    ...(reason === null ? {} : { reason }),
    ...(mismatchFields === null ? {} : { mismatchFields }),
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
  allowCreate = true,
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
  if (typeof allowCreate !== "boolean") {
    throw new TypeError("accounting window shadow allowCreate must be boolean");
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
  let invalidReceipts = false;
  if (previous !== null) {
    try {
      assertAccountingWindowReceipts(previous.receipts, { hmacKey: key });
    } catch (error) {
      if (error?.name === "AbortError" || error instanceof TypeError) throw error;
      previous = null;
      invalidReceipts = true;
    }
  }
  if (previous === null && !allowCreate) {
    return summary({
      status: invalidReceipts ? "invalid" : "absent",
      receiptMode: null,
      reason: invalidReceipts ? "receipts_invalid" : null,
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
      signal,
      now,
    });
    if (update.mode === "full") {
      receipts = await createAccountingWindowReceipts({
        indexFile, hmacKey: key, unknownSpeedPolicy, signal, now,
      });
      receiptMode = "full";
      receiptReason = update.reason;
    } else {
      receipts = update.receipts;
      receiptMode = update.mode;
    }
  } else {
    receipts = await createAccountingWindowReceipts({
      indexFile, hmacKey: key, unknownSpeedPolicy, signal, now,
    });
    receiptMode = "full";
  }
  let cache;
  let rebuiltKeys = [];
  let unchanged = false;
  if (previous !== null && receiptMode !== "full") {
    const updated = await updateAccountingWindowCache({
      previous,
      indexFile,
      receipts,
      hmacKey: key,
      declaredSpeedBaselines,
      endMs,
      signal,
      now,
    });
    cache = updated.cache;
    rebuiltKeys = updated.rebuiltKeys;
    unchanged = updated.unchanged === true;
  } else {
    cache = await createAccountingWindowCache({
      indexFile,
      receipts,
      hmacKey: key,
      declaredSpeedBaselines,
      endMs,
      signal,
      now,
    });
    rebuiltKeys = receipts.windows.map(window => window.key);
  }
  let periodsMatched = null;
  let historyMatched = null;
  if (expectedPeriods !== null) {
    periodsMatched = isDeepStrictEqual(cache.periods, expectedPeriods);
    historyMatched = expectedHistory === null
      || isDeepStrictEqual(cache.history, expectedHistory);
    if (!periodsMatched || !historyMatched) {
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
  const factsChanged = previous === null || receiptMode !== "unchanged";
  const auditAdded = expectedPeriods !== null
    && (previous === null || previous.audit === null);
  if (!factsChanged && !auditAdded) {
    return summary({
      status: "unchanged", receiptMode, rebuiltKeys, periodsMatched,
      historyMatched, unchanged: true,
    });
  }
  if (expectedPeriods !== null) {
    cache.audit = {
      status: "matched",
      comparedAtMs: Number(now()),
      periods: 4,
      history: expectedHistory !== null,
    };
  }
  signal?.throwIfAborted?.();
  await writeCache({ stateFile, cache, signal });
  return summary({
    status: previous === null ? "created" : "updated",
    receiptMode,
    rebuiltKeys,
    periodsMatched,
    historyMatched,
    unchanged,
    reason: receiptReason,
  });
}
