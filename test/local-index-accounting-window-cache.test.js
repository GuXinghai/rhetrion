import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { appendSyntheticCodexEvents } from "../src/synthetic-codex-rollout-corpus.js";
import { createAccountingWindowReceipts } from "../src/local-index-accounting-windows.js";
import {
  accountingWindowCacheErrorReason,
  createAccountingWindowCache,
  updateAccountingWindowCache,
} from "../src/local-index-accounting-window-cache.js";
import { createLocalIndexAccountingScan } from "../src/local-index-accounting-cache.js";
import { buildReplaySafeAccountingPeriod } from "../src/replay-safe-accounting-cache.js";

const KEY = "synthetic-window-key";
const NOW = Date.parse("2026-09-02T00:00:00.000Z");
const DAY = 86_400_000;

test("window cache errors map to recoverable day reasons by owner", () => {
  const code = value => Object.assign(new Error(value), { code: value });
  assert.equal(
    accountingWindowCacheErrorReason(code("accounting_window_cache_day_missing")),
    "day_missing",
  );
  assert.equal(
    accountingWindowCacheErrorReason(
      code("accounting_window_cache_day_revision_mismatch"),
    ),
    "day_revision_mismatch",
  );
  assert.equal(
    accountingWindowCacheErrorReason(code("accounting_window_cache_invalid")),
    null,
  );
  assert.equal(accountingWindowCacheErrorReason(code("other_error")), null);
  assert.equal(accountingWindowCacheErrorReason(null), null);
});

async function setup(t) {
  const workspace = createWorkspace({
    files: 2, events: 300, days: 35, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  const refresh = () => refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  await refresh();
  const receipts = () => createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, now: () => NOW,
  });
  return { workspace, indexFile, refresh, receipts };
}

async function fullPeriods(indexFile) {
  const receipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, now: () => NOW,
  });
  const endMs = receipts.windows.at(-1).upperMs - 1;
  const scan = createLocalIndexAccountingScan({ indexFile });
  const periods = [];
  for (const [id, label, startMs] of [
    ["24h", "Last 24 hours", endMs - DAY],
    ["7d", "Last 7 days", endMs - 7 * DAY],
    ["30d", "Last 30 days", endMs - 30 * DAY],
    ["all", "Cached 365-day window", endMs - 365 * DAY],
  ]) {
    const built = await buildReplaySafeAccountingPeriod({
      id: "window", label: "UTC day",
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(), scan,
    });
    periods.push({ ...built.period, id, label });
  }
  const history = await buildReplaySafeAccountingPeriod({
    id: "history", label: "Indexed history",
    startAt: new Date(receipts.windows[0].lowerMs).toISOString(),
    endAt: new Date(endMs).toISOString(), scan,
  });
  return { periods, history: history.period, endMs };
}

test("initial window cache folds the same periods as a full scan", async t => {
  const { indexFile, receipts } = await setup(t);
  const inputs = await receipts();
  const endMs = inputs.windows.at(-1).upperMs - 1;
  const cache = await createAccountingWindowCache({
    indexFile, receipts: inputs, hmacKey: KEY, endMs, now: () => NOW,
  });
  const expected = await fullPeriods(indexFile);
  assert.deepEqual(cache.periods, expected.periods);
  assert.deepEqual(cache.history, expected.history);
  assert.deepEqual(JSON.parse(JSON.stringify(cache)), cache);
});

test("one appended day rebuilds only that day and still matches a full scan", async t => {
  const { workspace, indexFile, refresh, receipts } = await setup(t);
  const first = await receipts();
  const endMs = first.windows.at(-1).upperMs - 1;
  const initial = await createAccountingWindowCache({
    indexFile, receipts: first, hmacKey: KEY, endMs, now: () => NOW,
  });
  const target = first.windows.at(-1);
  appendSyntheticCodexEvents(workspace.receipt.sources.slice(0, 1), {
    seed: 31, events: 1, fillerBytesPerEvent: 0,
    atMs: target.lowerMs + 3_600_000,
  });
  await refresh();
  const second = await receipts();
  const updated = await updateAccountingWindowCache({
    previous: initial, indexFile, receipts: second, hmacKey: KEY, endMs, now: () => NOW,
  });
  assert.equal(updated.basisChanged, false);
  assert.deepEqual(updated.rebuiltKeys, [target.key]);
  assert.equal(updated.dirtyDays, 1);
  const expected = await fullPeriods(indexFile);
  assert.deepEqual(updated.cache.periods, expected.periods);
  assert.deepEqual(updated.cache.history, expected.history);
});

test("a manual repair range rebuilds overlapping days without a receipt change", async t => {
  const { indexFile, receipts } = await setup(t);
  const inputs = await receipts();
  const endMs = inputs.windows.at(-1).upperMs - 1;
  const initial = await createAccountingWindowCache({
    indexFile, receipts: inputs, hmacKey: KEY, endMs, now: () => NOW,
  });
  const target = inputs.windows.at(-2) ?? inputs.windows[0];
  const updated = await updateAccountingWindowCache({
    previous: initial,
    indexFile,
    receipts: inputs,
    hmacKey: KEY,
    endMs,
    repairFromMs: target.lowerMs,
    repairToMs: target.upperMs - 1,
    now: () => NOW,
  });
  assert.deepEqual(updated.repaired, [target.key]);
  assert.equal(updated.rebuiltKeys.includes(target.key), true);
  assert.equal(updated.dirtyDays, 1);
  assert.equal(updated.dirtyFromMs, target.lowerMs);
  assert.deepEqual(updated.cache.periods, initial.periods);
  assert.deepEqual(updated.cache.history, initial.history);
  await assert.rejects(
    updateAccountingWindowCache({
      previous: initial,
      indexFile,
      receipts: inputs,
      hmacKey: KEY,
      endMs,
      repairFromMs: target.upperMs,
      repairToMs: target.lowerMs,
      now: () => NOW,
    }),
    /repair range is invalid/u,
  );
});

test("a generation change during the build fails closed", async t => {
  const { indexFile, receipts } = await setup(t);
  const input = await receipts();
  const database = new DatabaseSync(indexFile);
  let committed = false;
  try {
    await assert.rejects(createAccountingWindowCache({
      indexFile, receipts: input, hmacKey: KEY, endMs: NOW,
      now: () => {
        if (!committed) {
          database.prepare(
            "UPDATE store_state SET calculation_revision = calculation_revision + 1 WHERE id = 1",
          ).run();
          committed = true;
        }
        return NOW;
      },
    }), { code: "accounting_window_cache_generation_changed" });
  } finally {
    database.close();
  }
});
