import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createWorkUsageService } from "../src/application/index.js";
import { createLocalIndexBackend } from "../src/local-index-backend.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { WORK_USAGE_SCHEMA } from "../src/reporting/index.js";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { validateWorkUsageResponse } from "../apps/web/public/work-usage-view.js";

const NOW = Date.parse("2026-09-01T01:00:00.000Z");
const base = { schemaVersion: WORK_USAGE_SCHEMA, period: "7d" };

async function settle(service, query, settled) {
  const pending = await service.query(query);
  if (pending.status === "preparing") await settled();
  const { sourceSnapshotId, ...pinned } = query;
  return service.query({ ...pinned, snapshotId: pending.snapshotId });
}

test("related periods accept fresh equal generations from the real work backend and reject a later commit", async t => {
  const workspace = createWorkspace({ variety: true, files: 2, events: 60, days: 8, seed: 71 });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "work-generation.sqlite");
  await refreshLocalIndex({ indexFile, codexHome: workspace.codexHome,
    secretFile: workspace.secretFile, workerCount: 1 });
  const backend = createLocalIndexBackend({ indexFile, secretFile: workspace.secretFile });
  t.after(() => backend.projectionReader.reader.close());
  const generations = [];
  let resolveSettled, builds = 0;
  let settlement;
  const service = createWorkUsageService({ clock: () => NOW,
    onSettled: status => { if (status === "ready" || status === "failed") resolveSettled(); },
    build: async (query, controls) => {
      builds++;
      const work = await backend.readWorkUsage({ nowMs: query.toMs,
        codexHome: workspace.codexHome }, controls);
      assert.equal(work.status, "available");
      const period = work.periods[query.period];
      const scope = period.scopes.find(item => item.status === "unavailable")?.id
        ?? period.scopes[0]?.id ?? "scope-0";
      const snapshot = period.snapshots[scope];
      assert.ok(snapshot, "period has its selected scope snapshot");
      generations.push(snapshot.generation);
      return { ...snapshot, fromMs: period.fromMs, toMs: period.toMs };
    },
  });
  t.after(() => service.close());
  const read = query => {
    settlement = new Promise(resolve => { resolveSettled = resolve; });
    return settle(service, query, () => settlement);
  };
  const source = await read(base);
  assert.equal(source.status, "available");
  assert.equal(validateWorkUsageResponse(source), source);
  for (const period of ["24h", "30d", "all"]) {
    const related = await read({ ...base, period, sourceSnapshotId: source.snapshotId });
    assert.equal(related.status, "available", related.errorCode);
    assert.deepEqual(related.generation, source.generation);
    assert.equal(related.toMs, source.toMs);
    if (period === "24h") assert.equal(related.rowCount, 0, "exercise the empty-interval fallback");
    assert.equal(validateWorkUsageResponse(related), related);
    assert.equal(related.metadata.status, source.metadata.status, "empty intervals preserve metadata uncertainty");
  }
  assert.equal(builds, 4, "one build per requested period, no restart loop");
  assert.notEqual(generations[0], generations[1], "different reads return different object references");
  const writer = new DatabaseSync(indexFile);
  try { writer.exec("UPDATE store_state SET commit_seq=commit_seq+1,calculation_revision=calculation_revision+1 WHERE id=1"); }
  finally { writer.close(); }
  const changed = await read({ ...base, period: "24h", sourceSnapshotId: source.snapshotId });
  assert.equal(changed.status, "unavailable");
  assert.equal(changed.errorCode, "work_usage_snapshot_changed");
});
