import test from "node:test";
import assert from "node:assert/strict";
import { createCachedLocalUnifiedProjectionReader, selectSharedWorkUsageSnapshot } from "./server.js";
import { createWorkUsageService } from "../../src/application/work-usage.js";
import { WORK_USAGE_SCHEMA } from "../../src/reporting/index.js";

const generation = `generation-v2-${"a".repeat(64)}`;
function workProjection(nowMs, metadata = {}) {
  return { status: "available", asOfMs: nowMs, periods: Object.fromEntries(
    [["24h", 86400000], ["7d", 7 * 86400000], ["30d", 30 * 86400000], ["all", null]].map(([id, duration]) => [id, {
      fromMs: duration === null ? 0 : Math.max(0, nowMs - duration), toMs: nowMs,
      scopes: [{ id: "account-a", status: "available" }, { id: "unknown", status: "unavailable" }],
      snapshots: Object.fromEntries(["account-a", "unknown"].map(scope => [scope, {
        status: "available", scope, scopes: [], cells: [], models: [], threadLookup: {}, metadata: { ...metadata },
        generation: { status: "complete", id: 1, commitSeq: 1, usageProvenanceComplete: true },
      }])),
    }]),
  ) };
}
function latch() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function settle(service, query) {
  const pending = await service.query({ schemaVersion: WORK_USAGE_SCHEMA, ...query });
  await new Promise(resolve => setImmediate(resolve));
  return service.query({ schemaVersion: WORK_USAGE_SCHEMA, period: query.period,
    snapshotId: pending.refreshSnapshotId ?? pending.snapshotId });
}

test("work selection preserves period, scope, time bounds and bounded failure codes", () => {
  const work = workProjection(100);
  for (const period of ["24h", "7d", "30d", "all"]) {
    for (const scope of ["account-a", "unknown"]) {
      const value = selectSharedWorkUsageSnapshot(work, { period, scope });
      assert.equal(value.toMs, 100);
      assert.equal(value.scope, scope);
      assert.equal(Object.hasOwn(value, "companion"), false);
    }
  }
  assert.equal(selectSharedWorkUsageSnapshot(work, { period: "all" }).scope, "unknown");
  assert.throws(() => selectSharedWorkUsageSnapshot(work, { period: "all", scope: "other" }),
    { code: "work_usage_scope_unavailable" });
  assert.throws(() => selectSharedWorkUsageSnapshot({ status: "unavailable", errorCode: "work_usage_capacity_exceeded" },
    { period: "all" }), { code: "work_usage_capacity_exceeded" });
});

test("companion subscribers share builds while individual cancellation preserves the remaining reader", async () => {
  let gate = latch(), reads = 0, buildSignal;
  const reader = createCachedLocalUnifiedProjectionReader({
    reader: async (o, controls) => {
      reads++; buildSignal = controls.signal; await gate.promise;
      return { status: "available", generation: { fingerprint: generation }, marker: reads };
    },
    readGeneration: async () => generation, validUntil: async o => o.nowMs + 100,
  });
  const options = nowMs => ({ mode: "full", indexFile: "synthetic-index", nowMs });
  try {
    const controller = new AbortController();
    const a = reader(options(100), { signal: controller.signal });
    const b = reader(options(100));
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(a, { code: "local_unified_companion_projection_aborted" });
    assert.equal(buildSignal.aborted, false);
    gate.resolve(); await b;
    assert.equal(reads, 1);
    gate = latch();
    const last = new AbortController();
    const c = reader(options(200), { signal: last.signal });
    await new Promise(resolve => setImmediate(resolve));
    last.abort();
    await assert.rejects(c, { code: "local_unified_companion_projection_aborted" });
    assert.equal(buildSignal.aborted, true);
    gate.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal((await reader(options(201))).marker, 3);
  } finally { gate.resolve(); await reader.close(); }
});

test("closing a companion reader during deferred generation lookup prevents a subsequent build", async () => {
  let releaseGeneration, calls = 0, closes = 0;
  const implementation = async () => { calls++; return { status: "available", generation: { fingerprint: generation } }; };
  implementation.close = async () => { closes++; };
  const reader = createCachedLocalUnifiedProjectionReader({ reader: implementation,
    readGeneration: () => new Promise(resolve => { releaseGeneration = resolve; }),
    validUntil: async () => Infinity });
  await reader({ mode: "full", indexFile: "synthetic-index", nowMs: 1 });
  const pending = reader({ mode: "deferred", indexFile: "synthetic-index", nowMs: 2 });
  await reader.close(); releaseGeneration(generation);
  await assert.rejects(pending, { code: "local_unified_companion_projection_aborted" });
  await assert.rejects(reader({ mode: "deferred" }), { code: "local_unified_companion_projection_aborted" });
  await reader.close();
  assert.equal(calls, 1); assert.equal(closes, 1);
});

test("the work service shares pending queries and cancellation aborts the owned build", async () => {
  const builds = [];
  const service = createWorkUsageService({ clock: () => 1000,
    build: (query, { signal }) => new Promise(resolve => builds.push({ query, signal, resolve })),
  });
  const query = { schemaVersion: WORK_USAGE_SCHEMA, period: "all" };
  try {
    const first = await service.query(query), second = await service.query(query);
    assert.equal(first.snapshotId, second.snapshotId); assert.equal(builds.length, 1);
    await service.query({ ...query, snapshotId: first.snapshotId, action: "cancel" });
    assert.equal(builds[0].signal.aborted, true);
    const next = await service.query(query);
    assert.notEqual(next.snapshotId, first.snapshotId); assert.equal(builds.length, 2);
    builds[0].resolve(selectSharedWorkUsageSnapshot(workProjection(1000), query));
    builds[1].resolve(selectSharedWorkUsageSnapshot(workProjection(1000), query));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await service.query({ ...query, snapshotId: next.snapshotId })).status, "available");
    await assert.rejects(service.query({ ...query, snapshotId: first.snapshotId }), { code: "work_usage_snapshot_expired" });
  } finally { await service.close(); }
  assert.equal(builds[1].signal.aborted, true);
});

test("identical exact reporting ends share the real work service's pending build", async () => {
  const builds = [];
  const service = createWorkUsageService({ clock: () => 1000,
    build: query => new Promise(resolve => builds.push({ query, resolve })),
  });
  const request = { schemaVersion: WORK_USAGE_SCHEMA, period: "all", endAt: new Date(900).toISOString() };
  try {
    const [first, second] = await Promise.all([service.query(request), service.query(request)]);
    assert.equal(first.status, "preparing"); assert.equal(second.status, "preparing");
    assert.equal(first.snapshotId, second.snapshotId);
    assert.equal(builds.length, 1);
    assert.equal(builds[0].query.exactWindow, true); assert.equal(builds[0].query.toMs, 900);
    builds[0].resolve(selectSharedWorkUsageSnapshot(workProjection(900), builds[0].query));
    await new Promise(resolve => setImmediate(resolve));
    const result = await service.query({ ...request, snapshotId: first.snapshotId });
    assert.equal(result.status, "available"); assert.equal(result.toMs, 900);
    assert.equal(result.snapshotId, second.snapshotId); assert.equal(builds.length, 1);
  } finally { await service.close(); }
});

test("new work reports reread external metadata even at the same exact reporting instant", async () => {
  let reads = 0, metadata = { project: "synthetic-a", autoReview: false };
  const service = createWorkUsageService({ clock: () => 1000,
    build: async query => { reads++; return selectSharedWorkUsageSnapshot(workProjection(query.toMs, metadata), query); },
  });
  try {
    const request = { period: "all", endAt: new Date(900).toISOString() };
    const first = await settle(service, request);
    assert.equal(first.toMs, 900); assert.equal(first.metadata.autoReview, false);
    metadata = { project: "synthetic-b", autoReview: true };
    const second = await settle(service, request);
    assert.equal(second.toMs, 900); assert.deepEqual(second.metadata, metadata);
    assert.equal(reads, 2); assert.notEqual(first.snapshotId, second.snapshotId);
    assert.equal((await service.query({ schemaVersion: WORK_USAGE_SCHEMA, period: "all", snapshotId: first.snapshotId })).metadata.autoReview, false);
  } finally { await service.close(); }
});

test("temporary work failure is retried through the work service", async () => {
  let reads = 0;
  const service = createWorkUsageService({ clock: () => 1000, build: async query => {
    if (++reads === 1) return selectSharedWorkUsageSnapshot({ status: "unavailable", errorCode: "work_usage_capacity_exceeded" }, query);
    return selectSharedWorkUsageSnapshot(workProjection(query.toMs), query);
  } });
  try {
    const first = await settle(service, { period: "all" });
    assert.equal(first.status, "unavailable"); assert.equal(first.errorCode, "work_usage_capacity_exceeded");
    assert.equal((await settle(service, { period: "all" })).status, "available");
    assert.equal(reads, 2);
  } finally { await service.close(); }
});

test("related periods rebuild independently while preserving the selected snapshot anchor", async () => {
  let now = 40 * 86400000, reads = 0;
  const service = createWorkUsageService({ clock: () => now, build: async query => {
    reads++; now += 60000; return selectSharedWorkUsageSnapshot(workProjection(query.toMs), query);
  } });
  try {
    const selected = await settle(service, { period: "7d" });
    let previous = null;
    for (const period of ["24h", "30d", "all"]) {
      const related = await settle(service, { period, sourceSnapshotId: selected.snapshotId });
      assert.equal(related.status, "available"); assert.equal(related.toMs, selected.toMs);
      assert.equal((await service.query({ schemaVersion: WORK_USAGE_SCHEMA, period: "7d", snapshotId: selected.snapshotId })).status, "available");
      if (previous) await assert.rejects(service.query({ schemaVersion: WORK_USAGE_SCHEMA, period: previous.period, snapshotId: previous.id }),
        { code: "work_usage_snapshot_expired" });
      previous = { period, id: related.snapshotId };
    }
    assert.equal(reads, 4);
    const fresh = await settle(service, { period: "7d" });
    assert.ok(fresh.toMs > selected.toMs); assert.equal(reads, 5);
  } finally { await service.close(); }
});
