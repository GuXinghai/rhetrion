import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { rebuildRollups } from "../src/local-index-rollup.js";
import { createAccountingWindowReceipts } from "../src/local-index-accounting-windows.js";
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
