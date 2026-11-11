import { types } from "node:util";
import {
  FAST_MODE_MODEL_FAMILY_KEYS,
  OBSERVED_SPEED_MODE_KEYS,
} from "@app-usagemonitor/accounting";
import { REVIEWED_CODEX_MODEL_IDS } from "@app-usagemonitor/codex-catalog";
import {
  COMPONENT_KEYS,
  KNOWN_AGENT_SCOPES,
  KNOWN_API_TIERS,
  KNOWN_LINEAGE,
  KNOWN_SPEEDS,
  KNOWN_SURFACES,
  KNOWN_TOOL_CLASSES,
} from "./local-companion-usage-model.js";
import { REASONING_EFFORTS } from "./codex-usage-vocabulary.js";

// The builder and retained-snapshot boundary share these artifact allowlists.
// Every other record below describes a specific public DTO, never source data.
export const COMPANION_ARTIFACTS = Object.freeze({
  gradient: Object.freeze({
    file: "2026-07-24-simple-quota-gradient-artifact.json",
    datasets: Object.freeze({
      summary: [
        "selected_reset_at", "snapshot_intervals", "percentage_transitions", "observed_span_pp",
        "capacity_usd", "lower_80_usd", "upper_80_usd", "mean_absolute_error_pp",
        "points_within_80_band_fraction", "usable_reset_series", "recent_three_median_usd",
        "early_three_median_usd", "early_to_recent_change", "rolling_signed_auc_pp_hours",
        "rolling_absolute_auc_pp_hours", "rolling_peak_absolute_residual_pp",
        "july_13_fast_events", "july_13_fast_raw_capacity_usd", "july_13_fast_weighted_capacity_usd",
        "july_13_reference_capacity_usd", "july_13_one_hour_weighted_mae_pp",
        "july_13_two_hour_weighted_mae_pp", "july_13_three_hour_weighted_mae_pp",
        "long_history_first_at", "long_history_last_at", "long_history_reset_series",
      ],
      curve: ["api_cost_usd", "quota_consumed_pp", "observed_at", "series"],
      rolling: [
        "timestamp", "window_start_utc", "window_end_utc", "window_end_utc_label",
        "window_end_eastern_label", "rolling_api_cost_usd", "rolling_event_count",
        "smoothing_hours", "series", "quota_change_pp",
      ],
      current_rolling_detail: [
        "window_end_eastern", "window_end_utc", "observed_quota_change_pp",
        "expected_quota_change_pp", "residual_pp", "rolling_api_cost_usd", "usage_events",
      ],
      rolling_history: [
        "timestamp", "window_start_utc", "window_end_utc", "window_end_utc_label",
        "window_end_eastern_label", "rolling_api_cost_usd", "rolling_event_count",
        "smoothing_hours", "series", "quota_change_pp", "utc_hour", "eastern_hour",
        "reset_at", "reset_segment", "reset_gradient_usd", "gradient_quality",
      ],
      rolling_residual: [
        "timestamp", "series", "observed_quota_change_pp", "expected_quota_change_pp", "residual_pp",
      ],
      fast_hourly: [
        "timestamp", "hour_start_utc", "hour_end_utc", "hour_end_utc_label",
        "hour_end_eastern_label", "api_cost_usd", "tier_weighted_cost_usd", "usage_events",
        "fast_events", "ultrafast_events", "standard_events", "unknown_events", "series", "quota_change_pp",
      ],
      fast_two_hour: [
        "timestamp", "window_end_utc_label", "window_end_eastern_label", "api_cost_usd",
        "tier_weighted_cost_usd", "usage_events", "fast_events", "series", "quota_change_pp",
      ],
      fast_hourly_detail: [
        "window_end_utc", "window_end_utc_label", "window_end_eastern_label", "window_hours",
        "observed_quota_change_pp", "raw_expected_quota_change_pp", "weighted_expected_quota_change_pp",
        "raw_residual_pp", "weighted_residual_pp", "api_cost_usd", "tier_weighted_cost_usd",
        "usage_events", "fast_events",
      ],
      window_sensitivity: [
        "window_hours", "focal_window", "focal_points", "raw_mae_pp", "weighted_mae_pp",
        "weighted_mae_reduction_fraction", "raw_peak_absolute_residual_pp",
        "weighted_peak_absolute_residual_pp",
      ],
      fast_segments: [
        "segment", "first_observed_at", "last_observed_at", "speed_evidence", "quota_change_pp",
        "standard_api_cost_usd", "weighted_api_equivalent_usd", "raw_implied_capacity_usd",
        "weighted_implied_capacity_usd",
      ],
      slot_semantics: [
        "slot", "window_minutes", "window_label", "transitions", "first_observed_at", "last_observed_at",
      ],
      reset_calendar: ["announced_at_utc", "announced_at_et", "event_type", "propagation_note"],
      reset_trend: [
        "first_observed_at", "reset_at", "reset_key", "eligible_transitions",
        "observed_span_pp", "series", "capacity_usd",
      ],
      reset_table: [
        "first_observed_at", "reset_at", "slot", "capacity_usd", "lower_80_usd",
        "upper_80_usd", "eligible_transitions", "observed_span_pp",
      ],
    }),
  }),
  weekly: Object.freeze({
    file: "2026-07-24-weekly-7-day-calibration-artifact.json",
    datasets: Object.freeze({
      summary: [
        "median_weekly_value_usd", "lower_80_across_resets_usd", "upper_80_across_resets_usd",
        "qualifying_resets", "selected_holdout_mae_pp", "standard_holdout_mae_pp",
        "holdout_improvement_fraction", "prior_reset_mae_pp", "prior_reset_bias_pp",
        "prior_reset_scored_resets", "prior_reset_scored_points", "prior_reset_p80_absolute_error_pp",
        "selected_forecast_common_mae_pp", "selected_forecast_common_bias_pp", "online_update_status",
      ],
      candidates: [
        "accounting_basis", "selected", "qualifying_resets", "holdout_points",
        "median_reset_holdout_mae_pp", "pooled_holdout_mae_pp", "pooled_holdout_bias_pp",
        "median_in_sample_mae_pp",
      ],
      weekly_values: [
        "sequence", "first_observed_at", "last_observed_at", "reset_due_at", "slot",
        "displayed_span_pp", "value_usd", "pairwise_p10_usd", "pairwise_p90_usd",
        "holdout_observed_movement_pp", "holdout_predicted_movement_pp", "holdout_mae_pp",
        "holdout_bias_pp", "prior_forecast_value_usd", "prior_prediction_mae_pp",
        "prior_prediction_bias_pp", "known_speed_fraction", "fast_fraction_of_known",
        "eligible_transitions", "unique_percentage_boundaries",
      ],
      value_series: [
        "sequence", "first_observed_at", "last_observed_at", "reset_due_at", "slot",
        "displayed_span_pp", "value_usd", "pairwise_p10_usd", "pairwise_p90_usd",
        "holdout_observed_movement_pp", "holdout_predicted_movement_pp", "holdout_mae_pp",
        "holdout_bias_pp", "prior_forecast_value_usd", "prior_prediction_mae_pp",
        "prior_prediction_bias_pp", "known_speed_fraction", "fast_fraction_of_known",
        "eligible_transitions", "unique_percentage_boundaries", "series", "value_series_usd",
      ],
      holdout_series: [
        "sequence", "first_observed_at", "last_observed_at", "reset_due_at", "slot",
        "displayed_span_pp", "value_usd", "pairwise_p10_usd", "pairwise_p90_usd",
        "holdout_observed_movement_pp", "holdout_predicted_movement_pp", "holdout_mae_pp",
        "holdout_bias_pp", "prior_forecast_value_usd", "prior_prediction_mae_pp",
        "prior_prediction_bias_pp", "known_speed_fraction", "fast_fraction_of_known",
        "eligible_transitions", "unique_percentage_boundaries", "series", "movement_pp",
      ],
      error_concentration: [
        "first_observed_date", "reset_due_at", "share_of_absolute_error",
        "holdout_absolute_error_pp", "holdout_mae_pp", "holdout_bias_pp",
        "speed_known_fraction", "fast_fraction_of_known",
      ],
      lag_candidates: [
        "candidate", "selected", "qualifying_resets", "holdout_points", "pooled_mae_pp", "pooled_bias_pp",
      ],
      forecast_candidates: [
        "forecast_rule", "selected", "common_resets", "common_points",
        "pooled_mae_pp", "pooled_bias_pp", "regime_forecasts",
      ],
      online_checkpoints: [
        "checkpoint_display_pp", "comparable_resets", "corrected_online_mae_pp",
        "prior_forecast_mae_pp", "improvement_fraction", "accepted",
      ],
      provider_epochs: [
        "epoch", "start_date", "end_date", "comparable_days", "local_to_provider_token_ratio",
        "local_api_priced_usd", "provider_only_days", "evidence_status",
      ],
      experiment_status: ["status", "attempts", "controlled_results", "unknown_results", "stop_reasons"],
      high_error_surfaces: [
        "first_observed_date", "surface", "events", "event_share", "total_tokens",
        "token_share", "standard_api_priced_usd", "cost_share",
      ],
    }),
  }),
  quality: Object.freeze({
    file: "2026-07-24-monitoring-quality-artifact.json",
    datasets: Object.freeze({
      summary: [
        "collector_age_hours", "collector_age_seconds", "app_server_age_hours",
        "dominant_snapshot_intervals", "fit_eligible_fraction", "known_speed_fraction",
        "flat_interval_fraction", "fixed_reset_exact_groups", "fixed_reset_clusters",
        "moving_reset_groups", "prospective_account_scoped_usage_records",
      ],
      coverage: ["dimension", "coverage_fraction"],
      signals: ["signal", "intervals", "fraction"],
      reset_families: [
        "limit", "window_minutes", "exact_reset_groups", "clusters_within_120s",
        "singleton_groups", "groups_with_transitions", "dominant_cluster_share", "behavior",
      ],
      opportunities: ["action", "evidence", "id", "priority", "title"],
      priority_counts: ["priority", "improvements"],
    }),
  }),
});

const SCALAR = Symbol("scalar");
const list = (item) => ({ item });
const fields = (names = "", nested = {}) => Object.assign(
  Object.fromEntries(names.split(/\s+/u).filter(Boolean).map((key) => [key, SCALAR])),
  nested,
);
const keyed = (keys, item) => Object.fromEntries([...keys].map((key) => [key, item]));
const without = (contract, keys) => Object.fromEntries(
  Object.entries(contract).filter(([key]) => !keys.includes(key)),
);
const range = fields("lower upper");
const coveredAt = fields("startAt endAt");
const policy = fields("mode customFastRatioBps");
const scenarios = ["unresolved_as_standard", "unresolved_as_fast", "unresolved_as_custom"];
const components = keyed(COMPONENT_KEYS, SCALAR);
const componentCost = fields("tokens pricedTokens unpricedTokens costUsd");
const componentCosts = keyed(COMPONENT_KEYS, componentCost);
const speedProvenance = fields("observedEvents declaredEvents unknownEvents");
const speedFields = {
  speedApiPriceEquivalentUsd: SCALAR,
  speedApiPriceEquivalentUsdExact: SCALAR,
  speedPricingCoverageStatus: SCALAR,
  speedPricingProvenance: speedProvenance,
  speedComponentCosts: componentCosts,
};
const priceCard = fields("priceCardId events costUsd");
const pricingCoverage = fields("fullyPricedEvents partiallyPricedEvents unpricedEvents");
const attribution = fields("attributedPseudonymousEvents unattributedEvents");
const dimension = fields("events totalTokens apiPriceEquivalentUsd");
const speedWeighting = keyed(OBSERVED_SPEED_MODE_KEYS,
  keyed(FAST_MODE_MODEL_FAMILY_KEYS, fields("events apiPriceEquivalentUsd")));
const model = fields("model pricingStatus allowanceTrack apiPriceEquivalentApplicable events totalTokens apiPriceEquivalentUsd", {
  components, componentCosts, pricingCoverage, ...speedFields,
});
const usageFields = fields("id label events totalTokens apiPriceEquivalentUsd apiPriceEquivalentUsdExact pricedEventFraction", {
  components, componentCosts, ...speedFields,
  priceCardIds: list(SCALAR), priceCardBreakdown: list(priceCard), pricingCoverage,
  byModel: list(model), modelUsage: list(model),
  bySpeed: keyed(KNOWN_SPEEDS, dimension),
  byApiServiceTier: keyed(KNOWN_API_TIERS, dimension),
  bySurface: keyed(KNOWN_SURFACES, dimension),
  byAgentScope: keyed(KNOWN_AGENT_SCOPES, dimension),
  byLineage: keyed(KNOWN_LINEAGE, dimension),
  byReasoningEffort: keyed(REASONING_EFFORTS, dimension),
  speedWeighting, declaredSpeedWeighting: speedWeighting, accountAttribution: attribution,
});
// Spark is a separate allowance track, not an unbounded recursive period.
const usage = { ...usageFields, spark: usageFields };
const speedCoverage = fields("totalEvents observedEvents declaredFromConfigEvents assumedEvents inferredEvents unknownEvents observedSharePercent unknownSharePercent");
const fastMode = fields(`unresolvedScenario metricKey metricLabel metricShortLabel metricExplainer
  standardMetricKey standardMetricLabel quotaWeightedApiPriceEquivalentUsd
  standardApiPriceEquivalentUsd unweightedUnknownApiPriceEquivalentUsd weightingStatus`, {
  unknownSpeedPolicy: policy,
  logObservability: fields("recordedEvent recordedTurnContext firesOn sessionBaselineRecorded resolution unobservedMeans", {
    observedValues: fields("priority fast default standard ultrafast"),
  }),
  declarationSource: fields("provenance source appliesTo neverBackfillsHistory reason", { retainedKeys: list(SCALAR) }),
  multipliers: keyed(FAST_MODE_MODEL_FAMILY_KEYS, SCALAR),
  multiplierSource: fields("publisher basis statement recordedAt priceRegistryVersion appliesTo observability"),
  appliedMultipliers: keyed([...FAST_MODE_MODEL_FAMILY_KEYS,
    ...FAST_MODE_MODEL_FAMILY_KEYS.map((key) => `ultrafast:${key}`)], SCALAR),
  coverage: speedCoverage,
  inference: fields("status reasonCode inferredFastWindows appliedToWeighting appliedToWeightingReason referenceWindowCount scoredWindowCount relativeTolerance"),
});
const planScope = fields("methodVersion planType basisFamilyId basisId cohortId sourceGeneration sourceGenerationFingerprint");
const stale = fields("stale status reason sourceGeneration sourceGenerationFingerprint schemaVersion computedAt priceBasis", { coveredAt });
const allowanceValidation = fields(`sameResetHoldoutMeanAbsoluteErrorPercentagePoints
  priorResetMeanAbsoluteErrorPercentagePoints priorResetAbsoluteBiasPercentagePoints
  forecastErrorP80PercentagePoints scoredPriorResets scoredPriorPoints`);
const historicalAttribution = fields("status maySpanMultipleAccounts label");
const allowanceCapacity = fields("status reason basisFamilyId selectedScenario", {
  unknownSpeedPolicy: policy, planScope, accountAttribution: historicalAttribution, stale,
  scenarios: keyed(scenarios, fields("basisId medianCapacityUsd qualifyingResets cohortId", {
    plausibleRangeUsd: range, validation: allowanceValidation,
  })),
});
const planScoped = fields("schemaVersion status reason encoding", {
  planScope, usage: list(list(SCALAR)), comparisonIntervals: list(list(SCALAR)),
  excludedIntervals: list(list(SCALAR)), quota: list(list(SCALAR)), observedQuota: list(list(SCALAR)),
});
const quotaWindow = fields("slot limitId limitName planType usedPercent remainingPercent durationMinutes resetAt observedAt status accountAttribution");
const timelineUsage = fields("startAt endAt usageEvents totalTokens apiPriceEquivalentUsd", {
  components, pricingCoverage, speedWeighting, declaredSpeedWeighting: speedWeighting,
  allowanceWeighting: list(SCALAR),
});
const historyCoverage = fields(`status phase errorCode generatedAt sourceCount indexedSourceCount
  pendingSourceCount skippedSourceCount skippedSourceBytes skippedThreadCount sourceBytes indexedBytes
  sourceMode generationMatched responseUsageCoverageStatus responseUnverifiedPrefixTurns
  cumulativeUsageCoverageStatus cumulativePrefixUnattributed`, { coveredAt });
const tools = fields("status reason total", { counts: keyed(KNOWN_TOOL_CLASSES, SCALAR) });

const premiumScenario = fields("status reasonCode basisId basisFamilyId quotaWeightedPremiumUsd pricedDrops observedSpeedDrops declaredSpeedDrops assumedSpeedDrops unknownSpeedDrops");
const premium = fields("status reasonCode basisFamilyId selectedScenario selectedPremiumUsd", {
  scenarios: keyed(scenarios, premiumScenario), rangePremiumUsd: range,
});
const allowanceImpact = fields("status reason basisFamilyId selectedScenario medianPercentagePoints interpretation", {
  percentagePointRange: range, plausibleRangePercentagePoints: range,
  scenarios: keyed(scenarios, fields("medianPercentagePoints", { percentagePointRange: range, plausibleRangePercentagePoints: range })),
});
const cacheSubtotal = fields("scope pricedDrops standardApiPremiumUsd standardApiPremiumUsdExact", { allowanceWeighting: premium });
const cacheSummary = fields(`periodId periodLabel model configurationChanges proximateConfigurationChanges
  uncoveredConfigurationChanges orderingCoverageGaps coverageStatus cacheReadDrops lostCacheTokens
  pricedDrops unpricedDrops estimatedPremiumUsd estimatedPremiumUsdExact standardApiPremiumUsd
  sameConfigurationReturns comparableReturns compactionConfoundedReturns contextContractedReturns
  insufficientEvidenceReturns uncoveredReturns reusedMoreThanHalfReturns reusedHalfOrLessReturns
  matchedOrExceededReturns reusedBetweenHalfAndPreviousReturns postCompactionRequests postCompactionCacheReadDrops
  gapBandLabel outcomeBucketLabel startSeconds endSeconds`, {
  estimateEvidence: fields("schemaVersion method reusablePrefixStatus verifiedLossTokens verifiedPremiumUsd"),
  observationUnits: fields("responsePairs unresolvedIncrementPairs"),
  allowanceWeighting: premium, coveredSubtotal: cacheSubtotal, allowanceImpact,
});
const configuration = fields("model reasoningEffort");
const cacheDetail = fields("observedAt gapSeconds changeType gapBand previousCacheReadTokens currentCacheReadTokens lostCacheTokens estimatedPremiumUsd estimatedPremiumUsdExact", {
  previous: configuration, current: configuration, configuration,
});
const gapBands = ["under_one_minute", "one_to_five_minutes", "five_to_thirty_minutes", "thirty_minutes_to_one_hour", "one_to_six_hours", "six_to_twenty_four_hours", "over_twenty_four_hours"];
const outcomeBuckets = ["under_one_minute", "one_to_two_minutes", "two_to_five_minutes", "five_to_ten_minutes", "ten_to_thirty_minutes", "thirty_minutes_to_one_hour", "one_to_six_hours", "six_to_twenty_four_hours", "one_to_three_days", "over_three_days"];
const cacheCohort = {
  ...cacheSummary, recent: list(cacheDetail),
  byChangeType: keyed(["reasoning_only", "model_only", "model_and_reasoning"], cacheSummary),
  byGapBand: keyed(gapBands, cacheSummary), byOutcomeBucket: keyed(outcomeBuckets, cacheSummary),
};
const cachePeriod = { ...cacheCohort, byModel: list(cacheCohort) };
const cacheImpact = fields("status errorCode proximityCeilingSeconds maximumRetainedCacheRatio minimumGapSeconds outcomeDisplayMaximumGapSeconds recentDetailLimit", {
  ...cachePeriod, periods: list(cachePeriod),
});
const workload = fields("schemaVersion policyVersion generatedAt attemptedAt timeZone status sourceGeneration", {
  errors: list(fields("code stage count retryable")),
  adjustments: fields("workReplayEvents workDurationDifferences quotaStaleObservations"),
  allowance: fields("remainingPercent observedAt", { points: list(fields("at remainingPercent breakBefore")) }),
  planAttribution: fields("policyVersion estimationPlanType inferredObservations unresolvedObservations"),
  workHours: list(fields("level ratePpPerHour hours inferred")),
  classification: fields("version", { centers: list(SCALAR) }),
  recentClassification: fields("version", { centers: list(SCALAR) }),
  daily: list(fields("date light medium heavy unclassified covered inferred", {
    plans: list(fields("planType light medium heavy unclassified covered inferred")),
  })),
  current: fields("windowMinutes state usdPerHour level ratePpPerHour hours"),
  trend: fields("windowMinutes state ratePpPerHour usdPerHour level observedFrom observedThrough coveredMinutes inferred"),
  segmentation: fields("policyVersion pendingSince", {
    plans: list(fields("planType closedIntervals observedPp dailyPp outsidePp unallocatedPp")),
  }),
  unallocated: fields("totalIntervals truncated", {
    plans: list(fields("planType pp intervals")),
    records: list(fields("from to planType pp reason inferred")),
  }),
  comparison: fields("startedAtMs inferred observedFrom observedThrough capacityUsd coverage confirmedThrough actualPp expectedPp planType", {
    baseline: fields("atMs usedPercent resetAtMs planType limitId"),
  }),
  coverage: fields("workMs actualWorkMs actualPp estimationWorkMs estimationPp activeTasks unresolvedTasks"),
  pricingDetails: fields("total truncated", {
    records: list(fields("at model reason tokens inputUncached cacheRead output")),
    capture: fields("status checkedAt errorCode coverageGap captured"),
  }),
  capacityHistory: list(fields("usd availableAtMs planType version basisId")),
});

const modelScalars = keyed([...REVIEWED_CODEX_MODEL_IDS, "unknown", "other"], SCALAR);
const artifactValue = [SCALAR, list(SCALAR)];
const artifactDatasets = (kind) => Object.fromEntries(
  Object.entries(COMPANION_ARTIFACTS[kind].datasets)
    .map(([name, keys]) => [name, list(keyed(keys, artifactValue))]),
);
const liveWeeklyDatasets = {
  summary: list(fields(`plan_type median_weekly_value_usd lower_80_across_resets_usd upper_80_across_resets_usd
    composition_status blended_capacity_usd composition_r2 composition_single_constant_r2 composition_observations
    qualifying_resets selected_holdout_mae_pp prior_reset_mae_pp prior_reset_bias_pp prior_reset_p80_absolute_error_pp`, {
    capacity_by_model: modelScalars, model_cost_shares: modelScalars,
  })),
  weekly_values: list(fields(`plan_type plan_variant aggregation_eligibility sequence first_observed_at last_observed_at
    reset_due_at slot displayed_span_pp value_usd pairwise_p10_usd pairwise_p90_usd holdout_mae_pp known_speed_fraction
    eligible_transitions unique_percentage_boundaries`, {
    price_card_ids: list(SCALAR), price_card_breakdown: list(priceCard),
  })),
};
const weekly = fields("windowDurationMinutes planType selectedPlanType status generatedAt artifactStatus errorCode dataClass interpretation", {
  planAttribution: fields("methodVersion status accountVerified comparisonEligibility"),
  accountAttribution: historicalAttribution, limitations: list(SCALAR), stale,
  datasets: liveWeeklyDatasets,
  allowanceBasis: fields("scenario basisFamilyId basisId", { unknownSpeedPolicy: policy }),
});
weekly.planPopulations = list({ ...weekly });
const forecast = fields("schemaVersion status currentUsedPercent remainingPercent resetsAt observationCount etaAt hoursToExhaustion hoursToReset", {
  pace: fields("method sampleCount elapsedHours movementPp activePercentagePointsPerHour overallPercentagePointsPerHour"),
});
const outlook = fields("schemaVersion status standing critical earlyEstimate remainingPercent resetsAt observationCount elapsedHours", {
  rates: fields("activePercentagePointsPerHour overallPercentagePointsPerHour headlinePercentagePointsPerHour sustainablePercentagePointsPerHour ratio"),
  projection: fields("hoursToReset coveredHours dryHours sparePercent projectedExhaustionAt"),
  track: fields("coveredFraction activeExhaustionFraction"),
});
const replayDiagnostics = fields("filesScanned forkReplayEventsExcluded unattributedForkReplayEventsExcluded duplicateSnapshotsExcluded contradictedLeadingSnapshotsExcluded missingLineageParents");
const accountingPeriod = fields("periodId periodLabel quotaWeightedApiPriceEquivalentUsd evidenceStartDate", {
  ...without(usage, ["id", "label", "pricedEventFraction", "apiPriceEquivalentUsdExact",
    "speedApiPriceEquivalentUsdExact", "declaredSpeedWeighting"]),
  reportingWindow: coveredAt, fastMode,
});
const accounting = fields(`sourceMode readerVersion compatibilityBehavior sourceCoverageStatus generation generationFingerprint
  generationMatched fallbackCount diagnosticsAvailable periodId periodLabel events totalTokens apiPriceEquivalentUsd
  apiPriceEquivalentUsdExact quotaWeightedApiPriceEquivalentUsd apiPriceCounterfactualTier subscriptionSpeedIsSeparate
  reasoningEffortAvailable accountingSource accountingCacheStatus evidenceStartDate historyPeriodStatus historyGeneratedAt
  generatedAt unknownModelEvents`, {
  ...without(usage, ["id", "label", "pricedEventFraction", "priceCardIds", "priceCardBreakdown",
    "pricingCoverage", "speedApiPriceEquivalentUsdExact", "declaredSpeedWeighting"]),
  projection: fields("status reason terminal retainedAt", { coveredAt }),
  cacheDiagnosticsSource: fields("generation generationFingerprint"),
  sourceCapabilities: fields("readsRawSources deterministicCanonicalOrder sourceOrderingProvenance sourceOffsetProvenance sourceScopedQuotaOccurrences durableDiagnostics crashSafeGenerationPublication"),
  fastMode, toolClasses: tools, historyCoverage, historyCoveredAt: coveredAt, coveredAt,
  staleServe: { ...stale, periods: list(fields("periodId periodLabel events totalTokens apiPriceEquivalentUsd")) },
  replayExclusionDiagnostics: replayDiagnostics,
  cacheSwitchImpact: cacheImpact, cacheContinuityImpact: cacheImpact,
  trayCacheSummary: fields("schemaVersion", { periods: list(fields("periodId status comparableReturns reusedMoreThanHalfReturns reusePercent coverageStatus")) }),
  periods: list(accountingPeriod),
});
const freshnessComponent = fields("status asOf");
const artifactStatus = fields("status generatedAt dataClass");
const snapshotContract = fields("schemaVersion mode generatedAt", {
  overview: fields("status evidenceStatus latestEvidenceAt latestObservedAt", {
    workload,
    freshness: fields("status latestObservedAt ageSeconds staleAfterSeconds accountingStatus accountingAgeSeconds", {
      accountingFreshness: keyed(["windows", "timeline", "quota", "calibration", "weeklyApiIntervals", "planScope"], freshnessComponent),
    }),
    collector: fields("status records malformedLines lastScanAt safeRecordCount identityMode sourceMode indexingState", {
      recordCounts: fields("usage quota tools other"), coveredAt, exportableCoveredAt: coveredAt,
      indexing: fields("status phase mode filesDiscovered filesSelected filesProcessed recordsWritten boundedBy", { coveredAt }),
    }),
    quota: fields("status observedAt accountAttribution", { windows: list(quotaWindow) }),
    quotaFreshness: fields("status latestObservedAt ageSeconds staleAfterSeconds source"),
    quotaWindows: list(quotaWindow), usage: list(usage), tools,
    timeline: fields("bucketMinutes source", {
      coveredAt,
      allowanceWeightingEncoding: fields("schemaVersion basisFamilyId selectedScenario", {
        scenarioOrder: list(SCALAR), unknownSpeedPolicy: policy,
      }),
      usage: list(timelineUsage), sparkUsage: list(timelineUsage),
      allowanceCapacity, planScoped,
      historicalPlanComparisons: list(fields("planType failure", { allowanceCapacity, planScoped })),
      weeklyApiIntervals: fields("schemaVersion status reason generatedAt sourceGeneration sourceFingerprint", {
        rows: list(fields("startMs endMs planType segment quotaPp apiUsd weeklyUsd reason usageEvents unknownSpeedEvents excludedReviewEvents excludedReviewUsd", { priceCardIds: list(SCALAR) })),
      }),
      quota: list(quotaWindow), sparkQuota: list(quotaWindow),
      history: fields("status reason usageEvents generatedAt sourceCount indexBytes source boundedDays", { coveredAt }),
      resetEvents: list(fields("schemaVersion kind occurredAt observedAt intervalStartedAt precision reason provider planType limitId windowDurationMins")),
    }),
    accounting,
    activity: fields("safeRecordCount usageEvents toolEvents lastScanAt"),
    pricing: fields(`accountingSourceMode accountingGeneration accountingGenerationMatched basis totalCostUsd
      quotaWeightedTotalCostUsd quotaWeightedMetricLabel quotaWeightedMetricExplainer periodLabel coveragePercent
      eventCount apiTier eventTimeHistoricalTotalUsdExact currentPriceSensitivityTotalUsdExact apiServiceTier
      subscriptionSpeedIsSeparate registryVersion registryObservedAt evidenceStartDate mixedPriceCardWindows
      priceEpochBasis accountingSource accountingCacheStatus historyPeriodStatus`, {
      spark: usageFields, fastMode, pricingCoverage,
      components: list({ name: SCALAR, ...componentCost }),
      priceCardIds: list(SCALAR), priceCardBreakdown: list(priceCard),
      replayExclusionDiagnostics: replayDiagnostics, historyCoverage,
    }),
    coverage: fields("overallPercent", { history: historyCoverage }),
    warnings: list(SCALAR),
    monitoringGaps: list(fields("id title status explanation")),
    artifactStatus: { gradient: artifactStatus, weekly: artifactStatus, quality: artifactStatus },
    privacy: fields("rawLogsSentToBrowser responseContract accountIdentifiersIncluded localPathsIncluded"),
  }),
  gradient: fields("status generatedAt artifactStatus errorCode", { datasets: artifactDatasets("gradient") }),
  quality: fields("status generatedAt artifactStatus errorCode", { datasets: artifactDatasets("quality") }),
  weekly: { ...weekly, paceForecast: forecast, paceOutlook: outlook,
    allowanceHistoryByWindow: { "300": weekly } },
});

function matches(value, contract, state, depth) {
  if (++state.nodes > 2_000_000 || depth > 48) return false;
  // Explicit unknown/unavailable values are part of the existing DTO.
  if (value === null || value === undefined) return true;
  if (contract === SCALAR) return typeof value === "boolean"
    || (typeof value === "string" && value.length <= 4_096)
    || (typeof value === "number" && Number.isFinite(value));
  if (Array.isArray(contract)) return contract.some((option) => matches(value, option, state, depth));
  if (typeof value !== "object") return false;
  if (types.isProxy(value)) return false;
  const array = Object.hasOwn(contract, "item");
  if (array !== Array.isArray(value)
      || Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)
        && (array || Object.getPrototypeOf(value) !== null)) return false;
  const keys = Reflect.ownKeys(value);
  if (array && (value.length > 100_000 || keys.length !== value.length + 1)) return false;
  for (const key of keys) {
    if (array && key === "length") continue;
    if (typeof key !== "string" || (!array && !Object.hasOwn(contract, key))) return false;
    if (array && (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")
        || !matches(descriptor.value, array ? contract.item : contract[key], state, depth + 1)) return false;
  }
  return true;
}

/** Same closed, content-free contract for persistence and restored publication.
 * No custom serialization, accessors, inherited fields, or unknown nested keys
 * can cross it. Optional fields remain optional; authority is checked separately.
 */
export function isClosedLocalCompanionSnapshot(value) {
  try {
    if (Object.hasOwn(Object.prototype, "toJSON") || Object.hasOwn(Array.prototype, "toJSON")) return false;
    return value !== null && typeof value === "object"
      && matches(value, snapshotContract, { nodes: 0 }, 0);
  } catch {
    return false;
  }
}
