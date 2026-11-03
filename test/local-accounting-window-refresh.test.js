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
import { refreshAccountingWindowShadow } from "../src/local-accounting-window-refresh.js";
import {
  readLocalCollectorAccountingWindowCache,
  writeLocalCollectorAccountingWindowCache,
} from "../src/local-collector-state.js";

const KEY = "synthetic-window-key";
const END_MS = Date.parse("2026-09-02T00:00:00.000Z");

async function fullCache(indexFile, codexHome) {
  const generation = (await readLocalIndexCompanionProjection({
    indexFile, nowMs: END_MS,
  })).generation;
  return buildReplaySafeAccountingCache({
    sourceMode: "unified",
    expectedGeneration: generation,
    now: () => END_MS,
    codexHome,
    scan: createLocalIndexAccountingScan({ indexFile }),
    calibrationSource: localIndexCalibrationSource({ indexFile }),
    windowDays: 365,
  });
}

async function setup(t) {
  const workspace = createWorkspace({
    files: 2, events: 300, days: 35, fillerBytesPerEvent: 0,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  const stateFile = join(workspace.state, "collector.sqlite");
  const refresh = () => refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  await refresh();
  return { workspace, indexFile, stateFile, refresh };
}

test("a shadow refresh writes a matched cache and reuses it without a scan", async t => {
  const { workspace, indexFile, stateFile } = await setup(t);
  const full = await fullCache(indexFile, workspace.codexHome);
  const created = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  assert.equal(created.status, "created");
  assert.equal(created.periodsMatched, true);
  assert.equal(created.historyMatched, true);
  const stored = await readLocalCollectorAccountingWindowCache({ stateFile });
  assert.equal(stored.status, "available");
  assert.deepEqual(stored.cache.periods, full.periods);
  assert.deepEqual(stored.cache.history, full.history.period);
  assert.deepEqual(stored.cache.audit, {
    status: "matched", comparedAtMs: END_MS, periods: 4, history: true,
  });
  const unchanged = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchanged.receiptMode, "unchanged");
  assert.equal(unchanged.rebuiltDays, 0);
});

test("a new append updates only dirty days and still matches the shipping cache", async t => {
  const { workspace, indexFile, stateFile, refresh } = await setup(t);
  const first = await fullCache(indexFile, workspace.codexHome);
  await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: first.periods, expectedHistory: first.history.period,
    now: () => END_MS,
  });
  const { appendSyntheticCodexEvents } = await import("../src/synthetic-codex-rollout-corpus.js");
  appendSyntheticCodexEvents(workspace.receipt.sources.slice(0, 1), {
    seed: 51, events: 1, fillerBytesPerEvent: 0,
    atMs: Date.parse("2026-09-01T12:00:00.000Z"),
  });
  await refresh();
  const second = await fullCache(indexFile, workspace.codexHome);
  const updated = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: second.periods, expectedHistory: second.history.period,
    now: () => END_MS,
  });
  assert.equal(updated.status, "updated");
  assert.equal(updated.receiptMode, "incremental");
  assert.ok(updated.rebuiltDays >= 1);
  assert.equal(updated.periodsMatched, true);
  assert.equal(updated.historyMatched, true);
  const stored = await readLocalCollectorAccountingWindowCache({ stateFile });
  assert.deepEqual(stored.cache.periods, second.periods);
  assert.deepEqual(stored.cache.history, second.history.period);
});

test("a mismatch is reported and does not replace the last matched cache", async t => {
  const { workspace, indexFile, stateFile } = await setup(t);
  const full = await fullCache(indexFile, workspace.codexHome);
  await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  const before = await readLocalCollectorAccountingWindowCache({ stateFile });
  const tampered = structuredClone(full.periods);
  tampered[0].events += 1;
  const result = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: tampered, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  assert.equal(result.status, "mismatch");
  assert.equal(result.periodsMatched, false);
  assert.ok(Array.isArray(result.mismatchFields) && result.mismatchFields.length > 0);
  assert.ok(result.mismatchFields.every(field => typeof field === "string"));
  const after = await readLocalCollectorAccountingWindowCache({ stateFile });
  assert.deepEqual(after.cache, before.cache);
});

test("a foreground pass does not create a cache", async t => {
  const { workspace, indexFile, stateFile } = await setup(t);
  const result = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS, mode: "foreground",
  });
  assert.equal(result.status, "absent");
  const stored = await readLocalCollectorAccountingWindowCache({ stateFile });
  assert.equal(stored.status, "missing");
});

test("a full receipt scan with unchanged windows does not rebuild days", async t => {
  const { workspace, indexFile, stateFile } = await setup(t);
  const full = await fullCache(indexFile, workspace.codexHome);
  await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  const database = new DatabaseSync(indexFile);
  try {
    database.prepare("UPDATE store_state SET calculation_revision = calculation_revision + 1 WHERE id = 1").run();
  } finally {
    database.close();
  }
  const result = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    mode: "foreground", now: () => END_MS,
  });
  assert.equal(result.receiptMode, "full");
  assert.equal(result.rebuiltDays, 0);
  assert.equal(result.periodsMatched, true);
  assert.equal(result.status, "updated");
});

test("a tampered day snapshot is invalid before it can be folded", async t => {
  const { workspace, indexFile, stateFile } = await setup(t);
  const full = await fullCache(indexFile, workspace.codexHome);
  await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  const stored = await readLocalCollectorAccountingWindowCache({ stateFile });
  const tampered = structuredClone(stored.cache);
  tampered.days[0].snapshot.period.events += 1;
  await writeLocalCollectorAccountingWindowCache({ stateFile, cache: tampered });
  const result = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS, mode: "foreground",
  });
  assert.deepEqual({ status: result.status, reason: result.reason },
    { status: "invalid", reason: "cache_days_invalid" });
  const after = await readLocalCollectorAccountingWindowCache({ stateFile });
  assert.equal(after.cache.days[0].snapshot.period.events,
    tampered.days[0].snapshot.period.events);
});

test("a basis change defers a full shadow rebuild when it is not allowed", async t => {
  const { workspace, indexFile, stateFile } = await setup(t);
  const full = await fullCache(indexFile, workspace.codexHome);
  await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  const before = await readLocalCollectorAccountingWindowCache({ stateFile });
  const database = new DatabaseSync(indexFile);
  try {
    database.prepare("UPDATE meta SET value = 'synthetic-basis' WHERE key = 'rollup_basis'").run();
  } finally {
    database.close();
  }
  const result = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    mode: "foreground", now: () => END_MS,
  });
  assert.deepEqual({ status: result.status, reason: result.reason },
    { status: "deferred", reason: "basis_changed" });
  const after = await readLocalCollectorAccountingWindowCache({ stateFile });
  assert.deepEqual(after.cache, before.cache);
});

test("a maintenance pass recreates the cache under a new basis", async t => {
  const { workspace, indexFile, stateFile } = await setup(t);
  const full = await fullCache(indexFile, workspace.codexHome);
  await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  const before = await readLocalCollectorAccountingWindowCache({ stateFile });
  const database = new DatabaseSync(indexFile);
  try {
    database.prepare("UPDATE meta SET value = 'synthetic-basis' WHERE key = 'rollup_basis'").run();
  } finally {
    database.close();
  }
  const result = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    mode: "maintain",
    now: () => END_MS,
  });
  assert.equal(result.status, "updated");
  const after = await readLocalCollectorAccountingWindowCache({ stateFile });
  assert.notEqual(after.cache.basisFingerprint, before.cache.basisFingerprint);
  assert.deepEqual(after.cache.audit, {
    status: "source", comparedAtMs: END_MS, periods: 4, history: true,
  });
});

test("tampered receipts mark the shadow cache invalid without deleting it", async t => {
  const { workspace, indexFile, stateFile } = await setup(t);
  const full = await fullCache(indexFile, workspace.codexHome);
  const created = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS,
    expectedPeriods: full.periods, expectedHistory: full.history.period,
    now: () => END_MS,
  });
  assert.equal(created.status, "created");
  const stored = await readLocalCollectorAccountingWindowCache({ stateFile });
  const tampered = structuredClone(stored.cache);
  tampered.receipts.windows[0].factDigest = "0".repeat(64);
  await writeLocalCollectorAccountingWindowCache({ stateFile, cache: tampered });
  const result = await refreshAccountingWindowShadow({
    indexFile, stateFile, hmacKey: KEY, endMs: END_MS, mode: "foreground",
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "receipts_invalid");
  const after = await readLocalCollectorAccountingWindowCache({ stateFile });
  assert.deepEqual(after.cache.receipts.windows[0].factDigest, "0".repeat(64));
});
