import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorkspace, insertSyntheticUsageAt } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { createLocalCollectorRefreshRunner } from "../src/local-companion-refresh.js";
import { refreshLocalIndexAccountingCache } from "../src/local-index-accounting-cache.js";
import { readLocalIndexCompanionProjection } from "../src/local-index-companion-source.js";
import {
  readLocalCollectorAccountingCache,
  writeLocalCollectorAccountingCache,
} from "../src/local-collector-state.js";

const COMPLETE_INDEX = Object.freeze({
  mode: "recent_7d",
  status: "recent_7d_complete",
  phase: "complete",
  boundedBy: "modified_at_and_collection_start",
  filesDiscovered: 9,
  filesSelected: 4,
  filesProcessed: 4,
  recordsWritten: 12,
  coveredAt: {
    startAt: "2026-07-16T12:00:00.000Z",
    endAt: "2026-07-23T12:00:00.000Z",
  },
});


test("normal appends stop triggering a full accounting rebuild", async t => {
  const workspace = createWorkspace({
    files: 3, events: 500, days: 40, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  const stateFile = join(workspace.state, "collector.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  let nowMs = Date.parse("2026-09-01T00:00:00.000Z");
  let rebuilds = 0;
  let failNextRebuild = false;
  let policy = { mode: "standard", customFastRatioBps: null };
  const proof = {
    id: 1,
    fingerprint: "f".repeat(64),
    components: {
      file: "file",
      revision: 1,
      baselines: "b".repeat(64),
      origins: "o".repeat(64),
      policy: "p".repeat(64),
    },
    coverage: null,
    committedAtMs: 0,
  };
  const fakeReuse = {
    readProof: async () => proof,
    reuse: async () => null,
    matches: () => true,
    persist: async ({ cache, signal }) => {
      await writeLocalCollectorAccountingCache({ stateFile, cache, signal });
      return true;
    },
  };
  const quotaRefreshIntervalMs = 15 * 60_000;
  const runner = createLocalCollectorRefreshRunner({
    codexHome: workspace.codexHome,
    stateFile,
    unifiedIndexFile: indexFile,
    unifiedIndexSecretFile: workspace.secretFile,
    clock: () => nowMs,
    accountingQuotaRefreshIntervalMs: quotaRefreshIntervalMs,
    accountingCalibrationIntervalHours: 6,
    getUnknownSpeedPolicy: () => policy,
    createCalculationReuse: () => fakeReuse,
    selectAccountObservationSecret: () => ({
      loadAccountObservationSecret: null,
    }),
    runCollector: async () => ({
      rolloutRecordsWritten: 1,
      filesDiscovered: 1,
      refresh: { attempted: true, recordWritten: true, errorCode: null },
      indexing: COMPLETE_INDEX,
    }),
    refreshUnifiedIndex: async () => ({
      status: "ingested",
      generation: (await readLocalIndexCompanionProjection({
        indexFile, nowMs,
      })).generation,
    }),
    refreshAccounting: async options => {
      rebuilds += 1;
      if (failNextRebuild) {
        failNextRebuild = false;
        const failure = new Error("synthetic accounting failure");
        failure.code = "accounting_unified_source_unavailable";
        throw failure;
      }
      return refreshLocalIndexAccountingCache({
        ...options,
        indexFile,
        stateFile,
      });
    },
  });

  const first = await runner();
  assert.equal(first.accounting.refreshStatus, "rebuilt");
  assert.equal(rebuilds, 1);
  const stored = await readLocalCollectorAccountingCache({ stateFile });
  assert.equal(stored.status, "available");
  assert.equal(
    stored.cache.freshness?.windows?.digest?.length,
    64,
    "a full rebuild records the window state it consumed",
  );

  let quotaAsOfMs = Date.parse(stored.cache.freshness?.quota?.asOf);
  const quotaStatuses = [];
  for (let pass = 0; pass < 3; pass++) {
    insertSyntheticUsageAt(indexFile, nowMs - 3 * 86_400_000 + (pass + 1) * 3_600_000);
    insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
    nowMs += 10 * 60_000;
    const expectRetained = nowMs - quotaAsOfMs < quotaRefreshIntervalMs;
    const result = await runner();
    assert.equal(result.accounting.refreshStatus, "fast_path");
    assert.equal(rebuilds, 1, "normal appends never replay the full history");
    const latest = await readLocalCollectorAccountingCache({ stateFile });
    assert.equal(latest.status, "available");
    assert.equal(
      latest.cache.freshness?.calibration?.status,
      "retained",
      "low-frequency calibration is retained with an explicit asOf",
    );
    const quota = latest.cache.freshness?.quota;
    assert.equal(
      quota?.status,
      expectRetained ? "retained" : "exact",
      "the capped quota series follows its elapsed-time refresh boundary",
    );
    assert.equal(
      Date.parse(quota?.asOf),
      expectRetained ? quotaAsOfMs : nowMs,
      "a retained series keeps its asOf; an exact one advances to this pass",
    );
    quotaAsOfMs = Date.parse(quota?.asOf);
    quotaStatuses.push(quota?.status);
    assert.equal(
      latest.cache.coveredAt.endAt,
      new Date(nowMs).toISOString(),
    );
    assert.equal(
      latest.cache.periods.find(row => row.id === "24h").events > 0,
      true,
    );
  }

  // Six hours after the last real refit the default policy is due. The next
  // append must run a real rebuild instead of retaining calibration forever.
  nowMs = Date.parse("2026-09-01T00:00:00.000Z") + 7 * 3_600_000;
  insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
  const due = await runner();
  assert.equal(due.accounting.refreshStatus, "rebuilt");
  assert.equal(due.accounting.fastPathFallbackCode, "calibration_due");
  assert.equal(due.accounting.rebuildCause, "calibration_due");
  assert.equal(rebuilds, 2, "a due calibration forces one real refit");

  nowMs += 10 * 60_000;
  insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
  const afterRefit = await runner();
  assert.equal(afterRefit.accounting.refreshStatus, "fast_path");
  assert.equal(rebuilds, 2, "the refit restarts the fast-path interval");

  // A basis change (the unknown-speed policy here) makes the retained window
  // state unusable. The foreground shadow defers, the runner performs one real
  // rebuild, and the post-rebuild shadow reseeds the window cache under the
  // new basis so the following append can fast-path again.
  policy = { mode: "fast", customFastRatioBps: null };
  nowMs += 10 * 60_000;
  insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
  const basisChanged = await runner();
  assert.equal(basisChanged.accounting.refreshStatus, "rebuilt");
  assert.equal(basisChanged.accounting.fastPathFallbackCode, "basis_changed");
  assert.equal(basisChanged.accounting.rebuildCause, "basis_changed");
  assert.equal(rebuilds, 3, "a basis change forces exactly one rebuild");

  nowMs += 10 * 60_000;
  insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
  const afterBasis = await runner();
  assert.equal(afterBasis.accounting.refreshStatus, "fast_path");
  assert.equal(Object.hasOwn(afterBasis.accounting, "rebuildCause"), false);
  assert.equal(rebuilds, 3, "the post-rebuild seed restores the fast path");

  // A due refit that fails must keep the last-good cache visible. The failure
  // also starts a bounded retry pause instead of blanking the page or
  // hammering the rebuild on every tick.
  nowMs += 7 * 3_600_000;
  insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
  failNextRebuild = true;
  const failedRefit = await runner();
  assert.equal(failedRefit.accounting.status, "replay_safe");
  assert.equal(failedRefit.accounting.refreshStatus, "deferred");
  assert.equal(rebuilds, 4, "the due attempt ran once");

  nowMs += 60_000;
  insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
  const backoffPass = await runner();
  assert.equal(backoffPass.accounting.status, "replay_safe");
  assert.equal(backoffPass.accounting.refreshStatus, "deferred");
  assert.equal(rebuilds, 4, "the short retry pause does not re-attempt");

  nowMs += 6 * 60_000;
  insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
  const recovered = await runner();
  assert.equal(recovered.accounting.refreshStatus, "rebuilt");
  assert.equal(rebuilds, 5, "the retry pauses then refits");
});

test("manual repair escalates from a window range to a full rebuild", async t => {
  const workspace = createWorkspace({
    files: 2, events: 200, days: 20, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  const stateFile = join(workspace.state, "collector.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  let nowMs = Date.parse("2026-09-01T00:00:00.000Z");
  let rebuilds = 0;
  let cached = null;
  const proof = {
    id: 1,
    fingerprint: "f".repeat(64),
    components: {
      file: "file",
      revision: 1,
      baselines: "b".repeat(64),
      origins: "o".repeat(64),
      policy: "p".repeat(64),
    },
    coverage: null,
    committedAtMs: 0,
  };
  const fakeReuse = {
    readProof: async () => proof,
    reuse: async () => cached,
    matches: () => true,
    persist: async ({ cache, signal }) => {
      cached = cache;
      await writeLocalCollectorAccountingCache({ stateFile, cache, signal });
      return true;
    },
  };
  const runner = createLocalCollectorRefreshRunner({
    codexHome: workspace.codexHome,
    stateFile,
    unifiedIndexFile: indexFile,
    unifiedIndexSecretFile: workspace.secretFile,
    clock: () => nowMs,
    accountingQuotaRefreshIntervalMs: 15 * 60_000,
    accountingCalibrationIntervalHours: 6,
    createCalculationReuse: () => fakeReuse,
    selectAccountObservationSecret: () => ({
      loadAccountObservationSecret: null,
    }),
    runCollector: async () => ({
      rolloutRecordsWritten: 1,
      filesDiscovered: 1,
      refresh: { attempted: true, recordWritten: true, errorCode: null },
      indexing: COMPLETE_INDEX,
    }),
    refreshUnifiedIndex: async () => ({
      status: "ingested",
      generation: (await readLocalIndexCompanionProjection({
        indexFile, nowMs,
      })).generation,
    }),
    refreshAccounting: async options => {
      rebuilds += 1;
      return refreshLocalIndexAccountingCache({
        ...options,
        indexFile,
        stateFile,
      });
    },
  });

  const first = await runner();
  assert.equal(first.accounting.refreshStatus, "rebuilt");
  assert.equal(rebuilds, 1);
  assert.equal(first.accounting.windowCounters.fullRebuilds, 1);
  assert.deepEqual(first.accounting.windowCounters.fullRebuildsByReason, {
    calibration_due: 0,
    basis_changed: 0,
    manual: 0,
  });
  assert.ok(first.accounting.windowCounters.recomputedWindows >= 1);
  assert.equal(first.accounting.windowCounters.unavailableWindows, 0);
  assert.equal(first.accounting.windowCounters.mismatchWindows, 0);

  const noChange = await runner();
  assert.equal(noChange.accounting.refreshStatus, "fast_path");
  assert.deepEqual(
    noChange.accounting.windowCounters,
    first.accounting.windowCounters,
    "a no-change pass must add no dirty, recomputed, or full-rebuild counters",
  );

  insertSyntheticUsageAt(indexFile, nowMs + 5 * 60_000);
  nowMs += 5 * 60_000;
  const windowRepair = await runner({
    repair: {
      scope: "window",
      fromMs: nowMs - 2 * 86_400_000,
      toMs: nowMs,
    },
  });
  assert.equal(windowRepair.accounting.refreshStatus, "fast_path");
  assert.equal(rebuilds, 1, "a window repair stays incremental");
  assert.equal(Object.hasOwn(windowRepair.accounting, "fastPathFallbackCode"), false,
    "a successful fast path clears the previous fallback code");
  assert.equal(windowRepair.accounting.repair.scope, "window");
  assert.equal(windowRepair.accounting.repair.status, "completed");
  assert.ok(windowRepair.accounting.repair.repairedDays >= 1);
  assert.equal(windowRepair.accounting.windowCounters.fullRebuilds, 1,
    "an incremental repair does not count as a full rebuild");
  assert.ok(
    windowRepair.accounting.windowCounters.dirtyWindows
      >= windowRepair.accounting.repair.repairedDays,
  );
  assert.ok(
    windowRepair.accounting.windowCounters.recomputedWindows
      >= windowRepair.accounting.repair.repairedDays,
  );

  nowMs += 5 * 60_000;
  const fullRepair = await runner({ repair: { scope: "full" } });
  assert.equal(fullRepair.accounting.refreshStatus, "rebuilt");
  assert.equal(fullRepair.accounting.rebuildCause, "manual");
  assert.deepEqual(fullRepair.accounting.repair, {
    scope: "full",
    status: "completed",
  });
  assert.equal(rebuilds, 2, "the full repair bypasses both reuse and the fast path");
  assert.equal(fullRepair.accounting.windowCounters.fullRebuilds, 2);
  assert.equal(
    fullRepair.accounting.windowCounters.fullRebuildsByReason.manual,
    1,
  );
});

test("calibration due still forces a refit when the fast path is disabled", async t => {
  const workspace = createWorkspace({
    files: 2, events: 200, days: 20, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  const stateFile = join(workspace.state, "collector.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  let nowMs = Date.parse("2026-09-01T00:00:00.000Z");
  let rebuilds = 0;
  let cached = null;
  let calibration = { intervalHours: 6, changedAtMs: null };
  const proof = {
    id: 1,
    fingerprint: "f".repeat(64),
    components: {
      file: "file",
      revision: 1,
      baselines: "b".repeat(64),
      origins: "o".repeat(64),
      policy: "p".repeat(64),
    },
    coverage: null,
    committedAtMs: 0,
  };
  const fakeReuse = {
    readProof: async () => proof,
    reuse: async () => cached,
    matches: () => true,
    persist: async ({ cache, signal }) => {
      cached = cache;
      await writeLocalCollectorAccountingCache({ stateFile, cache, signal });
      return true;
    },
  };
  const runner = createLocalCollectorRefreshRunner({
    codexHome: workspace.codexHome,
    stateFile,
    unifiedIndexFile: indexFile,
    unifiedIndexSecretFile: null,
    clock: () => nowMs,
    accountingFastPath: false,
    accountingCalibrationIntervalHours: 6,
    getAccountingCalibrationSettings: async () => calibration,
    createCalculationReuse: () => fakeReuse,
    selectAccountObservationSecret: () => ({
      loadAccountObservationSecret: null,
    }),
    runCollector: async () => ({
      rolloutRecordsWritten: 1,
      filesDiscovered: 1,
      refresh: { attempted: true, recordWritten: true, errorCode: null },
      indexing: COMPLETE_INDEX,
    }),
    refreshUnifiedIndex: async () => ({
      status: "ingested",
      generation: (await readLocalIndexCompanionProjection({
        indexFile, nowMs,
      })).generation,
    }),
    refreshAccounting: async options => {
      rebuilds += 1;
      return refreshLocalIndexAccountingCache({
        ...options,
        indexFile,
        stateFile,
      });
    },
  });

  const first = await runner();
  assert.equal(first.accounting.refreshStatus, "rebuilt");
  assert.equal(rebuilds, 1);

  const reused = await runner();
  assert.equal(reused.accounting.refreshStatus, "reused");
  assert.equal(rebuilds, 1, "the ordinary reuse path is active");

  // A wider interval read on the next pass postpones the due refit without
  // recreating the runner.
  calibration = { intervalHours: 168, changedAtMs: nowMs };
  nowMs += 7 * 3_600_000;
  const postponed = await runner();
  assert.equal(postponed.accounting.refreshStatus, "reused");
  assert.equal(rebuilds, 1, "the per-pass interval is authoritative");

  calibration = { intervalHours: 6, changedAtMs: nowMs };
  nowMs += 7 * 3_600_000;
  const due = await runner();
  assert.equal(due.accounting.refreshStatus, "rebuilt");
  assert.equal(due.accounting.rebuildCause, "calibration_due");
  assert.equal(rebuilds, 2, "due calibration bypasses reuse without the fast path");
});
