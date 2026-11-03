import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorkspace } from "./helpers/local-index-facts.js";
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

function insertUsage(indexFile, observedAtMs) {
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
  const runner = createLocalCollectorRefreshRunner({
    codexHome: workspace.codexHome,
    stateFile,
    unifiedIndexFile: indexFile,
    unifiedIndexSecretFile: workspace.secretFile,
    clock: () => nowMs,
    accountingQuotaRefreshIntervalMs: 60 * 60_000,
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
  const stored = await readLocalCollectorAccountingCache({ stateFile });
  assert.equal(stored.status, "available");
  assert.equal(
    stored.cache.freshness?.windows?.digest?.length,
    64,
    "a full rebuild records the window state it consumed",
  );

  for (let pass = 0; pass < 3; pass++) {
    insertUsage(indexFile, nowMs - 3 * 86_400_000 + (pass + 1) * 3_600_000);
    insertUsage(indexFile, nowMs + 5 * 60_000);
    nowMs += 10 * 60_000;
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
    assert.equal(
      latest.cache.freshness?.quota?.status,
      "retained",
      "the capped quota series is retained between low-frequency refreshes",
    );
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
  insertUsage(indexFile, nowMs + 5 * 60_000);
  const due = await runner();
  assert.equal(due.accounting.refreshStatus, "rebuilt");
  assert.equal(due.accounting.fastPathFallbackCode, "calibration_due");
  assert.equal(rebuilds, 2, "a due calibration forces one real refit");

  nowMs += 10 * 60_000;
  insertUsage(indexFile, nowMs + 5 * 60_000);
  const afterRefit = await runner();
  assert.equal(afterRefit.accounting.refreshStatus, "fast_path");
  assert.equal(rebuilds, 2, "the refit restarts the fast-path interval");
});
