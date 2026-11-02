import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { appendSyntheticCodexEvents } from "../src/synthetic-codex-rollout-corpus.js";
import {
  compareAccountingWindowReceipts,
  createAccountingWindowReceipts,
} from "../src/local-index-accounting-windows.js";

const KEY = "synthetic-window-key";
const NOW = Date.parse("2026-09-02T00:00:00.000Z");

async function setup(t) {
  const workspace = createWorkspace({
    files: 1, events: 20, days: 5, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  const refresh = () => refreshLocalIndex({
    codexHome: workspace.codexHome,
    indexFile,
    secretFile: workspace.secretFile,
    workerCount: 1,
  });
  await refresh();
  return { workspace, indexFile, refresh };
}

function receipts(indexFile) {
  return createAccountingWindowReceipts({ indexFile, hmacKey: KEY, now: () => NOW });
}

function latestAccountingWindow(indexFile) {
  const database = new DatabaseSync(indexFile, { readOnly: true });
  try {
    const change = database.prepare("SELECT MAX(change_id) AS id FROM source_change").get();
    const row = database.prepare(`SELECT partition_kind, partition_key, lower_ms, upper_ms, status
      FROM impact_partition WHERE change_id = ? AND partition_kind = 'accounting_window'
      ORDER BY partition_key LIMIT 1`).get(change.id);
    return { changeId: change.id, row };
  } finally {
    database.close();
  }
}

test("an appended source event adds one accounting window and records its range", async t => {
  const { workspace, indexFile, refresh } = await setup(t);
  const before = await receipts(indexFile);
  const atMs = Date.parse("2026-09-02T12:00:00.000Z");
  appendSyntheticCodexEvents(workspace.receipt.sources.slice(0, 1), {
    seed: 11, events: 1, fillerBytesPerEvent: 0, atMs,
  });
  await refresh();
  const after = await receipts(indexFile);
  const changed = compareAccountingWindowReceipts(before, after, { hmacKey: KEY });
  const key = new Date(atMs).toISOString().slice(0, 10);
  assert.ok(changed.added.includes(key) || changed.changed.includes(key));
  const impact = latestAccountingWindow(indexFile);
  assert.ok(impact.row, "the refresh records an accounting_window impact");
  assert.equal(impact.row.partition_key, "current");
  assert.ok(impact.row.lower_ms <= atMs + 1_000 && impact.row.upper_ms >= atMs);
  assert.ok(["dirty", "pending"].includes(impact.row.status));
});

test("a second append in the same day changes the same window, not a new one", async t => {
  const { workspace, indexFile, refresh } = await setup(t);
  const atMs = Date.parse("2026-09-02T12:00:00.000Z");
  appendSyntheticCodexEvents(workspace.receipt.sources.slice(0, 1), {
    seed: 12, events: 1, fillerBytesPerEvent: 0, atMs,
  });
  await refresh();
  const before = await receipts(indexFile);
  appendSyntheticCodexEvents(workspace.receipt.sources.slice(0, 1), {
    seed: 13, events: 1, fillerBytesPerEvent: 0, atMs: atMs + 60_000,
  });
  await refresh();
  const after = await receipts(indexFile);
  const changed = compareAccountingWindowReceipts(before, after, { hmacKey: KEY });
  const key = new Date(atMs).toISOString().slice(0, 10);
  assert.deepEqual(changed.changed, [key]);
  assert.deepEqual(changed.added, []);
  const impact = latestAccountingWindow(indexFile);
  assert.ok(impact.row);
  assert.ok(impact.row.lower_ms <= atMs + 61_000 && impact.row.upper_ms >= atMs + 60_000);
});
