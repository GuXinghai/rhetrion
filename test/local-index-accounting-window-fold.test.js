import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { createAccountingWindowReceipts } from "../src/local-index-accounting-windows.js";
import { createLocalIndexAccountingScan } from "../src/local-index-accounting-cache.js";
import { buildAccountingRollingPeriods } from "../src/local-index-accounting-window-fold.js";
import { buildReplaySafeAccountingPeriod } from "../src/replay-safe-accounting-cache.js";

const DAY = 86_400_000;

test("day accumulators fold exactly into non-aligned rolling periods", async t => {
  const workspace = createWorkspace({
    files: 2, events: 300, days: 35, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  const receipts = await createAccountingWindowReceipts({
    indexFile, hmacKey: "synthetic-window-key", now: () => Date.parse("2026-09-02T00:00:00.000Z"),
  });
  const scan = createLocalIndexAccountingScan({ indexFile });
  const days = new Map();
  for (const window of receipts.windows) {
    const built = await buildReplaySafeAccountingPeriod({
      id: "window", label: "UTC day",
      startAt: new Date(window.lowerMs).toISOString(),
      endAt: new Date(window.upperMs - 1).toISOString(),
      scan, includeAccumulator: true,
    });
    days.set(window.lowerMs, built.accumulator);
  }
  const endMs = receipts.windows.at(-1).lowerMs + 12 * 3_600_000;
  const folded = await buildAccountingRollingPeriods({
    indexFile, endMs, dayAccumulators: days, scan, includeHistory: true,
  });
  for (const [index, period] of folded.periods.entries()) {
    const startMs = period.id === "all" ? endMs - 365 * DAY
      : endMs - (period.id === "24h" ? DAY : period.id === "7d" ? 7 * DAY : 30 * DAY);
    const full = await buildReplaySafeAccountingPeriod({
      id: "window", label: "UTC day",
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      scan,
    });
    assert.deepEqual(period, { ...full.period, id: period.id, label: period.label },
      `period ${period.id}`);
  }
  const historyStart = receipts.windows[0].lowerMs;
  const fullHistory = await buildReplaySafeAccountingPeriod({
    id: "history", label: "Indexed history",
    startAt: new Date(historyStart).toISOString(),
    endAt: new Date(endMs).toISOString(),
    scan,
  });
  assert.deepEqual(folded.history, fullHistory.period);
});
