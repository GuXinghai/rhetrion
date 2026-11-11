import {
  OPENAI_CODEX_SPARK_MODEL_ID,
  recognizedCodexModelId,
} from "./export/index.js";

// Shared accounting value contracts and bounded evidence projections.

// Bound the compact durable cache, independently of the rebuild's RSS guards
// and the optional plan-scoped lane's own row/byte limits. This is a resource
// ceiling, not a history window or a preallocated memory budget.
const MAX_CACHE_BYTES = 128 * 1024 * 1024;

const ACCOUNTING_RSS_CHECK_INTERVAL = 2_048;

const COMPONENT_KEYS = Object.freeze([
  "input_uncached_tokens",
  "input_cache_read_tokens",
  "input_cache_write_tokens",
  "output_text_tokens",
  "output_reasoning_tokens",
  "output_combined_tokens",
]);

const SPEEDS = new Set(["standard", "fast", "ultrafast", "flex", "batch", "unknown"]);

const API_TIERS = new Set(["standard", "priority", "ultrafast", "flex", "batch", "unknown"]);

const SURFACES = new Set([
  "extension_or_ide",
  "scheduled_task",
  "subagent",
  "cli_exec",
  "work",
  "workspace_agent",
  "excel",
  "voice_task",
  "unknown",
]);

const AGENT_SCOPES = new Set(["root", "subagent", "automation", "unknown"]);

const LINEAGE = new Set(["standalone", "forked", "parent_linked", "unknown"]);

const SPARK_MODEL = OPENAI_CODEX_SPARK_MODEL_ID;

const TIMELINE_BUCKET_MS = 15 * 60 * 1_000;

// The exact shape Date#toISOString produces for years 0000 through 9999. A
// string of this shape whose fields are in range is the unique canonical
// representation of its instant; anything else takes the round trip below.
// Copied from the retired unified accounting source, which this module no
// longer imports.
const CANONICAL_INSTANT_SHAPE =
  /^(d{4})-(d{2})-(d{2})T(d{2}):(d{2}):(d{2}).d{3}Z$/u;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year, month) {
  if (month !== 2) return DAYS_IN_MONTH[month - 1];
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
}

function canonicalInstant(value) {
  if (typeof value !== "string") return null;
  const shape = CANONICAL_INSTANT_SHAPE.exec(value);
  if (shape !== null) {
    const month = Number(shape[2]);
    const day = Number(shape[3]);
    return month >= 1 && month <= 12
      && day >= 1 && day <= daysInMonth(Number(shape[1]), month)
      && Number(shape[4]) <= 23
      && Number(shape[5]) <= 59
      && Number(shape[6]) <= 59
      ? value
      : null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
      && new Date(timestamp).toISOString() === value
    ? value
    : null;
}

function fixedError(code, name = "Error") {
  const error = new Error(code);
  error.name = name;
  error.code = code;
  return error;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = fixedError("accounting_refresh_aborted");
  error.name = "AbortError";
  throw error;
}

function emptyComponents() {
  return Object.fromEntries(COMPONENT_KEYS.map((key) => [key, 0]));
}

function tokenTotal(components) {
  const input = (components.input_uncached_tokens ?? 0)
    + (components.input_cache_read_tokens ?? 0)
    + (components.input_cache_write_tokens ?? 0);
  const separatedOutput = (components.output_text_tokens ?? 0)
    + (components.output_reasoning_tokens ?? 0);
  const combinedOutput = components.output_combined_tokens ?? 0;
  return input + (combinedOutput > 0 ? combinedOutput : separatedOutput);
}

function safeModel(value) {
  return recognizedCodexModelId(value) ?? "unknown";
}

function addComponents(target, source) {
  for (const key of COMPONENT_KEYS) {
    const value = source?.[key];
    if (Number.isSafeInteger(value) && value >= 0) target[key] += value;
  }
}

function roundedMoney(value) {
  return Number(value.toFixed(6));
}

function publicDiagnostics(value) {
  return {
    filesScanned: Number.isSafeInteger(value?.filesScanned)
      ? value.filesScanned
      : 0,
    forkReplayEventsExcluded: Number.isSafeInteger(value?.forkReplayEventsSkipped)
      ? value.forkReplayEventsSkipped
      : 0,
    unattributedForkReplayEventsExcluded:
      Number.isSafeInteger(value?.unattributedForkReplayEventsSkipped)
        ? value.unattributedForkReplayEventsSkipped
        : 0,
    duplicateSnapshotsExcluded:
      Number.isSafeInteger(value?.duplicateSnapshotsSkipped)
        ? value.duplicateSnapshotsSkipped
        : 0,
    contradictedLeadingSnapshotsExcluded:
      Number.isSafeInteger(value?.contradictedLeadingSnapshotsSkipped)
        ? value.contradictedLeadingSnapshotsSkipped
        : 0,
    missingLineageParents: Number.isSafeInteger(value?.lineageParentsMissing)
      ? value.lineageParentsMissing
      : 0,
  };
}

function newTimelineBucket(startMs) {
  return {
    startMs,
    usageEvents: 0,
    totalTokens: 0,
    apiPriceEquivalentUsd: 0,
    speedWeighting: {},
    declaredSpeedWeighting: {},
    components: emptyComponents(),
    pricingCoverage: {
      fullyPricedEvents: 0,
      partiallyPricedEvents: 0,
      unpricedEvents: 0,
    },
  };
}

export {
  MAX_CACHE_BYTES as ACCOUNTING_CACHE_MAX_BYTES,
  ACCOUNTING_RSS_CHECK_INTERVAL,
  COMPONENT_KEYS as ACCOUNTING_COMPONENT_KEYS,
  SPEEDS as ACCOUNTING_SPEED_MODES,
  API_TIERS as ACCOUNTING_API_TIERS,
  SURFACES as ACCOUNTING_SURFACES,
  AGENT_SCOPES as ACCOUNTING_AGENT_SCOPES,
  LINEAGE as ACCOUNTING_LINEAGE_KINDS,
  SPARK_MODEL as ACCOUNTING_SPARK_MODEL,
  TIMELINE_BUCKET_MS as ACCOUNTING_TIMELINE_BUCKET_MS,
  canonicalInstant as canonicalAccountingInstant,
  fixedError as accountingError,
  throwIfAborted as throwIfAccountingAborted,
  emptyComponents as emptyAccountingComponents,
  tokenTotal as accountingTokenTotal,
  safeModel as accountingModel,
  addComponents as addAccountingComponents,
  roundedMoney as roundedAccountingMoney,
  publicDiagnostics as accountingDiagnosticSummary,
  newTimelineBucket as newAccountingTimelineBucket,
};
