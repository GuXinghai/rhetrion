import {
  REPLAY_SAFE_ACCOUNTING_SCHEMA_VERSION,
  REPLAY_SAFE_CALIBRATION_INTERNALS,
  assertReplaySafeAccountingCache,
  projectReplaySafeAccountingRetainedSlices,
} from "./replay-safe-accounting-cache.js";
import {
  accountingWindowCacheDigest,
} from "./local-index-accounting-window-cache.js";

const {
  MAX_CACHE_BYTES,
  fixedError,
  publicDiagnostics,
  throwIfAborted,
} = REPLAY_SAFE_CALIBRATION_INTERNALS;

export const LOCAL_ACCOUNTING_FAST_PATH_VERSION =
  "local-accounting-fast-path-v1";
export const LOCAL_ACCOUNTING_FRESHNESS_VERSION =
  "local-accounting-freshness-v1";

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 365;

function relabelPlanScope(receipt, generation, generationFingerprint) {
  if (receipt?.status !== "available" || !receipt.planScope) return receipt;
  return {
    ...receipt,
    planScope: {
      ...receipt.planScope,
      sourceGeneration: generation,
      sourceGenerationFingerprint: generationFingerprint,
    },
  };
}

function relabelPlanComparisons(rows, generation, generationFingerprint) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    return {
      ...row,
      planScopedTimeline: relabelPlanScope(
        row.planScopedTimeline, generation, generationFingerprint,
      ),
    };
  });
}

/**
 * Compose a shipping accounting cache from the exact window cache plus the
 * previous full cache's retained low-frequency artifacts.
 *
 * The caller must prove first that:
 *  - the previous cache consumed exactly the window state that the current
 *    update started from (`previousWindowDigest`),
 *  - the window basis did not move, and
 *  - the thread-origin and policy digests did not move.
 *
 * Only the moving timeline/quota slices are re-read. Everything else is
 * retained and labelled with an explicit `asOf`, never silently presented as
 * fresh.
 */
export async function composeLocalAccountingFastPath({
  previousCache,
  windowCache,
  previousWindowDigest,
  // The shadow pass is the only component that holds the key needed to verify
  // every stored day digest. It passes this flag after that verification.
  windowVerified = false,
  scan,
  expectedGeneration,
  endMs,
  windowDays = DEFAULT_WINDOW_DAYS,
  staleFromMs = null,
  retainQuota = false,
  declaredSpeedBaselines = [],
  provenance = null,
  signal = null,
  now = () => Date.now(),
  onTiming = null,
  monotonicClock = undefined,
  projectSlices = projectReplaySafeAccountingRetainedSlices,
} = {}) {
  assertReplaySafeAccountingCache(previousCache);
  if (!windowCache || typeof windowCache !== "object") {
    throw new TypeError("accounting fast path windowCache is invalid");
  }
  if (windowVerified !== true) {
    throw fixedError("accounting_fast_path_window_unverified");
  }
  if (!Number.isSafeInteger(endMs) || endMs < 0) {
    throw fixedError("accounting_fast_path_window_invalid");
  }
  // The window cache folds its "all" period with the same fixed 365-day
  // window. A caller that asks for another span would silently mix anchors.
  if (windowDays !== DEFAULT_WINDOW_DAYS) {
    throw fixedError("accounting_fast_path_window_invalid");
  }
  if (typeof previousWindowDigest !== "string"
      || !/^[a-f0-9]{64}$/u.test(previousWindowDigest)) {
    throw fixedError("accounting_fast_path_window_state_unknown");
  }
  if (expectedGeneration === null || expectedGeneration === undefined
      || expectedGeneration.id === undefined
      || typeof expectedGeneration.fingerprint !== "string") {
    throw fixedError("accounting_fast_path_generation_unknown");
  }
  const previousEnd = Date.parse(previousCache.coveredAt.endAt);
  if (!Number.isSafeInteger(previousEnd) || endMs < previousEnd) {
    throw fixedError("accounting_fast_path_clock_invalid");
  }
  const freshness = previousCache.freshness;
  if (freshness?.schemaVersion !== LOCAL_ACCOUNTING_FRESHNESS_VERSION
      || freshness?.windows?.digest !== previousWindowDigest) {
    throw fixedError("accounting_fast_path_window_state_changed");
  }
  if (freshness.windows.basisFingerprint !== windowCache.basisFingerprint) {
    throw fixedError("accounting_fast_path_basis_changed");
  }
  if (previousCache.history?.status !== "available"
      || previousCache.weeklyApiIntervals?.status !== "available"
      || previousCache.sourceDescriptor?.mode !== "unified"
      || previousCache.sourceDescriptor?.fallbackCount !== 0) {
    throw fixedError("accounting_fast_path_cache_not_reusable");
  }
  const windowDigest = accountingWindowCacheDigest(windowCache);
  const generation = String(expectedGeneration.id);
  const generationFingerprint = expectedGeneration.fingerprint;
  const startMs = endMs - windowDays * DAY_MS;
  const dynamic = await projectSlices({
    cache: previousCache,
    scan,
    expectedGeneration,
    endMs,
    windowDays,
    staleFromMs,
    retainQuota,
    declaredSpeedBaselines,
    signal,
    onTiming,
    monotonicClock,
  });
  throwIfAborted(signal);
  if (dynamic.generation !== null
      && (String(dynamic.generation) !== generation
        || dynamic.generationFingerprint !== generationFingerprint)) {
    throw fixedError("accounting_unified_generation_mismatch");
  }
  const scanCoverage = dynamic.coverage;
  const sourceDescriptor = {
    ...previousCache.sourceDescriptor,
    generation,
    generationFingerprint,
    generationMatched: true,
    fallbackCount: 0,
    coverageStatus: scanCoverage?.status
      ?? previousCache.sourceDescriptor.coverageStatus,
  };
  if (scanCoverage !== null && scanCoverage !== undefined) {
    sourceDescriptor.coverage = {
      ...previousCache.sourceDescriptor.coverage,
      status: scanCoverage.status,
      blockReason: scanCoverage.blockReason ?? null,
      generatedAt: scanCoverage.generatedAt ?? null,
      coveredAt: scanCoverage.coveredAt ?? null,
      generationProof: scanCoverage.generationProof === true,
      sourceCount: scanCoverage.sourceCount ?? null,
      sourceBytes: scanCoverage.sourceBytes ?? null,
      skippedSourceCount: scanCoverage.skippedSourceCount ?? null,
      skippedSourceBytes: scanCoverage.skippedSourceBytes ?? null,
      skippedThreadCount: scanCoverage.skippedThreadCount ?? null,
      usageEvents: scanCoverage.usageEvents ?? null,
      quotaObservations: scanCoverage.quotaObservations ?? null,
      quotaOccurrences: scanCoverage.quotaOccurrences ?? null,
      admittedQuotaOccurrences:
        scanCoverage.admittedQuotaOccurrences ?? null,
    };
  }
  const history = {
    status: "available",
    errorCode: null,
    coverage: {
      status: scanCoverage?.status
        ?? previousCache.history.coverage.status,
      generatedAt: sourceDescriptor.coverage?.generatedAt
        ?? previousCache.history.coverage.generatedAt,
      coveredAt: sourceDescriptor.coverage?.coveredAt
        ?? previousCache.history.coverage.coveredAt,
      generation,
      generationFingerprint,
    },
    generation,
    generationFingerprint,
    period: windowCache.history,
  };
  const generatedAt = new Date(endMs).toISOString();
  const retainedAsOf = previousCache.coveredAt.endAt;
  const cache = {
    schemaVersion: REPLAY_SAFE_ACCOUNTING_SCHEMA_VERSION,
    unknownSpeedPolicy: previousCache.unknownSpeedPolicy,
    generatedAt,
    coveredAt: {
      startAt: new Date(startMs).toISOString(),
      endAt: generatedAt,
    },
    bucketMinutes: previousCache.bucketMinutes,
    accountingMethod: previousCache.accountingMethod,
    priceBasis: previousCache.priceBasis,
    pricingMethodVersion: previousCache.pricingMethodVersion,
    priceEpochBasis: previousCache.priceEpochBasis,
    priceRegistryVersion: previousCache.priceRegistryVersion,
    priceRegistryObservedAt: previousCache.priceRegistryObservedAt,
    sourceDescriptor,
    history,
    periods: windowCache.periods,
    timeline: dynamic.timeline,
    planScopedTimeline: relabelPlanScope(
      previousCache.planScopedTimeline, generation, generationFingerprint,
    ),
    historicalPlanComparisons: relabelPlanComparisons(
      previousCache.historicalPlanComparisons,
      generation,
      generationFingerprint,
    ),
    weeklyApiIntervals: {
      ...previousCache.weeklyApiIntervals,
      sourceGeneration: generation,
      sourceFingerprint: generationFingerprint,
    },
    sparkUsageTimeline: dynamic.sparkUsageTimeline,
    quotaTimeline: dynamic.quotaRetained
      ? previousCache.quotaTimeline
      : dynamic.quotaTimeline,
    sparkQuotaTimeline: dynamic.quotaRetained
      ? previousCache.sparkQuotaTimeline
      : dynamic.sparkQuotaTimeline,
    weeklyCalibration: previousCache.weeklyCalibration,
    allowanceCapacityByScenario: previousCache.allowanceCapacityByScenario,
    fiveHourAllowanceCalibration:
      previousCache.fiveHourAllowanceCalibration,
    weeklyCalibrationInput: previousCache.weeklyCalibrationInput,
    diagnostics: provenance?.diagnostics
      ? publicDiagnostics(provenance.diagnostics)
      : previousCache.diagnostics,
    freshness: {
      schemaVersion: LOCAL_ACCOUNTING_FRESHNESS_VERSION,
      windows: {
        status: "exact",
        asOf: generatedAt,
        digest: windowDigest,
        basisFingerprint: windowCache.basisFingerprint,
        calculationRevision: windowCache.calculationRevision,
      },
      timeline: {
        status: "exact",
        asOf: generatedAt,
        rescanFromAt: new Date(dynamic.rescanFromMs).toISOString(),
      },
      quota: dynamic.quotaRetained
        ? {
          status: "retained",
          asOf: previousCache.freshness?.quota?.asOf
            ?? previousCache.coveredAt.endAt,
        }
        : { status: "exact", asOf: generatedAt },
      calibration: {
        status: "retained",
        asOf: previousCache.weeklyCalibration?.generatedAt ?? retainedAsOf,
        coveredTo: retainedAsOf,
      },
      weeklyApiIntervals: {
        status: "retained",
        asOf: previousCache.weeklyApiIntervals.generatedAt ?? retainedAsOf,
        coveredTo: retainedAsOf,
      },
      planScope: { status: "retained", asOf: retainedAsOf },
      provenance: freshness.provenance ?? null,
    },
  };
  if (dynamic.quotaRetained) {
    if (previousCache.weekly === undefined) {
      delete cache.weekly;
    } else {
      cache.weekly = previousCache.weekly;
    }
  } else if (dynamic.weekly === null || dynamic.weekly === undefined) {
    delete cache.weekly;
  } else {
    cache.weekly = dynamic.weekly;
  }
  throwIfAborted(signal);
  assertReplaySafeAccountingCache(cache);
  const bytes = Buffer.byteLength(JSON.stringify(cache));
  if (bytes > MAX_CACHE_BYTES) {
    throw fixedError("cache_invalid_size");
  }
  return {
    cache,
    rescanFromMs: dynamic.rescanFromMs,
    windowDigest,
    computedAtMs: Number(now()),
  };
}

/**
 * Build the durable freshness envelope for a full rebuild. The window digest
 * is unknown until the shadow pass runs, so the runner completes it after
 * that pass and republishes once.
 */
export function accountingProvenanceFromProof(proof) {
  if (!proof || typeof proof !== "object" || !proof.components) return null;
  const components = proof.components;
  if (typeof components.origins !== "string"
      || typeof components.policy !== "string") return null;
  return {
    originFingerprint: components.origins,
    policyIdentity: components.policy,
    calculationRevision: components.revision,
    baselinesDigest: components.baselines,
    fileDigest: components.file,
    ...(proof.diagnostics && typeof proof.diagnostics === "object"
      && !Array.isArray(proof.diagnostics)
      ? { diagnostics: proof.diagnostics }
      : {}),
  };
}

/** True when only append-like inputs moved since the retained proof. */
export function accountingFastPathProvenanceMatches(previous, current) {
  if (previous === null || previous === undefined
      || current === null || current === undefined) return false;
  if (typeof previous.originFingerprint !== "string"
      || typeof current.originFingerprint !== "string") return false;
  return previous.originFingerprint === current.originFingerprint
    && previous.policyIdentity === current.policyIdentity;
}

/** Attach the window digest consumed by a full rebuild after its shadow pass. */
export function completeAccountingFreshness({
  cache,
  provenance = null,
  windowDigest,
  windowCache,
}) {
  if (cache === null || cache === undefined) return cache;
  const windows = windowDigest === null || windowDigest === undefined
    ? null
    : {
      status: "exact",
      asOf: new Date(Date.parse(cache.coveredAt.endAt)).toISOString(),
      digest: windowDigest,
      basisFingerprint: windowCache?.basisFingerprint ?? null,
      calculationRevision: windowCache?.calculationRevision ?? null,
    };
  const prior = cache.freshness?.schemaVersion
    === LOCAL_ACCOUNTING_FRESHNESS_VERSION
    ? cache.freshness
    : null;
  cache.freshness = {
    schemaVersion: LOCAL_ACCOUNTING_FRESHNESS_VERSION,
    ...(prior ?? {}),
    provenance: prior?.provenance ?? provenance ?? null,
    timeline: prior?.timeline ?? {
      status: "exact",
      asOf: cache.coveredAt.endAt,
    },
    quota: prior?.quota ?? {
      status: "exact",
      asOf: cache.coveredAt.endAt,
    },
    ...(windows === null ? {} : { windows }),
  };
  return cache;
}
