import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import {
  createLocalIndexAccountingScan,
  localIndexCalibrationSource,
} from "../src/local-index-accounting-cache.js";
import {
  buildReplaySafeAccountingCache,
  assertReplaySafeAccountingCache,
} from "../src/replay-safe-accounting-cache.js";
import { readLocalIndexCompanionProjection } from "../src/local-index-companion-source.js";
import {
  createAccountingWindowReceipts,
  updateAccountingWindowReceipts,
} from "../src/local-index-accounting-windows.js";
import {
  accountingWindowCacheDigest,
  createAccountingWindowCache,
  updateAccountingWindowCache,
} from "../src/local-index-accounting-window-cache.js";
import {
  completeAccountingFreshness,
  composeLocalAccountingFastPath,
  accountingFastPathProvenanceMatches,
  normalizeAccountingFastPathFallbackCode,
} from "../src/local-accounting-fast-path.js";

const KEY = "synthetic-fast-path-key";
const T0 = Date.parse("2026-09-01T00:00:00.000Z");
const T1 = T0 + 10 * 60_000;
const BASELINES = [{
  mode: "standard",
  firstSeenAt: new Date(T0 - 20 * 86_400_000).toISOString(),
  lastSeenAt: new Date(T0 - 86_400_000).toISOString(),
}];
const PROVENANCE = {
  originFingerprint: "o".repeat(64),
  policyIdentity: "p".repeat(64),
};

function insertUsageAt(indexFile, observedAtMs) {
  const database = new DatabaseSync(indexFile);
  try {
    const source = database.prepare(`SELECT s.id, s.scanned_bytes,
      (SELECT MIN(u.source_offset) FROM usage_event u WHERE u.source_id = s.id) AS first_offset
      FROM source s ORDER BY s.scanned_bytes DESC, s.id LIMIT 1`).get();
    const offset = Number(source.first_offset) - 1;
    assert.ok(offset >= 0 && offset <= Number(source.scanned_bytes));
    database.prepare(`INSERT INTO usage_event(source_id, source_offset,
      observed_at_ms, event_key, session_id, account_scope_id, model_id, tier_id,
      surface_id, quota_observation_id, tier_observed_at_ms, reasoning_effort,
      flags, work_directory_id, tokens_in_uncached, tokens_in_cache_read,
      tokens_in_cache_write, tokens_out_text, tokens_out_reasoning,
      tokens_out_combined, total_input_context)
      SELECT source_id, ?, ?, randomblob(32), session_id, account_scope_id,
        model_id, tier_id, surface_id, quota_observation_id, tier_observed_at_ms,
        reasoning_effort, 0, work_directory_id, tokens_in_uncached,
        tokens_in_cache_read, tokens_in_cache_write, tokens_out_text,
        tokens_out_reasoning, tokens_out_combined, total_input_context
      FROM usage_event WHERE source_id = ?
      ORDER BY source_offset DESC LIMIT 1`)
      .run(offset, observedAtMs, source.id);
    database.prepare(
      "UPDATE store_state SET calculation_revision = calculation_revision + 1 WHERE id = 1",
    ).run();
  } finally {
    database.close();
  }
}

async function buildFull({ workspace, indexFile, atMs }) {
  const generation = (await readLocalIndexCompanionProjection({
    indexFile, nowMs: atMs,
  })).generation;
  let dayAccumulators = null;
  let dayAccumulatorsRevision = null;
  const cache = await buildReplaySafeAccountingCache({
    sourceMode: "unified",
    expectedGeneration: generation,
    now: () => atMs,
    codexHome: workspace.codexHome,
    scan: createLocalIndexAccountingScan({ indexFile }),
    calibrationSource: localIndexCalibrationSource({ indexFile }),
    windowDays: 365,
    declaredSpeedBaselines: BASELINES,
    onDayAccumulators: (map, revision) => {
      dayAccumulators = map;
      dayAccumulatorsRevision = revision;
    },
  });
  return { cache, generation, dayAccumulators, dayAccumulatorsRevision };
}

test("fast path composes exact windows and timeline after a late fact", async t => {
  const workspace = createWorkspace({
    files: 3, events: 500, days: 40, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  const base = await buildFull({ workspace, indexFile, atMs: T0 });
  const receipts0 = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, declaredSpeedBaselines: BASELINES, now: () => T0,
  });
  assert.equal(
    base.dayAccumulatorsRevision,
    receipts0.calculationRevision,
    "the day map carries the exact revision of its read snapshot",
  );
  const windowCache0 = await createAccountingWindowCache({
    indexFile, receipts: receipts0, hmacKey: KEY, endMs: T0,
    declaredSpeedBaselines: BASELINES, dayAccumulators: base.dayAccumulators,
    dayAccumulatorsRevision: receipts0.calculationRevision,
    now: () => T0,
  });
  assert.deepEqual(windowCache0.periods, base.cache.periods);
  assert.deepEqual(windowCache0.history, base.cache.history.period);
  completeAccountingFreshness({
    cache: base.cache,
    provenance: PROVENANCE,
    windowDigest: accountingWindowCacheDigest(windowCache0),
    windowCache: windowCache0,
  });

  // One late fact inside an older day and one fact in the new tail. The late
  // fact is what forces a real dirty-day rescan rather than a tail append.
  insertUsageAt(indexFile, T0 - 3 * 86_400_000 + 3_600_000);
  insertUsageAt(indexFile, T0 + 5 * 60_000);

  const receiptUpdate = await updateAccountingWindowReceipts({
    previous: receipts0, indexFile, hmacKey: KEY,
    unknownSpeedPolicy: undefined,
    declaredSpeedBaselines: BASELINES, now: () => T1,
  });
  const receipts1 = receiptUpdate.mode === "full"
    ? await createAccountingWindowReceipts({
      indexFile, hmacKey: KEY, declaredSpeedBaselines: BASELINES, now: () => T1,
    })
    : receiptUpdate.receipts;
  const updated = await updateAccountingWindowCache({
    previous: windowCache0, indexFile, receipts: receipts1, hmacKey: KEY,
    endMs: T1, declaredSpeedBaselines: BASELINES, now: () => T1,
  });
  assert.ok(Number.isSafeInteger(updated.dirtyFromMs));
  assert.ok(updated.dirtyFromMs <= T0 - 3 * 86_400_000 + 3_600_000);

  const composed = await composeLocalAccountingFastPath({
    previousCache: base.cache,
    windowCache: updated.cache,
    previousWindowDigest: accountingWindowCacheDigest(windowCache0),
    windowVerified: true,
    scan: createLocalIndexAccountingScan({ indexFile }),
    expectedGeneration: base.generation,
    endMs: T1,
    windowDays: 365,
    staleFromMs: updated.dirtyFromMs,
    declaredSpeedBaselines: BASELINES,
    provenance: PROVENANCE,
    now: () => T1,
  });
  const expected = await buildFull({ workspace, indexFile, atMs: T1 });
  assert.deepEqual(composed.cache.periods, expected.cache.periods);
  assert.deepEqual(composed.cache.history.period, expected.cache.history.period);
  assert.deepEqual(composed.cache.timeline, expected.cache.timeline);
  assert.deepEqual(
    composed.cache.sparkUsageTimeline, expected.cache.sparkUsageTimeline,
  );
  assert.deepEqual(
    composed.cache.quotaTimeline, expected.cache.quotaTimeline,
  );
  assert.deepEqual(
    composed.cache.sparkQuotaTimeline, expected.cache.sparkQuotaTimeline,
  );
  assert.deepEqual(composed.cache.weekly, expected.cache.weekly);
  assert.deepEqual(
    composed.cache.diagnostics,
    base.cache.diagnostics,
    "the fast path retains the last full-rebuild diagnostics instead of zeroing them",
  );
  assert.equal(composed.cache.freshness.windows.digest,
    accountingWindowCacheDigest(updated.cache));
  assert.equal(composed.cache.freshness.calibration.status, "retained");
  assert.equal(composed.cache.freshness.calibration.asOf,
    base.cache.weeklyCalibration.generatedAt);
  assert.equal(composed.cache.freshness.timeline.status, "exact");

  const retainedQuota = await composeLocalAccountingFastPath({
    previousCache: base.cache,
    windowCache: updated.cache,
    previousWindowDigest: accountingWindowCacheDigest(windowCache0),
    windowVerified: true,
    scan: createLocalIndexAccountingScan({ indexFile }),
    expectedGeneration: base.generation,
    endMs: T1,
    windowDays: 365,
    staleFromMs: updated.dirtyFromMs,
    declaredSpeedBaselines: BASELINES,
    provenance: PROVENANCE,
    retainQuota: true,
    now: () => T1,
  });
  assert.deepEqual(retainedQuota.cache.quotaTimeline,
    base.cache.quotaTimeline);
  assert.deepEqual(retainedQuota.cache.sparkQuotaTimeline,
    base.cache.sparkQuotaTimeline);
  assert.deepEqual(retainedQuota.cache.weekly, base.cache.weekly);
  assert.equal(retainedQuota.cache.freshness.quota.status, "retained");
  assert.equal(retainedQuota.cache.freshness.quota.asOf,
    base.cache.freshness.quota.asOf);
});

test("a freshness envelope is validated once it exists", async t => {
  const workspace = createWorkspace({
    files: 2, events: 200, days: 20, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  const base = await buildFull({ workspace, indexFile, atMs: T0 });
  const receipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, declaredSpeedBaselines: BASELINES, now: () => T0,
  });
  const windowCache = await createAccountingWindowCache({
    indexFile, receipts, hmacKey: KEY, endMs: T0,
    declaredSpeedBaselines: BASELINES, dayAccumulators: base.dayAccumulators,
    dayAccumulatorsRevision: receipts.calculationRevision,
    now: () => T0,
  });
  completeAccountingFreshness({
    cache: base.cache,
    provenance: PROVENANCE,
    windowDigest: accountingWindowCacheDigest(windowCache),
    windowCache,
  });
  assert.doesNotThrow(() => assertReplaySafeAccountingCache(base.cache));

  for (const mutate of [
    cache => { delete cache.freshness.quota; },
    cache => { cache.freshness.calibration.asOf = "not-an-instant"; },
    cache => { cache.freshness.windows.digest = "not-a-digest"; },
    cache => { delete cache.freshness.schemaVersion; },
  ]) {
    const copy = structuredClone(base.cache);
    mutate(copy);
    assert.throws(
      () => assertReplaySafeAccountingCache(copy),
      error => error.code === "cache_invalid",
    );
  }

  const legacy = structuredClone(base.cache);
  delete legacy.freshness;
  assert.doesNotThrow(() => assertReplaySafeAccountingCache(legacy));

  const withoutDigest = structuredClone(legacy);
  completeAccountingFreshness({
    cache: withoutDigest,
    provenance: PROVENANCE,
  });
  assert.equal(withoutDigest.freshness, undefined);
});

test("fast-path fallback codes stay bounded across producer prefixes", () => {
  assert.equal(
    normalizeAccountingFastPathFallbackCode("accounting_window_cache_baselines_mismatch"),
    "baselines_mismatch",
  );
  assert.equal(
    normalizeAccountingFastPathFallbackCode("accounting_window_manifest_range_missing"),
    "manifest_range_missing",
  );
  assert.equal(
    normalizeAccountingFastPathFallbackCode("accounting_fast_path_basis_changed"),
    "basis_changed",
  );
  assert.equal(
    normalizeAccountingFastPathFallbackCode("private/free-form-code"),
    "fast_path_failed",
  );
});

test("fast path provenance requires stable origins and policy", () => {
  const current = {
    originFingerprint: "a".repeat(64),
    policyIdentity: "b".repeat(64),
  };
  assert.equal(accountingFastPathProvenanceMatches(current, { ...current }), true);
  assert.equal(accountingFastPathProvenanceMatches(current, {
    ...current, originFingerprint: "c".repeat(64),
  }), false);
  assert.equal(accountingFastPathProvenanceMatches(current, {
    ...current, policyIdentity: "d".repeat(64),
  }), false);
  assert.equal(accountingFastPathProvenanceMatches(null, current), false);
  assert.equal(accountingFastPathProvenanceMatches(current, null), false);
});

test("fast path refuses a window state the retained cache did not consume", async t => {  const workspace = createWorkspace({
    files: 2, events: 300, days: 30, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  const base = await buildFull({ workspace, indexFile, atMs: T0 });
  const receipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, declaredSpeedBaselines: BASELINES, now: () => T0,
  });
  const windowCache = await createAccountingWindowCache({
    indexFile, receipts, hmacKey: KEY, endMs: T0,
    declaredSpeedBaselines: BASELINES, dayAccumulators: base.dayAccumulators,
    dayAccumulatorsRevision: receipts.calculationRevision,
    now: () => T0,
  });
  completeAccountingFreshness({
    cache: base.cache,
    provenance: PROVENANCE,
    windowDigest: accountingWindowCacheDigest(windowCache),
    windowCache,
  });
  await assert.rejects(
    composeLocalAccountingFastPath({
      previousCache: base.cache,
      windowCache,
      previousWindowDigest: accountingWindowCacheDigest(windowCache),
      scan: createLocalIndexAccountingScan({ indexFile }),
      expectedGeneration: base.generation,
      endMs: T1,
      declaredSpeedBaselines: BASELINES,
      provenance: PROVENANCE,
    }),
    error => error.code === "accounting_fast_path_window_unverified",
  );
  await assert.rejects(
    composeLocalAccountingFastPath({
      previousCache: base.cache,
      windowCache,
      previousWindowDigest: "f".repeat(64),
      windowVerified: true,
      scan: createLocalIndexAccountingScan({ indexFile }),
      expectedGeneration: base.generation,
      endMs: T1,
      declaredSpeedBaselines: BASELINES,
      provenance: PROVENANCE,
    }),
    error => error.code === "accounting_fast_path_window_state_changed",
  );
});
