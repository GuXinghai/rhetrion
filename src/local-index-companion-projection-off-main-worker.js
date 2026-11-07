import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { readLocalIndexCompanionProjection } from "./local-index-companion-source.js";
import { LOCAL_REFRESH_TIMING_STAGES } from "./local-refresh-timing.js";

export const LOCAL_INDEX_COMPANION_PROJECTION_WORKER_CONTRACT =
  "local-index-companion-projection-worker-v1";
export const LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR =
  "local_unified_companion_projection_worker_failed";
export const LOCAL_INDEX_COMPANION_PROJECTION_ABORT_ERROR =
  "local_unified_companion_projection_aborted";

const STAGES = new Set(LOCAL_REFRESH_TIMING_STAGES);
const MAXIMUM_TIMING_SPANS = 128;
const MAXIMUM_TIMING_MS = 86_400_000;
const PROPAGATED_ERRORS = new Set(["local_unified_index_unavailable"]);
const COMMON_RESULT_KEYS = [
  "status", "errorCode", "generatedAt", "indexStatus", "generation", "coveredAt",
  "usageEvents", "quotaObservations", "sourceCount", "sourceBytes",
  "discoveredSourceCount", "discoveredSourceBytes", "indexedSourceCount",
  "indexedSourceBytes", "skippedSourceCount", "skippedSourceBytes",
  "skippedThreadCount", "responseUnverifiedPrefixTurns", "cumulativePrefixUnattributed",
  "rolloutIssueCounts", "indexBytes", "latestExportableRecordAt", "tools",
  "toolCoverageStatus", "toolCoverageBlockReason", "usage", "cacheSwitchImpact",
  "cacheContinuityImpact", "timeline",
];
const AVAILABLE_RESULT_KEYS = [...COMMON_RESULT_KEYS, "buildInProgress", "readWallMs"];
const exactKeys = (value, keys) => value !== null && typeof value === "object"
  && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));

export function validLocalIndexCompanionWorkerOptions(value) {
  return exactKeys(value, ["indexFile", "nowMs", "declaredSpeedBaselines", "mode"])
    && typeof value.indexFile === "string" && value.indexFile.length > 0
    && Number.isFinite(value.nowMs) && ["full", "deferred"].includes(value.mode)
    && Array.isArray(value.declaredSpeedBaselines) && value.declaredSpeedBaselines.length <= 64
    && value.declaredSpeedBaselines.every(window => exactKeys(window, ["mode", "firstSeenAt", "lastSeenAt"])
      && ["standard", "fast", "ultrafast"].includes(window.mode)
      && [window.firstSeenAt, window.lastSeenAt].every(at => typeof at === "string"
        && at.length <= 32 && Number.isFinite(Date.parse(at))
        && new Date(Date.parse(at)).toISOString() === at)
      && Date.parse(window.firstSeenAt) <= Date.parse(window.lastSeenAt));
}

export function validLocalIndexCompanionWorkerTimings(value) {
  return Array.isArray(value) && value.length <= MAXIMUM_TIMING_SPANS
    && value.every(span => exactKeys(span, ["stage", "wallMs", "outcome"])
      && STAGES.has(span.stage) && Number.isFinite(span.wallMs)
      && span.wallMs >= 0 && span.wallMs <= MAXIMUM_TIMING_MS
      && ["completed", "failed", "cancelled"].includes(span.outcome));
}

// The domain reader owns the nested projection contracts. Close this worker's
// framing and top-level DTO so it cannot accidentally return a work projection,
// raw SQLite row, source path or a new unreviewed payload beside those figures.
export function validLocalIndexCompanionWorkerResult(value) {
  if (!value || !["available", "missing", "unavailable", "deferred"].includes(value.status)) return false;
  if (!exactKeys(value, value.status === "available" ? AVAILABLE_RESULT_KEYS : COMMON_RESULT_KEYS)) return false;
  return Array.isArray(value.usage) && value.tools !== null && typeof value.tools === "object"
    && value.coveredAt !== null && typeof value.coveredAt === "object"
    && (value.errorCode === null || typeof value.errorCode === "string"
      && /^(?:local_unified_index|local_index)_[a-z_]+$/u.test(value.errorCode))
    && (value.status !== "available" || value.generation !== null
      && typeof value.generation === "object" && Number.isSafeInteger(value.generation.id)
      && value.generation.id >= 1 && /^generation-v2-[a-f0-9]{64}$/u.test(value.generation.fingerprint));
}

export function safeLocalIndexCompanionWorkerError(code) {
  return PROPAGATED_ERRORS.has(code) ? code : LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR;
}

/** The reader closes its read-only connection before resolving or throwing. */
export async function runLocalIndexCompanionProjectionWorkerThread({
  port = parentPort, data = workerData,
} = {}) {
  if (port === null) throw new Error(LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR);
  try {
    if (!exactKeys(data, ["contract", "options"])
        || data.contract !== LOCAL_INDEX_COMPANION_PROJECTION_WORKER_CONTRACT
        || !validLocalIndexCompanionWorkerOptions(data.options)) {
      throw new Error(LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR);
    }
    const timings = [];
    const result = await readLocalIndexCompanionProjection({
      ...data.options,
      includeWorkUsage: false,
      onTiming(span) {
        if (timings.length >= MAXIMUM_TIMING_SPANS
            || !validLocalIndexCompanionWorkerTimings([span])) return;
        timings.push({ stage: span.stage, wallMs: span.wallMs, outcome: span.outcome });
      },
    });
    if (!validLocalIndexCompanionWorkerResult(result)) {
      throw new Error(LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR);
    }
    port.postMessage({ type: "result", result, timings });
  } catch (error) {
    port.postMessage({ type: "error", code: safeLocalIndexCompanionWorkerError(error?.code) });
  } finally {
    port.close();
  }
}

// Static import of this contract from the wrapper also includes this entrypoint
// in the reviewed runtime closure. Unrelated worker imports never claim a port.
if (!isMainThread && workerData?.contract === LOCAL_INDEX_COMPANION_PROJECTION_WORKER_CONTRACT) {
  await runLocalIndexCompanionProjectionWorkerThread();
}
