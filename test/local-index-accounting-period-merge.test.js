import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { createAccountingWindowReceipts } from "../src/local-index-accounting-windows.js";
import { createLocalIndexAccountingScan } from "../src/local-index-accounting-cache.js";
import {
  buildReplaySafeAccountingPeriod,
  createAccountingPeriodAccumulator,
  exportAccountingPeriodAccumulator,
  finalizeAccountingPeriodAccumulator,
  importAccountingPeriodAccumulator,
  mergeAccountingPeriodAccumulator,
} from "../src/replay-safe-accounting-cache.js";

test("day accumulators merge exactly into a range period", async t => {
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
  assert.ok(receipts.windows.length >= 2);
  const scan = createLocalIndexAccountingScan({ indexFile });
  const target = createAccountingPeriodAccumulator("range", "Range");
  for (const window of receipts.windows) {
    const built = await buildReplaySafeAccountingPeriod({
      id: "window", label: "UTC day",
      startAt: new Date(window.lowerMs).toISOString(),
      endAt: new Date(window.upperMs - 1).toISOString(),
      scan, includeAccumulator: true,
    });
    assert.ok(built.accumulator);
    mergeAccountingPeriodAccumulator(target, built.accumulator);
  }
  const merged = finalizeAccountingPeriodAccumulator(target);
  const first = receipts.windows[0];
  const last = receipts.windows.at(-1);
  const full = await buildReplaySafeAccountingPeriod({
    id: "range", label: "Range",
    startAt: new Date(first.lowerMs).toISOString(),
    endAt: new Date(last.upperMs - 1).toISOString(),
    scan,
  });
  assert.deepEqual(merged, full.period);
});

test("serialized day accumulators round-trip to the same merged range", async t => {
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
  const snapshots = [];
  for (const window of receipts.windows) {
    const built = await buildReplaySafeAccountingPeriod({
      id: "window", label: "UTC day",
      startAt: new Date(window.lowerMs).toISOString(),
      endAt: new Date(window.upperMs - 1).toISOString(),
      scan, includeAccumulator: true,
    });
    snapshots.push(exportAccountingPeriodAccumulator(built.accumulator));
  }
  assert.ok(JSON.stringify(snapshots).length > 0);
  const target = createAccountingPeriodAccumulator("range", "Range");
  for (const snapshot of snapshots) {
    mergeAccountingPeriodAccumulator(target, importAccountingPeriodAccumulator(snapshot));
  }
  const merged = finalizeAccountingPeriodAccumulator(target);
  const first = receipts.windows[0];
  const last = receipts.windows.at(-1);
  const full = await buildReplaySafeAccountingPeriod({
    id: "range", label: "Range",
    startAt: new Date(first.lowerMs).toISOString(),
    endAt: new Date(last.upperMs - 1).toISOString(),
    scan,
  });
  assert.deepEqual(merged, full.period);
});

test("serialized accumulator import rejects prototype keys", () => {
  const snapshot = exportAccountingPeriodAccumulator(
    createAccountingPeriodAccumulator("range", "Range"),
  );
  snapshot.period.componentCosts = JSON.parse(
    '{"__proto__":{"polluted":true}}',
  );
  assert.throws(() => importAccountingPeriodAccumulator(snapshot), {
    code: "accounting_period_snapshot_invalid",
  });
  assert.equal({}.polluted, undefined);
});

test("a period past the price-card provenance bound fails with its own code", () => {
  const period = createAccountingPeriodAccumulator("range", "Range");
  period.priceCardIds.push(...Array.from(
    { length: 257 },
    (_, index) => `synthetic-card-${String(index).padStart(3, "0")}`,
  ));
  assert.throws(
    () => finalizeAccountingPeriodAccumulator(period),
    error => error.code === "accounting_price_card_provenance_limit",
  );
});
