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
} from "../src/replay-safe-accounting-cache.js";
import { readLocalIndexCompanionProjection } from "../src/local-index-companion-source.js";
import { createAccountingWindowReceipts } from "../src/local-index-accounting-windows.js";
import { createAccountingWindowCache } from "../src/local-index-accounting-window-cache.js";

const KEY = "synthetic-window-key";
const END_MS = Date.parse("2026-09-01T00:00:00.000Z");

test("shadow window periods equal the shipping full accounting periods", async t => {
  const workspace = createWorkspace({
    files: 3, events: 600, days: 35, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  const database = new DatabaseSync(indexFile);
  try {
    const source = database.prepare(`SELECT s.id, s.scanned_bytes,
      (SELECT MIN(u.source_offset) FROM usage_event u WHERE u.source_id = s.id) AS first_offset
      FROM source s ORDER BY s.id LIMIT 1`).get();
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
      .run(offset, END_MS + 60_000, source.id);
  } finally {
    database.close();
  }
  const declaredSpeedBaselines = [{
    mode: "standard",
    firstSeenAt: new Date(END_MS - 20 * 86_400_000).toISOString(),
    lastSeenAt: new Date(END_MS - 86_400_000).toISOString(),
  }];
  const receipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, declaredSpeedBaselines, now: () => END_MS,
  });
  const windowCache = await createAccountingWindowCache({
    indexFile, receipts, hmacKey: KEY, endMs: END_MS,
    declaredSpeedBaselines, now: () => END_MS,
  });
  const generation = (await readLocalIndexCompanionProjection({
    indexFile, nowMs: END_MS,
  })).generation;
  const scan = createLocalIndexAccountingScan({ indexFile });
  const full = await buildReplaySafeAccountingCache({
    sourceMode: "unified",
    expectedGeneration: generation,
    now: () => END_MS,
    codexHome: workspace.codexHome,
    scan,
    calibrationSource: localIndexCalibrationSource({ indexFile }),
    windowDays: 365,
    declaredSpeedBaselines,
  });
  assert.deepEqual(windowCache.periods, full.periods);
  assert.deepEqual(windowCache.history, full.history.period);
});

test("a mid-day anchor folds exact edge fragments", async t => {
  const workspace = createWorkspace({
    files: 2, events: 300, days: 35, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  const midMs = Date.parse("2026-09-01T12:06:14.356Z");
  const declaredSpeedBaselines = [{
    mode: "standard",
    firstSeenAt: new Date(midMs - 20 * 86_400_000).toISOString(),
    lastSeenAt: new Date(midMs - 86_400_000).toISOString(),
  }];
  const receipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, declaredSpeedBaselines, now: () => midMs,
  });
  const windowCache = await createAccountingWindowCache({
    indexFile, receipts, hmacKey: KEY, endMs: midMs,
    declaredSpeedBaselines, now: () => midMs,
  });
  const generation = (await readLocalIndexCompanionProjection({
    indexFile, nowMs: midMs,
  })).generation;
  const full = await buildReplaySafeAccountingCache({
    sourceMode: "unified",
    expectedGeneration: generation,
    now: () => midMs,
    codexHome: workspace.codexHome,
    scan: createLocalIndexAccountingScan({ indexFile }),
    calibrationSource: localIndexCalibrationSource({ indexFile }),
    windowDays: 365,
    declaredSpeedBaselines,
  });
  assert.deepEqual(windowCache.periods, full.periods);
  assert.deepEqual(windowCache.history, full.history.period);
});
