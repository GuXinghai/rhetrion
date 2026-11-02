import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { rebuildRollups } from "../src/local-index-rollup.js";
import {
  compareAccountingWindowReceipts,
  createAccountingWindowReceipts,
} from "../src/local-index-accounting-windows.js";
import { buildAccountingWindowRows } from "../src/local-index-accounting-window-rows.js";

const KEY = "synthetic-window-key";
const NOW = Date.parse("2026-09-02T00:00:00.000Z");

async function fixture(t) {
  const workspace = createWorkspace({
    files: 3, events: 300, days: 35, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome,
    indexFile,
    secretFile: workspace.secretFile,
    workerCount: 1,
  });
  const receipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, now: () => NOW,
  });
  assert.ok(receipts.windows.length >= 2);
  return { workspace, indexFile, keys: receipts.windows.slice(0, 2).map(window => window.key) };
}

test("derived window rows are deterministic and carry an output digest", async t => {
  const { indexFile, keys } = await fixture(t);
  const first = await buildAccountingWindowRows({
    indexFile, windowKeys: keys, hmacKey: KEY, now: () => NOW, includePeriod: true,
  });
  const second = await buildAccountingWindowRows({
    indexFile, windowKeys: [...keys].reverse(), hmacKey: KEY, now: () => NOW, includePeriod: true,
  });
  assert.deepEqual(first, second);
  assert.equal(first.rows.length, 2);
  for (const row of first.rows) {
    assert.match(row.rowDigest, /^[a-f0-9]{64}$/u);
    assert.equal(row.upperMs - row.lowerMs, 86_400_000);
    assert.equal(typeof row.period?.apiPriceEquivalentUsd, "number");
    assert.ok(row.period.events >= 0);
  }
});

test("only the changed day's derived row digest moves", async t => {
  const { indexFile, keys } = await fixture(t);
  const before = await buildAccountingWindowRows({
    indexFile, windowKeys: keys, hmacKey: KEY, now: () => NOW,
  });
  const database = new DatabaseSync(indexFile);
  try {
    const target = database.prepare(`SELECT source_id, source_offset FROM usage_event
      WHERE observed_at_ms >= ? AND observed_at_ms < ?
      ORDER BY observed_at_ms, source_id, source_offset LIMIT 1`)
      .get(Date.parse(`${keys[0]}T00:00:00.000Z`), Date.parse(`${keys[0]}T00:00:00.000Z`) + 86_400_000);
    database.prepare(`UPDATE usage_event SET tokens_out_text = COALESCE(tokens_out_text, 0) + 1
      WHERE source_id = ? AND source_offset = ?`).run(target.source_id, target.source_offset);
    // Production never rewrites token evidence directly; when a correction
    // does, the owned rollup rebuild keeps the grouped read path in step.
    rebuildRollups(database);
  } finally {
    database.close();
  }
  const after = await buildAccountingWindowRows({
    indexFile, windowKeys: keys, hmacKey: KEY, now: () => NOW,
  });
  const changed = new Set(after.rows
    .filter((row, index) => row.rowDigest !== before.rows[index].rowDigest)
    .map(row => row.key));
  assert.deepEqual([...changed], [keys[0]]);
});

test("window rows require a key and a bounded unique key set", async t => {
  const { indexFile, keys } = await fixture(t);
  await assert.rejects(buildAccountingWindowRows({ indexFile, windowKeys: keys }), {
    name: "TypeError",
  });
  await assert.rejects(buildAccountingWindowRows({
    indexFile, windowKeys: [], hmacKey: KEY,
  }), { name: "TypeError" });
  await assert.rejects(buildAccountingWindowRows({
    indexFile, windowKeys: [keys[0], keys[0]], hmacKey: KEY,
  }), { name: "TypeError" });
  await assert.rejects(buildAccountingWindowRows({
    indexFile, windowKeys: ["2026-02-30"], hmacKey: KEY,
  }), { name: "TypeError" });
});

test("a zero-token committed row dirties the receipt but not the period", async t => {
  const { indexFile, keys } = await fixture(t);
  const beforeReceipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, now: () => NOW,
  });
  const before = await buildAccountingWindowRows({
    indexFile, windowKeys: [keys[0]], hmacKey: KEY, now: () => NOW, includePeriod: true,
  });
  const database = new DatabaseSync(indexFile);
  try {
    const source = database.prepare(`SELECT s.id, s.scanned_bytes,
      (SELECT MIN(u.source_offset) FROM usage_event u WHERE u.source_id = s.id) AS first_offset
      FROM source s ORDER BY s.id LIMIT 1`).get();
    database.prepare(`INSERT INTO usage_event(source_id, source_offset,
      observed_at_ms, event_key, session_id, account_scope_id, model_id, tier_id,
      surface_id, quota_observation_id, tier_observed_at_ms, reasoning_effort,
      flags, work_directory_id, tokens_in_uncached, tokens_in_cache_read,
      tokens_in_cache_write, tokens_out_text, tokens_out_reasoning,
      tokens_out_combined, total_input_context)
      SELECT source_id, ?, ?, randomblob(32), session_id, account_scope_id,
        model_id, tier_id, surface_id, quota_observation_id, tier_observed_at_ms,
        reasoning_effort, 0, work_directory_id, 0, 0, 0, 0, 0, 0, 0
      FROM usage_event WHERE source_id = ?
      ORDER BY source_offset DESC LIMIT 1`)
      .run(Number(source.first_offset) - 1,
        Date.parse(`${keys[0]}T12:00:00.000Z`), source.id);
  } finally {
    database.close();
  }
  const afterReceipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, now: () => NOW,
  });
  const comparison = compareAccountingWindowReceipts(
    beforeReceipts, afterReceipts, { hmacKey: KEY },
  );
  assert.equal(comparison.basisChanged, false);
  assert.deepEqual(comparison.changed, [keys[0]]);
  const after = await buildAccountingWindowRows({
    indexFile, windowKeys: [keys[0]], hmacKey: KEY, now: () => NOW, includePeriod: true,
  });
  assert.deepEqual(after.rows[0].period, before.rows[0].period);
  assert.equal(after.rows[0].rowDigest, before.rows[0].rowDigest);
});
