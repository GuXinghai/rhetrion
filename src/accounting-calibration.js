import {
  ACCOUNTING_COMPONENT_KEYS as COMPONENT_KEYS,
  ACCOUNTING_RSS_CHECK_INTERVAL,
  ACCOUNTING_TIMELINE_BUCKET_MS as TIMELINE_BUCKET_MS,
  accountingError as fixedError,
  accountingTokenTotal as tokenTotal,
  addAccountingComponents as addComponents,
  canonicalAccountingInstant as canonicalInstant,
  newAccountingTimelineBucket as newTimelineBucket,
  roundedAccountingMoney as roundedMoney,
  throwIfAccountingAborted as throwIfAborted,
} from "./accounting-values.js";
import { declaredSpeedModeAt } from "./codex-speed-baseline.js";
import {
  CODEX_TRANSITION_DERIVATION_CEILINGS,
  deriveCodexTransitionSeriesCooperatively,
} from "./codex-transition-miner.js";
import { stableJson } from "./export/canonical-json.js";
import { createLocalRefreshTimer } from "./local-refresh-timing.js";
import {
  DEFAULT_UNKNOWN_SPEED_POLICY,
  mixUnknownSpeedUsd,
} from "./unknown-speed-policy.js";
import {
  FAST_MODE_ASSUMED_MULTIPLIER,
  FAST_MODE_QUOTA_MULTIPLIERS,
  costWarningCodes,
  quotaWeightedApiPriceEquivalent,
} from "@app-usagemonitor/accounting";
import {
  FIVE_HOUR_WINDOW_MINUTES,
  MODEL_COMPOSITION_POLICY,
  SEVEN_DAY_WINDOW_MINUTES,
  blendedCompositionCapacityUsd,
  buildCompositionObservations,
  buildPlanAttributionIndex,
  calibrateCompositionCapacities,
  classifyUsageAttribution,
  planAttributionContextKey,
  planEraForInterval,
} from "@app-usagemonitor/quota-analysis";
import { createHash } from "node:crypto";

// Shared accounting calibration over a supplied bounded corpus.

const ALLOWANCE_CAPACITY_SCHEMA_VERSION =
  "codex-primary-allowance-capacity-v0.2";

const PLAN_SCOPED_TIMELINE_SCHEMA_VERSION =
  "local-plan-scoped-accounting-timeline-v2";

const PLAN_SCOPED_ATTRIBUTION_METHOD_VERSION = "plan-era-v1";

const ALLOWANCE_SCENARIO_CANDIDATES = Object.freeze({
  unresolved_as_standard: "speed_lower",
  unresolved_as_fast: "speed_upper",
  unresolved_as_custom: "speed_custom",
});

// Resource ceilings, not retention windows: refuse this optional comparison
// lane as a whole rather than truncating history or failing ordinary accounting.
const MAX_PLAN_TIMELINE_ROWS = 100_000;

const MAX_PLAN_TIMELINE_BYTES = 4 * 1024 * 1024;

const PLAN_TIMELINE_ENCODING = "plan_bucket_v2";

const WEEKLY_WINDOW_MINUTES = SEVEN_DAY_WINDOW_MINUTES;

const ALLOWANCE_HISTORY_WINDOW_MINUTES = new Set([
  FIVE_HOUR_WINDOW_MINUTES,
  WEEKLY_WINDOW_MINUTES,
]);

const MAX_RETAINED_TRANSITION_BYTES = 320 * 1024 * 1024;

const COMPACT_USAGE_RETAINED_BYTES = 352;

const COMPACT_SNAPSHOT_RETAINED_BYTES = 192;

// Exact typed-buffer storage: two Float64 stamp columns, then Uint8 +
// Int32 + Float64 + Uint8 attribution memo columns. SQLite page objects,
// dictionaries and decoded batches remain covered by the unchanged RSS guard.
const STREAMED_USAGE_STAMP_BYTES = 16;

const STREAMED_USAGE_MEMO_BYTES = 14;

const DEFAULT_TRANSITION_RESOURCE_LIMITS = Object.freeze({
  usageEvents: CODEX_TRANSITION_DERIVATION_CEILINGS.usageEvents,
  weeklySnapshots:
    CODEX_TRANSITION_DERIVATION_CEILINGS.rateLimitSnapshots,
  combinedInputs: CODEX_TRANSITION_DERIVATION_CEILINGS.totalInputs,
  retainedBytes: MAX_RETAINED_TRANSITION_BYTES,
});

function transitionResourceLimits(value) {
  if (value === null || value === undefined) {
    return DEFAULT_TRANSITION_RESOURCE_LIMITS;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("transitionResourceLimits must be an object or null");
  }
  const ceilings = {
    usageEvents: CODEX_TRANSITION_DERIVATION_CEILINGS.usageEvents,
    weeklySnapshots:
      CODEX_TRANSITION_DERIVATION_CEILINGS.rateLimitSnapshots,
    combinedInputs: CODEX_TRANSITION_DERIVATION_CEILINGS.totalInputs,
    retainedBytes: MAX_RETAINED_TRANSITION_BYTES,
  };
  const allowed = new Set(Object.keys(ceilings));
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError("transitionResourceLimits contains an unknown key");
  }
  return Object.fromEntries(Object.entries(ceilings).map(([key, ceiling]) => {
    const selected = value[key] ?? ceiling;
    if (!Number.isSafeInteger(selected) || selected < 1 || selected > ceiling) {
      throw new TypeError(
        `transitionResourceLimits.${key} must be between 1 and ${ceiling}`,
      );
    }
    return [key, selected];
  }));
}

function transitionUsageProjection(event, projection) {
  const components = COMPONENT_KEYS.map((key) => (
    Number.isSafeInteger(event.components?.[key])
      && event.components[key] >= 0
      ? event.components[key]
      : 0
  ));
  const costUsd = Number(projection.priced.totalUsd);
  const multiplier = FAST_MODE_QUOTA_MULTIPLIERS[projection.fastModeFamily] ?? null;
  // The scenario retains the owner-approved assumed ratio when Priority
  // context/date evidence is missing. The period crossing reports that
  // Standard cost separately in the explicit unsupported/assumed bucket.
  const fastWeightedEquivalentUsd =
    costUsd * (multiplier ?? FAST_MODE_ASSUMED_MULTIPLIER);
  const effectiveSpeed = ["standard", "fast", "ultrafast"].includes(projection.speed)
    ? projection.speed
    : ["standard", "fast", "ultrafast"].includes(projection.declaredSpeed)
      ? projection.declaredSpeed
      : "unknown";
  const ultrafastUsd = effectiveSpeed === "ultrafast" ? quotaWeightedApiPriceEquivalent({
    apiPriceEquivalentUsd: costUsd, model: projection.model, mode: effectiveSpeed,
    eventTime: event.timestamp, standardPriceCardIds: projection.priced.selectedPriceCardIds,
  }).usd : null;
  const quotaWeightedLowerUsd = effectiveSpeed === "ultrafast" ? ultrafastUsd
    : effectiveSpeed === "fast" ? fastWeightedEquivalentUsd : costUsd;
  const quotaWeightedUpperUsd = effectiveSpeed === "ultrafast" ? ultrafastUsd
    : effectiveSpeed === "standard" ? costUsd : fastWeightedEquivalentUsd;
  return [
    canonicalInstant(event.timestamp),
    projection.model,
    Number.isSafeInteger(event.totalInputContextTokens)
      && event.totalInputContextTokens >= 0
      ? event.totalInputContextTokens
      : 0,
    ...components,
    projection.speed,
    Number.isFinite(costUsd) ? costUsd : 0,
    projection.priced.totalUsd,
    projection.priced.coverageStatus,
    fastWeightedEquivalentUsd,
    quotaWeightedLowerUsd,
    quotaWeightedUpperUsd,
    costWarningCodes(projection.priced),
    projection.priced.warnings.coverage
      .map((warning) => warning.code)
      .sort(),
    projection.priced.selectedPriceCardIds,
    projection.priced.priceCardBreakdown ?? [],
    [
      event.planAttribution?.basis ?? "unavailable",
      event.planAttribution?.planType ?? null,
      event.usageIntervalStartedAt ?? null,
      event.usageIntervalBasis ?? "unavailable",
    ],
  ];
}

// Keep the first and last observation of a chronological same-plan run. Its
// last old/first new anchors delimit the uncertain switch interval. This is
// independent of percent, reset and token changes, so quota-only evidence
// survives the fit-oriented snapshot collapse below.
function calibrationPlanEvidence({ ordered = false, maximum = 750_000 } = {}) {
  const rows = [];
  const runs = new Map();
  let latestMs = Number.NEGATIVE_INFINITY;
  let latestPlans = new Set();
  const planTypes = new Set();
  return {
    observe(snapshot) {
      const window = snapshot?.window;
      const observedAtMs = Number.isFinite(snapshot?.timestampMs)
        ? snapshot.timestampMs : Date.parse(snapshot?.timestamp);
      if (!window || window.provider !== "openai_codex" || window.limitId !== "codex"
          || !Number.isSafeInteger(observedAtMs)) return;
      const planType = typeof window.planType === "string" && /^[a-z][a-z0-9_-]{0,31}$/u.test(window.planType)
        ? window.planType : "unknown";
      if (planType !== "unknown") {
        planTypes.add(planType);
        if (observedAtMs > latestMs) { latestMs = observedAtMs; latestPlans = new Set(); }
        if (observedAtMs === latestMs) latestPlans.add(planType);
      }
      const row = {
        contextKey: planAttributionContextKey(window.provider, window.limitId),
        observedAtMs, planType, planVariant: "unknown", accountScopeId: null,
      };
      const run = runs.get(row.contextKey);
      if (ordered && run?.planType === planType && observedAtMs >= run.lastMs) {
        if (run.lastIndex === run.firstIndex) {
          run.lastIndex = rows.length;
          rows.push(row);
        } else rows[run.lastIndex] = row;
        run.lastMs = observedAtMs;
      } else {
        runs.set(row.contextKey, { planType, firstIndex: rows.length, lastIndex: rows.length, lastMs: observedAtMs });
        rows.push(row);
      }
      if (rows.length > maximum) throw fixedError("accounting_transition_snapshot_limit_exceeded");
    },
    finish() {
      const index = buildPlanAttributionIndex(rows);
      rows.length = 0;
      runs.clear();
      if (index.status !== "ready") throw fixedError("accounting_transition_derivation_limit_exceeded");
      return {
        index,
        summary: {
          planTypes: [...planTypes].sort(),
          latestPlanType: latestPlans.size === 1 ? [...latestPlans][0] : "unknown",
          singlePlanComparisonEligible: planTypes.size === 1 && index.conflicts.length === 0,
        },
      };
    },
  };
}

function weeklyRateLimitProjection(snapshot) {
  const window = snapshot.window;
  const boundedText = (value) => (
    typeof value === "string"
      && value.length > 0
      && value.length <= 64
      ? value
      : "unknown"
  );
  return [
    canonicalInstant(snapshot.timestamp),
    Number.isFinite(snapshot.timestampMs)
      ? snapshot.timestampMs
      : Date.parse(snapshot.timestamp),
    boundedText(window.provider),
    boundedText(window.planType),
    boundedText(window.limitId),
    boundedText(window.slot),
    window.windowDurationMins,
    window.resetsAt,
    window.usedPercent,
  ];
}

function compactPlanScopedTimelineEvent(row, declaredSpeedBaselines) {
  if (!Array.isArray(row) || row.length !== 21
      || !Array.isArray(row[20]) || row[20].length !== 4) return null;
  const timestamp = canonicalInstant(row[0]);
  const components = Object.fromEntries(COMPONENT_KEYS.map((key, index) => [
    key,
    Number.isSafeInteger(row[index + 3]) && row[index + 3] >= 0
      ? row[index + 3] : null,
  ]));
  const standardUsd = Number(row[10]);
  const standardScenarioUsd = row[14];
  const fastScenarioUsd = row[15];
  if (timestamp === null || Object.values(components).includes(null)
      || !Number.isFinite(standardUsd) || standardUsd < 0
      || !Number.isFinite(standardScenarioUsd) || standardScenarioUsd < 0
      || !Number.isFinite(fastScenarioUsd) || fastScenarioUsd < 0
      || !["fully_priced", "partially_priced", "unpriced"].includes(row[12])) {
    return null;
  }
  const speed = ["standard", "fast", "ultrafast"].includes(row[9]) ? row[9] : "unknown";
  // Re-run the same timestamped declaration lookup used when the compact row
  // was constructed. Dollar equality is not provenance: it can also arise for
  // a zero-cost event (or a future 1x rate), so inferring a declaration from
  // equal scenario totals would silently relabel unknown evidence.
  const declarationResolved = speed === "unknown"
    && ["standard", "fast", "ultrafast"].includes(
      declaredSpeedModeAt(declaredSpeedBaselines, Date.parse(timestamp)),
    );
  return {
    timestamp,
    components,
    totalTokens: tokenTotal(components),
    standardUsd,
    standardScenarioUsd,
    fastScenarioUsd,
    pricingCoverageStatus: row[12],
    observedSpeed: speed !== "unknown",
    declarationResolved,
  };
}

function addCompactPlanScopedTimelineEvent(buckets, event) {
  const observedMs = Date.parse(event.timestamp);
  const startMs = Math.floor(observedMs / TIMELINE_BUCKET_MS)
    * TIMELINE_BUCKET_MS;
  const bucket = buckets.get(startMs) ?? {
    ...newTimelineBucket(startMs),
    scenarioWeighting: {
      unresolved_as_standard: 0,
      unresolved_as_fast: 0,
      unresolved_as_custom: 0,
    },
    weightingCoverage: {
      observedEvents: 0,
      declaredFromConfigEvents: 0,
      assumedEvents: 0,
    },
  };
  bucket.usageEvents += 1;
  bucket.totalTokens += event.totalTokens;
  bucket.apiPriceEquivalentUsd += event.standardUsd;
  bucket.scenarioWeighting.unresolved_as_standard +=
    event.standardScenarioUsd;
  bucket.scenarioWeighting.unresolved_as_fast += event.fastScenarioUsd;
  // Mix aggregate endpoint costs once, when the bucket is finalized.
  addComponents(bucket.components, event.components);
  bucket.pricingCoverage[
    event.pricingCoverageStatus === "fully_priced"
      ? "fullyPricedEvents"
      : event.pricingCoverageStatus === "partially_priced"
        ? "partiallyPricedEvents"
        : "unpricedEvents"
  ] += 1;
  if (event.observedSpeed) bucket.weightingCoverage.observedEvents += 1;
  else if (event.declarationResolved) {
    bucket.weightingCoverage.declaredFromConfigEvents += 1;
  } else {
    bucket.weightingCoverage.assumedEvents += 1;
  }
  buckets.set(startMs, bucket);
  return startMs;
}

function finalizePlanScopedTimelineDraft({
  unknownSpeedPolicy,
  buckets,
  invalidBuckets,
  attributionIndex,
  contextKey,
  planType,
  diagnostics,
  endMs,
  resourceLimited,
  quota,
}) {
  let invalidatedCandidateEvents = 0;
  let invalidatedBuckets = 0;
  const rows = [];
  for (const bucket of [...buckets.values()].sort((left, right) => (
    left.startMs - right.startMs
  ))) {
    const lookup = planEraForInterval(attributionIndex, {
      contextKey,
      intervalStartMs: bucket.startMs,
      observedAtMs: bucket.startMs + TIMELINE_BUCKET_MS - 1,
    });
    if (invalidBuckets.has(bucket.startMs)
        || lookup.status !== "matched"
        || lookup.era.planType !== planType) {
      invalidatedBuckets += 1;
      invalidatedCandidateEvents += bucket.usageEvents;
      invalidBuckets.add(bucket.startMs);
      continue;
    }
    bucket.scenarioWeighting.unresolved_as_custom = mixUnknownSpeedUsd(
      roundedMoney(bucket.scenarioWeighting.unresolved_as_standard),
      roundedMoney(bucket.scenarioWeighting.unresolved_as_fast), unknownSpeedPolicy);
    rows.push({
      startAt: new Date(bucket.startMs).toISOString(),
      endAt: new Date(bucket.startMs + TIMELINE_BUCKET_MS).toISOString(),
      usageEvents: bucket.usageEvents,
      totalTokens: bucket.totalTokens,
      apiPriceEquivalentUsd: roundedMoney(bucket.apiPriceEquivalentUsd),
      scenarioWeighting: Object.fromEntries(
        Object.entries(bucket.scenarioWeighting).map(([scenario, value]) => [
          scenario,
          roundedMoney(value),
        ]),
      ),
      weightingCoverage: { ...bucket.weightingCoverage },
      components: bucket.components,
      pricingCoverage: bucket.pricingCoverage,
    });
  }
  // Publish explicit comparable intervals, including quiet buckets, so a
  // consumer cannot bridge an omitted ambiguous bucket or another plan era.
  // Bounds come from the same attribution index, not the fit's training resets.
  const comparisonIntervals = [];
  const currentStart = Math.floor(endMs / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS;
  const firstStart = Math.min(rows.length ? Date.parse(rows[0].startAt) : currentStart,
    quota.length ? Math.floor(quota[0][0] / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS : currentStart);
  const lastEnd = (Math.floor(endMs / TIMELINE_BUCKET_MS) + 1) * TIMELINE_BUCKET_MS;
  const invalid = [...invalidBuckets].sort((a, b) => a - b);
  let invalidAt = 0;
  for (const era of attributionIndex?.eras ?? []) {
    if (era.contextKey !== contextKey || era.accountScopeId !== null
        || era.planType !== planType) continue;
    let start = Math.max(firstStart, era.lowerBoundMs === null ? firstStart
      : Math.ceil(era.lowerBoundMs / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS);
    const end = Math.min(lastEnd, era.upperBoundMs === null ? lastEnd
      : Math.floor((era.upperBoundMs + 1) / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS);
    while (invalidAt < invalid.length && invalid[invalidAt] < start) invalidAt += 1;
    while (invalidAt < invalid.length && invalid[invalidAt] < end) {
      const gapStart = invalid[invalidAt++];
      if (gapStart > start) comparisonIntervals.push([start, gapStart]);
      start = gapStart + TIMELINE_BUCKET_MS;
    }
    if (start < end) comparisonIntervals.push([start, end]);
  }
  const comparableQuota = [];
  let quotaIntervalAt = 0;
  for (const row of quota) {
    while (quotaIntervalAt < comparisonIntervals.length
        && comparisonIntervals[quotaIntervalAt][1] <= row[0]) quotaIntervalAt += 1;
    const interval = comparisonIntervals[quotaIntervalAt];
    if (interval && row[0] >= interval[0] && row[0] < interval[1]) comparableQuota.push(row);
  }
  const excluded = new Map();
  for (const era of attributionIndex?.eras ?? []) {
    if (era.contextKey !== contextKey || era.accountScopeId !== null || era.planType !== planType) continue;
    for (const boundary of [era.lowerBoundMs, era.upperBoundMs]) {
      if (boundary === null) continue;
      const start = Math.floor(boundary / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS;
      if (start >= firstStart && start < lastEnd) excluded.set(start, "plan_transition_interval");
    }
    const lower = Math.max(firstStart, era.firstObservedAtMs - TIMELINE_BUCKET_MS);
    const upper = Math.min(lastEnd - 1, era.lastObservedAtMs);
    for (let i = firstIndexAtLeast(invalid, lower); i < invalid.length && invalid[i] <= upper; i += 1) {
      if (!excluded.has(invalid[i])) excluded.set(invalid[i], "usage_attribution_unresolved");
    }
  }
  const excludedIntervals = [];
  let comparableAt = 0;
  for (const [start, reason] of [...excluded].sort((a, b) => a[0] - b[0])) {
    // A boundary exactly on the grain can be fully covered. Never call a
    // positively comparable bucket missing just because it borders an era.
    while (comparableAt < comparisonIntervals.length && comparisonIntervals[comparableAt][1] <= start) comparableAt += 1;
    const covered = comparisonIntervals[comparableAt];
    if (covered && start >= covered[0] && start + TIMELINE_BUCKET_MS <= covered[1]) continue;
    const prior = excludedIntervals.at(-1);
    if (prior && prior[1] === start && prior[2] === reason) prior[1] += TIMELINE_BUCKET_MS;
    else excludedIntervals.push([start, start + TIMELINE_BUCKET_MS, reason]);
  }
  return {
    planType,
    rows,
    comparisonIntervals,
    excludedIntervals,
    resourceLimited,
    attributionReady: attributionIndex?.status === "ready",
    quota: comparableQuota,
    observedQuota: quota,
    diagnostics: {
      ...diagnostics,
      admittedEvents: rows.reduce((sum, row) => sum + row.usageEvents, 0),
      invalidatedBuckets,
      invalidatedCandidateEvents,
    },
  };
}

// Closed compact form avoids duplicating full object keys for every historical
// bucket. Keep the event-summed token total: combined-output and split-output
// events can coexist in one bucket. Only coverage complements are derived.
function encodePlanScopedTimelineRow(row) {
  return [Date.parse(row.startAt), row.usageEvents,
    ...COMPONENT_KEYS.map((key) => row.components[key]),
    row.apiPriceEquivalentUsd,
    row.scenarioWeighting.unresolved_as_standard,
    row.scenarioWeighting.unresolved_as_fast,
    row.weightingCoverage.observedEvents,
    row.weightingCoverage.declaredFromConfigEvents,
    row.pricingCoverage.fullyPricedEvents,
    row.pricingCoverage.partiallyPricedEvents, row.totalTokens,
    row.scenarioWeighting.unresolved_as_custom];
}

function decodePlanScopedTimelineRow(row) {
  if (!Array.isArray(row) || row.length !== 17
      || row.some((value) => typeof value !== "number" || !Number.isFinite(value))
      || !Number.isSafeInteger(row[0]) || row[0] % TIMELINE_BUCKET_MS !== 0
      || !Number.isFinite(new Date(row[0] + TIMELINE_BUCKET_MS).getTime())
      || row.slice(1).some((value) => value < 0)
      || [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15].some((i) => !Number.isSafeInteger(row[i]))
      || row[1] < 1 || row[11] + row[12] > row[1]
      || row[13] + row[14] > row[1]) return null;
  const components = Object.fromEntries(COMPONENT_KEYS.map((key, i) => [key, row[i + 2]]));
  return {
    startAt: new Date(row[0]).toISOString(),
    endAt: new Date(row[0] + TIMELINE_BUCKET_MS).toISOString(),
    usageEvents: row[1], totalTokens: row[15], components,
    apiPriceEquivalentUsd: row[8],
    scenarioWeighting: { unresolved_as_standard: row[9], unresolved_as_fast: row[10], unresolved_as_custom: row[16] },
    weightingCoverage: { observedEvents: row[11], declaredFromConfigEvents: row[12],
      assumedEvents: row[1] - row[11] - row[12] },
    pricingCoverage: { fullyPricedEvents: row[13], partiallyPricedEvents: row[14],
      unpricedEvents: row[1] - row[13] - row[14] },
  };
}

function unavailablePlanTimeline(reason) {
  return {
    schemaVersion: PLAN_SCOPED_TIMELINE_SCHEMA_VERSION,
    encoding: PLAN_TIMELINE_ENCODING,
    status: "unavailable", reason, planScope: null, usage: [], quota: [], observedQuota: [], comparisonIntervals: [], excludedIntervals: [],
    diagnostics: { consideredEvents: 0, admittedEvents: 0, incompatibleEvents: 0,
      unresolvedEvents: 0, conflictedEvents: 0, malformedEvents: 0,
      invalidatedBuckets: 0, invalidatedCandidateEvents: 0 },
  };
}

function calibrationCohortId(calibration) {
  if (calibration?.status !== "estimated"
      || !Array.isArray(calibration.recentResets)
      || calibration.recentResets.length === 0) return null;
  const cohort = calibration.recentResets.map((row) => row?.resetIdentity);
  if (cohort.some((value) => canonicalInstant(value) === null)) return null;
  return createHash("sha256").update(JSON.stringify(cohort)).digest("hex");
}

function planScopedTimelineReceipt({
  draft,
  sourceMode,
  generation,
  generationFingerprint,
  capacityPlanScope,
}) {
  const unavailable = unavailablePlanTimeline;
  if (sourceMode !== "unified"
      || generation === null || generation === undefined
      || generationFingerprint === null
      || generationFingerprint === undefined) {
    return unavailable("plan_scoped_generation_unavailable");
  }
  if (!draft || draft.attributionReady !== true || draft.planType === "unknown"
      || draft.diagnostics?.malformedEvents !== 0
      || capacityPlanScope?.planType !== draft.planType
      || capacityPlanScope?.methodVersion
        !== PLAN_SCOPED_ATTRIBUTION_METHOD_VERSION) {
    return unavailable("plan_scoped_attribution_unavailable");
  }
  if (draft.resourceLimited || draft.rows.length > MAX_PLAN_TIMELINE_ROWS
      || draft.comparisonIntervals.length > MAX_PLAN_TIMELINE_ROWS
      || draft.excludedIntervals.length > MAX_PLAN_TIMELINE_ROWS
      || draft.observedQuota.length > MAX_PLAN_TIMELINE_ROWS
      || draft.quota.length > MAX_PLAN_TIMELINE_ROWS) return unavailable("plan_scoped_resource_limit");
  const receipt = {
    schemaVersion: PLAN_SCOPED_TIMELINE_SCHEMA_VERSION,
    encoding: PLAN_TIMELINE_ENCODING,
    status: "available",
    reason: null,
    planScope: {
      ...capacityPlanScope,
      sourceGeneration: generation,
      sourceGenerationFingerprint: generationFingerprint,
    },
    usage: draft.rows.map(encodePlanScopedTimelineRow),
    comparisonIntervals: draft.comparisonIntervals,
    excludedIntervals: draft.excludedIntervals,
    quota: draft.quota,
    observedQuota: draft.observedQuota,
    diagnostics: draft.diagnostics,
  };
  return Buffer.byteLength(stableJson(receipt)) <= MAX_PLAN_TIMELINE_BYTES
    ? receipt : unavailable("plan_scoped_resource_limit");
}

// Select an existing fit, never pool plans or refit a history lane using the
// current plan's capacity. This is a projection, not an additional ledger.
function allowanceCapacityForPlan(container, planType) {
  const scenarios = {};
  for (const [scenario, row] of Object.entries(container.scenarios)) {
    const calibration = row.calibration;
    const population = calibration.planPopulations.find((p) => p.planType === planType);
    if (!population) return null;
    scenarios[scenario] = { ...row, calibration: {
      ...population, selectedPlanType: planType, planPopulations: calibration.planPopulations,
    } };
  }
  return { ...container, scenarios, planScope: {
    ...container.planScope, planType,
    cohortId: calibrationCohortId(scenarios[container.selectedScenario].calibration),
  } };
}

async function fitHistoricalPlanTimelines(options, planTypes, currentPlanType) {
  if (!Array.isArray(planTypes) || planTypes.length > 16) {
    throw fixedError("accounting_transition_derivation_limit_exceeded");
  }
  const results = [];
  for (const planType of [...new Set(planTypes)].sort()) {
    if (planType === currentPlanType || planType === "unknown") continue;
    throwIfAborted(options.signal);
    try {
      const fit = await fitCompositionFromCorpusStream({ ...options, selectedPlanType: planType });
      results.push({ planType, draft: fit.planScopedTimeline, failure: null });
    } catch (error) {
      throwIfAborted(options.signal);
      results.push({ planType, draft: null, failure: compositionFitFailureReason(error) });
    }
  }
  return results;
}

function historicalPlanComparisonReceipts(drafts, capacity, provenance) {
  let retainedBytes = 0;
  return drafts.map(({ planType, draft, failure }) => {
    const allowanceCapacityByScenario = allowanceCapacityForPlan(capacity, planType);
    const row = { planType, failure, allowanceCapacityByScenario,
      planScopedTimeline: planScopedTimelineReceipt({
        ...provenance, draft, capacityPlanScope: allowanceCapacityByScenario?.planScope,
      }),
    };
    const bytes = Buffer.byteLength(stableJson(row));
    if (retainedBytes + bytes > MAX_PLAN_TIMELINE_BYTES) {
      row.planScopedTimeline = unavailablePlanTimeline("plan_scoped_resource_limit");
      row.failure = "accounting_plan_timeline_resource_limit";
    } else retainedBytes += bytes;
    return row;
  });
}

function cooperativeYield() {
  return new Promise((resolve) => setImmediate(resolve));
}

function firstIndexAtLeast(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstIndexAbove(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Mirror of the transition miner's windowKey over the compact snapshot
// encoding [timestamp, timestampMs, provider, planType, limitId, slot,
// windowDurationMins, resetsAt, usedPercent]. Transitions are derived from
// consecutive snapshots WITHIN one of these groups, never across groups,
// which is what makes the batched derivation below exact. Window identity is
// slot-agnostic (v0.6), exactly like the miner's windowKey: slot is a UI
// role, so grouping on it here would split one window's rows across batches
// wherever the server-side slot flipped mid-history and silently drop the
// transition that crosses the flip.
function compactSnapshotGroupKey(row) {
  return [row[2], row[3], row[4], row[6], row[7]].join("|");
}

// The transition miner refuses more than 10,000 derived rows per call — a
// structural memory-safety ceiling owned by codex-transition-miner.js, not a
// data-window policy. A full unbounded history legitimately holds more (the
// real corpus measured 18,176 weekly transitions over its first 82 days), so
// the derivation is partitioned by reset-window group and each batch stays
// under the ceiling with headroom. Cumulative aggregations are
// difference-based over each window's own span, so deriving disjoint group
// batches against a usage slice that covers every window start in the batch
// reproduces the unbatched result exactly.
const CALIBRATION_BATCH_TRANSITION_BUDGET = 8_000;

// The transition ceiling alone is not a useful memory bound: a few quota
// changes spread across many high-volume days can still make one batch decode
// hundreds of thousands of compact usage rows at once. Partition on the
// actual contiguous usage slice too. This is a working-set bound only; every
// row remains in exactly one derivation slice (apart from the intentional
// overlap required by overlapping reset windows), so it does not shorten the
// calibration history or discard evidence.
const CALIBRATION_BATCH_USAGE_BUDGET = 50_000;

async function deriveBoundedWeeklyCalibrationSeries({
  startAt,
  endAt,
  // The streaming corpus handle, so at most one batch slice of priced rows is
  // ever resident at a time.
  usageCorpus,
  rateLimitSnapshots,
  diagnostics,
  signal,
  resourceCheck,
  planAttributionIndex,
  limits = DEFAULT_TRANSITION_RESOURCE_LIMITS,
}) {
  if (usageCorpus === null || typeof usageCorpus !== "object") {
    throw new TypeError("deriveBoundedWeeklyCalibrationSeries requires a usage corpus");
  }
  const usageEventCount = usageCorpus.count;
  const readUsageSlice = async (low, high) => (
    low >= high
      ? []
      : usageCorpus.readSlice(low, high)
  );
  const batchUsageBudget = Math.min(CALIBRATION_BATCH_USAGE_BUDGET, limits.usageEvents);
  const derive = (usage, snapshots) => {
    if (usage.length > limits.usageEvents
        || snapshots.length > limits.weeklySnapshots
        || usage.length + snapshots.length > limits.combinedInputs) {
      throw fixedError("accounting_transition_derivation_limit_exceeded");
    }
    return deriveCodexTransitionSeriesCooperatively({
      startAt,
      endAt,
      rawUsageEvents: usage,
      rateLimitSnapshots: snapshots,
      diagnostics,
      includeSnapshotIntervals: false,
      // The retained corpus is already limited to the two reviewed main
      // allowance durations. Derive both in the same bounded usage pass so
      // five-hour history does not require a second raw-log scan.
      windowDurationMins: null,
      signal,
      consumeInputs: true,
      includeNormalizedInputs: false,
      inputEncoding: "accounting_prepriced_compact_v3",
      planAttributionIndex,
      resourceCheck,
    });
  };

  // Group the compact snapshots exactly as the miner will, and count the
  // transitions each group will derive: within a group the miner walks
  // deduplicated snapshots in (time, percent) order and emits one transition
  // per consecutive percent change, so this count is exact, not an estimate.
  const groups = new Map();
  for (let index = 0; index < rateLimitSnapshots.length; index += 1) {
    if (index % 8_192 === 0) {
      throwIfAborted(signal);
      resourceCheck?.();
      await cooperativeYield();
    }
    const row = rateLimitSnapshots[index];
    if (!Array.isArray(row) || row.length !== 9) continue;
    const key = compactSnapshotGroupKey(row);
    let group = groups.get(key);
    if (group === undefined) {
      group = { rows: [], dedupe: new Set(), deduped: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
    const dedupeKey = `${row[0]}|${row[8]}`;
    if (!group.dedupe.has(dedupeKey)) {
      group.dedupe.add(dedupeKey);
      group.deduped.push(row);
    }
  }
  let totalTransitions = 0;
  const deduplicatedSnapshotCountByWindow = {};
  for (const group of groups.values()) {
    const ordered = [...group.deduped].sort(
      (left, right) => left[1] - right[1] || left[8] - right[8],
    );
    let transitions = 0;
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index][8] !== ordered[index - 1][8]) transitions += 1;
    }
    const durationMins = Number(ordered[0]?.[6]);
    if (Number.isSafeInteger(durationMins)) {
      deduplicatedSnapshotCountByWindow[durationMins] =
        (deduplicatedSnapshotCountByWindow[durationMins] ?? 0)
        + ordered.length;
    }
    const resetsAt = Number(ordered[0]?.[7]);
    const windowStartMs = (resetsAt - durationMins * 60) * 1_000;
    group.transitions = transitions;
    const firstMs = Number(ordered[0]?.[1] ?? 0);
    // A group whose reset window cannot be computed must still be BOUNDED.
    // This previously fell back to NEGATIVE_INFINITY, which the batch loop
    // turned into `low = 0` — so one group with an unparseable duration or
    // reset stamp took a usage slice running from the very first row of the
    // corpus to its own last observation. On a large history that is the
    // entire corpus in a single derivation, which defeats
    // CALIBRATION_BATCH_USAGE_BUDGET completely and is why a rebuild with a
    // multi-gigabyte ceiling still deferred with
    // accounting_transition_rss_limit_exceeded: the working set was never
    // bounded at all, so no ceiling could have been large enough.
    //
    // The honest bound is the group's own first observation less one window:
    // a group's transitions cannot be attributed to usage older than the
    // window containing its earliest snapshot. Prefer the group's declared
    // duration, fall back to the weekly window this series derives.
    const boundedDurationMins = Number.isFinite(durationMins) && durationMins > 0
      ? durationMins
      : WEEKLY_WINDOW_MINUTES;
    const fallbackStartMs = Number.isFinite(firstMs)
      ? firstMs - boundedDurationMins * 60_000
      : Number.NEGATIVE_INFINITY;
    group.sliceStartMs = Number.isFinite(windowStartMs)
      ? windowStartMs
      : fallbackStartMs;
    group.firstMs = firstMs;
    group.lastMs = Number(ordered.at(-1)?.[1] ?? 0);
    totalTransitions += transitions;
    // `dedupe` and `deduped` exist only to derive the four scalars above. They
    // are never read again, but without this they stay reachable for the whole
    // pass — a Set of one interned key string per unique (observedAt, percent)
    // plus a second array of row references, per group, held alongside the
    // rows themselves and alongside the caller's `rateLimitSnapshots`. Release
    // them at the point of last use so the batch loop runs against one copy of
    // the snapshots rather than three views of them.
    group.dedupe = null;
    group.deduped = null;
  }
  throwIfAborted(signal);
  resourceCheck?.();

  if (totalTransitions <= CALIBRATION_BATCH_TRANSITION_BUDGET
      && usageEventCount <= batchUsageBudget) {
    const usage = await readUsageSlice(0, usageEventCount);
    const series = await derive(usage, rateLimitSnapshots);
    return {
      transitions: series.transitions,
      deduplicatedSnapshotCount: series.deduplicatedSnapshotCount,
      deduplicatedSnapshotCountByWindow,
    };
  }

  // Sort the compact usage rows once so every batch can take the contiguous
  // slice that covers its groups' windows. Rows without a parseable timestamp
  // would be dropped by the miner's own normalization, so excluding them here
  // changes nothing. The streaming corpus arrives already ordered and stamped,
  // so it supplies the timestamp list directly and each batch's rows are read
  // off the index on demand instead of being sliced out of a resident copy.
  const sortedMs = usageCorpus.usageMs;

  const orderedGroups = [...groups.values()].sort((left, right) => (
    left.sliceStartMs - right.sliceStartMs
    || left.firstMs - right.firstMs
    || left.lastMs - right.lastMs
  ));
  const batches = [];
  let current = null;
  for (const group of orderedGroups) {
    const nextSliceStartMs = Math.min(
      current?.sliceStartMs ?? Number.POSITIVE_INFINITY,
      group.sliceStartMs,
    );
    const nextSliceEndMs = Math.max(
      current?.sliceEndMs ?? Number.NEGATIVE_INFINITY,
      group.lastMs,
    );
    const nextUsageRows = firstIndexAbove(sortedMs, nextSliceEndMs)
      - (nextSliceStartMs === Number.NEGATIVE_INFINITY
        ? 0
        : firstIndexAtLeast(sortedMs, nextSliceStartMs));
    if (current === null
        || (current.groups.length > 0
          && (current.transitions + group.transitions
              > CALIBRATION_BATCH_TRANSITION_BUDGET
            || nextUsageRows > batchUsageBudget))) {
      current = {
        groups: [],
        transitions: 0,
        sliceStartMs: Number.POSITIVE_INFINITY,
        sliceEndMs: Number.NEGATIVE_INFINITY,
      };
      batches.push(current);
    }
    current.groups.push(group);
    current.transitions += group.transitions;
    current.sliceStartMs = Math.min(current.sliceStartMs, group.sliceStartMs);
    current.sliceEndMs = Math.max(current.sliceEndMs, group.lastMs);
  }

  const transitions = [];
  let deduplicatedSnapshotCount = 0;
  for (const batch of batches) {
    throwIfAborted(signal);
    resourceCheck?.();
    const low = batch.sliceStartMs === Number.NEGATIVE_INFINITY
      ? 0
      : firstIndexAtLeast(sortedMs, batch.sliceStartMs);
    const high = firstIndexAbove(sortedMs, batch.sliceEndMs);
    const usageSlice = await readUsageSlice(low, high);
    const snapshotSlice = [];
    for (const group of batch.groups) snapshotSlice.push(...group.rows);
    const series = await derive(usageSlice, snapshotSlice);
    transitions.push(...series.transitions);
    deduplicatedSnapshotCount += series.deduplicatedSnapshotCount;
  }
  rateLimitSnapshots.length = 0;
  transitions.sort((left, right) => left.eventTime.localeCompare(right.eventTime)
    || left.resetIdentity.localeCompare(right.resetIdentity)
    || left.windowDurationMins - right.windowDurationMins
    || left.slot.localeCompare(right.slot));
  return {
    transitions,
    deduplicatedSnapshotCount,
    deduplicatedSnapshotCountByWindow,
  };
}

const UNIFIED_CALIBRATION_READ_BATCH_ROWS = 20_000;

const COMPOSITION_RECENT_MIX_DAYS = 14;

const COMPOSITION_FIT_FAILURE_REASON_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/u;

// A bounded, machine-safe reason for a failed composition fit: the typed
// error code when one exists, the error name otherwise. Never free-form
// message text — messages can carry paths.
function compositionFitFailureReason(error) {
  const candidate = typeof error?.code === "string" && error.code.length > 0
    ? error.code
    : typeof error?.name === "string" && error.name.length > 0
      ? error.name
      : "unknown";
  return COMPOSITION_FIT_FAILURE_REASON_PATTERN.test(candidate)
    ? candidate
    : "unknown";
}

// The composition fit, taking the usage corpus as a row visitor so the corpus
// is never resident. It folds rows in the same order with the same cadence as
// the per-event fold it replaced.
function createCompositionFitConsumer({
  onTiming = null, monotonicClock = undefined,
  weeklyRateLimitSnapshots,
  endMs,
  signal = null,
  checkRuntimeMemory = () => {},
  planAttributionIndex = null,
  selectedPlanType = null,
  declaredSpeedBaselines = [],
  unknownSpeedPolicy = DEFAULT_UNKNOWN_SPEED_POLICY,
}) {
  const fitTiming = createLocalRefreshTimer({ onTiming, clock: monotonicClock });
  const grainMs = MODEL_COMPOSITION_POLICY.grainMs;
  const contextKey = planAttributionContextKey("openai_codex", "codex");
  const attributionIndex = planAttributionIndex ?? buildPlanAttributionIndex(
    weeklyRateLimitSnapshots.filter(Array.isArray)
      .map((row) => ({ contextKey, observedAtMs: row[1], planType: row[3] })),
  );
  const planType = selectedPlanType ?? weeklyRateLimitSnapshots.filter((row) => (
    Array.isArray(row) && Number.isSafeInteger(row[1])
  ))
    .sort((left, right) => left[1] - right[1]).at(-1)?.[3] ?? "unknown";
  const excludedBins = new Set();
  const planScopedBuckets = new Map();
  const invalidPlanScopedBuckets = new Set();
  let planTimelineResourceLimited = false;
  const checkPlanTimelineSize = () => {
    if (planScopedBuckets.size + invalidPlanScopedBuckets.size > MAX_PLAN_TIMELINE_ROWS) {
      planTimelineResourceLimited = true;
      planScopedBuckets.clear();
      invalidPlanScopedBuckets.clear();
    }
  };
  const planScopedDiagnostics = {
    consideredEvents: 0,
    incompatibleEvents: 0,
    unresolvedEvents: 0,
    conflictedEvents: 0,
    malformedEvents: 0,
  };
  const recentStartMs = endMs - COMPOSITION_RECENT_MIX_DAYS * 24 * 60 * 60 * 1_000;
  // binStartMs -> Map(model -> summed costUsd), Maps kept in first-encounter
  // order so the kernel accumulates in the same order the per-event path did
  // and the fit stays bit-identical.
  const binCosts = new Map();
  const recentMix = {};
  const recentCostsByBin = new Map();
  let processed = 0;
  const consumeCore = async (row) => {
    processed += 1;
    if (processed % ACCOUNTING_RSS_CHECK_INTERVAL === 0) {
      throwIfAborted(signal);
      checkRuntimeMemory();
      await cooperativeYield();
    }
    if (!Array.isArray(row)) return;
    const observedAtMs = Date.parse(row[0]);
    const costUsd = Number(row[10]);
    if (!Number.isFinite(observedAtMs)
        || typeof row[1] !== "string"
        || !Number.isFinite(costUsd)
        || costUsd < 0) return;
    const model = row[1];
    const binStartMs = Math.floor(observedAtMs / grainMs) * grainMs;
    const intervalStartMs = Date.parse(row[20]?.[2] ?? "");
    const association = fitTiming.measureSync("fit_attribution",()=>classifyUsageAttribution(attributionIndex, {
      contextKey, observedAtMs,
      ...(Number.isSafeInteger(intervalStartMs) ? { intervalStartMs } : {}),
      observedPlanType: row[20]?.[0] === "same_record" ? row[20][1] : null,
    }, { planType }),{aggregate:true});
    const planTimelineEvent = fitTiming.measureSync("fit_event_projection",()=>compactPlanScopedTimelineEvent(
      row,
      declaredSpeedBaselines,
    ),{aggregate:true});
    if (planTimelineEvent === null) {
      planScopedDiagnostics.malformedEvents += 1;
    } else {
      planScopedDiagnostics.consideredEvents += 1;
    }
    if (association.disposition === "incompatible") {
      if (planTimelineEvent !== null) {
        planScopedDiagnostics.incompatibleEvents += 1;
      }
      return;
    }
    if (row[20]?.[0] === "conflicted"
        || association.disposition === "unresolved") {
      excludedBins.add(binStartMs);
      if (planTimelineEvent !== null) {
        if (!planTimelineResourceLimited) invalidPlanScopedBuckets.add(
          Math.floor(observedAtMs / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS,
        );
        checkPlanTimelineSize();
        if (row[20]?.[0] === "conflicted") {
          planScopedDiagnostics.conflictedEvents += 1;
        } else {
          planScopedDiagnostics.unresolvedEvents += 1;
        }
      }
      return;
    }
    if (planTimelineEvent !== null && !planTimelineResourceLimited) {
      addCompactPlanScopedTimelineEvent(planScopedBuckets, planTimelineEvent);
    }
    checkPlanTimelineSize();
    // The kernel's own binning refuses empty model names; the recent mix
    // mirrors the historical per-event behavior and keeps them.
    if (model.length > 0) {
      let costs = binCosts.get(binStartMs);
      if (costs === undefined) {
        costs = new Map();
        binCosts.set(binStartMs, costs);
      }
      costs.set(model, (costs.get(model) ?? 0) + costUsd);
    }
    if (observedAtMs >= recentStartMs) {
      let recentCosts = recentCostsByBin.get(binStartMs);
      if (recentCosts === undefined) {
        recentCosts = new Map();
        recentCostsByBin.set(binStartMs, recentCosts);
      }
      recentCosts.set(model, (recentCosts.get(model) ?? 0) + costUsd);
    }
  };
  const consume = row => fitTiming.measure("fit_row_processing",()=>consumeCore(row),{aggregate:true});
  const finish = async () => {
    fitTiming.flush();
    const quotaRows = [];
    // Use admitted plan-preserving snapshots, not the generic timeline whose
    // same-instant collapse may already have chosen a different plan's row.
    const scopedQuota = new Map();
    for (const row of weeklyRateLimitSnapshots) {
      processed += 1;
      if (processed % ACCOUNTING_RSS_CHECK_INTERVAL === 0) {
        throwIfAborted(signal);
        checkRuntimeMemory();
        await cooperativeYield();
      }
      if (!Array.isArray(row)) continue;
      const observedAtMs = Number(row[1]);
      const resetsAtSeconds = Number(row[7]);
      const usedPercent = Number(row[8]);
      if (!Number.isFinite(observedAtMs)
          || !Number.isFinite(resetsAtSeconds)
          || !Number.isFinite(usedPercent)) continue;
      if (row[3] !== planType) continue;
      const sevenDay = row[6] === WEEKLY_WINDOW_MINUTES;
      if (!planTimelineResourceLimited && row[2] === "openai_codex"
          && row[4] === "codex" && sevenDay
          && usedPercent >= 0 && usedPercent <= 100) {
        const match = planEraForInterval(attributionIndex, { contextKey, observedAtMs });
        if (match.status === "matched" && match.era.planType === planType) {
          const prior = scopedQuota.get(observedAtMs);
          if (prior === null) {
            // Once contradictory, later repeated rows cannot restore a winner.
          } else if (prior && (prior[1] !== resetsAtSeconds || prior[2] !== usedPercent)) {
            scopedQuota.set(observedAtMs, null);
            invalidPlanScopedBuckets.add(Math.floor(observedAtMs / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS);
            checkPlanTimelineSize();
          } else scopedQuota.set(observedAtMs, [observedAtMs, resetsAtSeconds, usedPercent]);
          if (scopedQuota.size > MAX_PLAN_TIMELINE_ROWS || planTimelineResourceLimited) {
            planTimelineResourceLimited = true;
            scopedQuota.clear();
          }
        }
      }
      // Composition and the selected-plan comparison remain seven-day
      // contracts. The five-hour observations share the attribution index and
      // calibration pass, but must not become duplicate quota points in the
      // seven-day capacity fit.
      if (!sevenDay) continue;
      quotaRows.push({
        observedAtMs,
        planType: typeof row[3] === "string" ? row[3] : "unknown",
        resetsAtMs: resetsAtSeconds * 1_000,
        usedPercent,
      });
    }
    // One aggregated row per (bin, model): O(bins x models), not O(events).
    const usageRows = [];
    for (const binStartMs of new Set([...binCosts.keys(), ...recentCostsByBin.keys()])) {
      const lookup = planEraForInterval(attributionIndex, {
        contextKey, observedAtMs: binStartMs + grainMs - 1, intervalStartMs: binStartMs,
      });
      if (lookup.status !== "matched" || lookup.era.planType !== planType) excludedBins.add(binStartMs);
      if (excludedBins.has(binStartMs)) continue;
      for (const [model, costUsd] of binCosts.get(binStartMs) ?? []) {
        usageRows.push({ observedAtMs: binStartMs, model, costUsd });
      }
      // Later conflicting rows can invalidate a whole bin. The recent model mix
      // must use the same eligible bins as the fit, not an already-added subtotal.
      for (const [model, costUsd] of recentCostsByBin.get(binStartMs) ?? []) {
        recentMix[model] = (recentMix[model] ?? 0) + costUsd;
      }
    }
    binCosts.clear();
    recentCostsByBin.clear();
    const { observations, voidedBinCount, poolCount } =
      fitTiming.measureSync("accounting_fit_observations",()=>buildCompositionObservations({ usageRows, quotaRows: quotaRows.filter((row) => (
        !excludedBins.has(Math.floor(row.observedAtMs / grainMs) * grainMs)
      )) }));
    const fit = fitTiming.measureSync("accounting_fit_solver",()=>calibrateCompositionCapacities(observations));
    const blendedRecentMixUsd = fit.status === "fitted"
      ? blendedCompositionCapacityUsd(recentMix, {
        capacityUsdByModel: fit.capacityUsdByModel,
        fallbackCapacityUsd: fit.singleConstantUsd,
      })
      : null;
    const planScopedTimeline = fitTiming.measureSync("accounting_fit_timeline",()=>finalizePlanScopedTimelineDraft({
      unknownSpeedPolicy,
      buckets: planScopedBuckets,
      invalidBuckets: invalidPlanScopedBuckets,
      attributionIndex,
      contextKey,
      planType,
      diagnostics: planScopedDiagnostics,
      endMs,
      resourceLimited: planTimelineResourceLimited,
      quota: [...scopedQuota.values()].filter((row) => row !== null).sort((a, b) => a[0] - b[0]),
    }));
    return {
      planType,
      attributionExcludedBins: excludedBins.size,
      status: fit.status,
      grainHours: MODEL_COMPOSITION_POLICY.grainMs / 3_600_000,
      observationCount: fit.observationCount,
      voidedBinCount,
      poolCount,
      capacityUsdByModel: fit.capacityUsdByModel,
      modelCostShares: fit.modelCostShares,
      r2: fit.r2,
      singleConstantUsd: fit.singleConstantUsd,
      singleConstantR2: fit.singleConstantR2,
      // Why a fit was ACCEPTED or REJECTED. Without this a fallback_blended
      // reaches the dashboard with no recoverable reason, and recovering it costs
      // a full re-run of the kernel against the corpus (2026-08-20). The gate at
      // model-composition.js reads these exact fields, so persisting them is what
      // makes the decision auditable after the fact.
      identification: fit.identification ?? null,
      blendedRecentMixUsd: Number.isFinite(blendedRecentMixUsd)
        ? Number(blendedRecentMixUsd.toFixed(2))
        : null,
      recentMixDays: COMPOSITION_RECENT_MIX_DAYS,
      planScopedTimeline,
    };
  };
  return { consume, finish };
}

async function fitCompositionFromCorpusStream(options) {
  const consumer = createCompositionFitConsumer(options);
  await options.forEachUsageRow(consumer.consume);
  return consumer.finish();
}

// Fit every admitted plan over one ordered corpus traversal. Each consumer
// retains only its bounded aggregates, never another full event collection.
// Per-plan failures remain optional enrichment failures; a failed shared read
// invalidates all unfinished fits, and cancellation always escapes.
async function fitPlanCompositionsFromCorpus(options, planTypes, currentPlanType) {
  const fitTiming = createLocalRefreshTimer({ onTiming: options.onTiming, clock: options.monotonicClock });
  if (!Array.isArray(planTypes) || planTypes.length > 16) {
    throw fixedError("accounting_transition_derivation_limit_exceeded");
  }
  const historical = [...new Set(planTypes)].sort()
    .filter(plan => plan !== currentPlanType && plan !== "unknown");
  const lanes = [currentPlanType, ...historical].map(planType => {
    try {
      return { planType, consumer: createCompositionFitConsumer({ ...options, selectedPlanType: planType }), failure: null };
    } catch (error) {
      throwIfAborted(options.signal);
      if (error?.name === "AbortError") throw error;
      return { planType, consumer: null, failure: compositionFitFailureReason(error) };
    }
  });
  const failed = (lane, error) => {
    throwIfAborted(options.signal);
    if (error?.name === "AbortError") throw error;
    lane.failure = compositionFitFailureReason(error);
    lane.consumer = null;
  };
  throwIfAborted(options.signal);
  options.checkRuntimeMemory?.();
  try {
    await fitTiming.measure("accounting_fit_stream",()=>options.forEachUsageRow(async row => {
      for (const lane of lanes) {
        if (lane.consumer === null) continue;
        try { await lane.consumer.consume(row); }
        catch (error) { failed(lane, error); }
      }
    }));
  } catch (error) {
    for (const lane of lanes) if (lane.consumer !== null) failed(lane, error);
    throwIfAborted(options.signal);
    if (error?.name === "AbortError") throw error;
  }
  for (const lane of lanes) {
    throwIfAborted(options.signal);
    options.checkRuntimeMemory?.();
    if (lane.consumer === null) continue;
    try { lane.result = await fitTiming.measure(lane === lanes[0] ? "accounting_fit_current_finish" : "accounting_fit_historical_finish",()=>lane.consumer.finish()); }
    catch (error) { failed(lane, error); }
    finally { lane.consumer = null; }
  }
  const current = lanes[0];
  return {
    compositionResult: current.result ?? null,
    compositionFitFailure: current.failure === null ? null : { status: "fit_failed", reason: current.failure },
    historicalPlanDrafts: lanes.slice(1).map(lane => ({
      planType: lane.planType, draft: lane.result?.planScopedTimeline ?? null, failure: lane.failure,
    })),
  };
}

export {
  ALLOWANCE_CAPACITY_SCHEMA_VERSION,
  PLAN_SCOPED_TIMELINE_SCHEMA_VERSION,
  PLAN_SCOPED_ATTRIBUTION_METHOD_VERSION,
  ALLOWANCE_SCENARIO_CANDIDATES,
  MAX_PLAN_TIMELINE_ROWS,
  PLAN_TIMELINE_ENCODING,
  WEEKLY_WINDOW_MINUTES,
  ALLOWANCE_HISTORY_WINDOW_MINUTES,
  COMPACT_USAGE_RETAINED_BYTES,
  COMPACT_SNAPSHOT_RETAINED_BYTES,
  STREAMED_USAGE_STAMP_BYTES,
  STREAMED_USAGE_MEMO_BYTES,
  transitionResourceLimits,
  transitionUsageProjection as projectAccountingTransitionUsage,
  calibrationPlanEvidence,
  weeklyRateLimitProjection as projectAccountingQuotaSnapshot,
  finalizePlanScopedTimelineDraft,
  decodePlanScopedTimelineRow,
  unavailablePlanTimeline,
  calibrationCohortId,
  planScopedTimelineReceipt,
  allowanceCapacityForPlan,
  fitHistoricalPlanTimelines,
  historicalPlanComparisonReceipts,
  cooperativeYield as yieldAccountingWork,
  deriveBoundedWeeklyCalibrationSeries,
  UNIFIED_CALIBRATION_READ_BATCH_ROWS,
  COMPOSITION_RECENT_MIX_DAYS,
  COMPOSITION_FIT_FAILURE_REASON_PATTERN,
  compositionFitFailureReason,
  fitCompositionFromCorpusStream,
  fitPlanCompositionsFromCorpus,
};
