import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createLocalIndexBackend } from "../src/local-index-backend.js";
import {
  describeLocalIndexGeneration,
  readLocalIndexGenerationDescriptor,
  readLocalIndexGenerationIdentity,
} from "../src/local-index-companion-source.js";
import { readLocalIndexReport } from "../src/local-index-report.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { rebuildRollups } from "../src/local-index-rollup.js";
import { openLocalIndexStore, withReadSnapshot } from "../src/local-index-store.js";
import { createWorkspace } from "./helpers/local-index-facts.js";

const NOW = Date.parse("2026-09-01T01:00:00.000Z");

async function fixture(t) {
  const workspace = createWorkspace({ variety: true, files: 3, events: 90, days: 8, seed: 71 });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "descriptor.sqlite");
  await refreshLocalIndex({ indexFile, codexHome: workspace.codexHome,
    secretFile: workspace.secretFile, workerCount: 1 });
  return { ...workspace, indexFile };
}

function write(indexFile, work) {
  const database = new DatabaseSync(indexFile);
  try { return work(database); } finally { database.close(); }
}

function fullDescriptor(indexFile, nowMs = NOW) {
  const database = openLocalIndexStore(indexFile, { readOnly: true });
  try {
    return withReadSnapshot(database, ({ commitSeq }) => describeLocalIndexGeneration(
      database, readLocalIndexReport(database, { nowMs }), commitSeq,
    ));
  } finally { database.close(); }
}

function equalDescriptor(indexFile, nowMs = NOW) {
  const actual = readLocalIndexGenerationDescriptor({ indexFile, nowMs });
  assert.deepEqual(actual, fullDescriptor(indexFile, nowMs));
  return actual;
}

// Commit from a second synthetic connection after BEGIN has pinned its first
// read, before the descriptor's other statements. Restore the hook even when
// the reader refuses or cancellation propagates.
function afterSnapshotPinned(work, read) {
  const prepare = DatabaseSync.prototype.prepare;
  let fired = false;
  DatabaseSync.prototype.prepare = function (sql, ...args) {
    const statement = Reflect.apply(prepare, this, [sql, ...args]);
    if (!fired && sql.replace(/\s+/gu, " ").trim()
        === "SELECT commit_seq FROM store_state WHERE id = 1") {
      const get = statement.get;
      statement.get = function (...parameters) {
        const row = Reflect.apply(get, this, parameters);
        if (!fired) { fired = true; work(); }
        return row;
      };
    }
    return statement;
  };
  try { return read(); }
  finally { DatabaseSync.prototype.prepare = prepare; assert.equal(fired, true); }
}

test("metadata-only descriptors equal full reports for complete, future, provisional and partial evidence", async t => {
  const f = await fixture(t);
  const complete = equalDescriptor(f.indexFile);
  assert.equal(complete.status, "complete");
  assert.equal(complete.toolProvenanceComplete, true);

  write(f.indexFile, database => {
    const events = database.prepare("SELECT event_key FROM usage_event ORDER BY observed_at_ms LIMIT 4").all();
    for (const [index, at] of [NOW + 300_000, NOW + 300_001, NOW - 90 * 86_400_000,
      NOW + 60 * 86_400_000].entries()) {
      database.prepare("UPDATE usage_event SET observed_at_ms=? WHERE event_key=?").run(at, events[index].event_key);
    }
    rebuildRollups(database);
  });
  for (const nowMs of [NOW, NOW + 1, NOW - 90 * 86_400_000, NOW + 60 * 86_400_000]) {
    equalDescriptor(f.indexFile, nowMs);
  }
  assert.equal(equalDescriptor(f.indexFile).coveredEndMs, NOW + 300_000);
  assert.equal(equalDescriptor(f.indexFile, NOW + 1).coveredEndMs, NOW + 300_001);

  write(f.indexFile, database => {
    database.exec("UPDATE source SET scanned_bytes=0 WHERE id=(SELECT MIN(id) FROM source)");
  });
  equalDescriptor(f.indexFile);
  write(f.indexFile, database => {
    database.exec(`INSERT INTO source_diagnostic(source_id,code,count)
      VALUES ((SELECT MIN(id) FROM source),'toolRecordsSkipped',1)
      ON CONFLICT(source_id,code) DO UPDATE SET count=1`);
  });
  const partialTools = equalDescriptor(f.indexFile);
  assert.equal(partialTools.status, "partial");
  assert.equal(partialTools.blockReason, "tool_provenance_incomplete");
  assert.equal(partialTools.toolFacts, 0);
  assert.equal(partialTools.toolProvenanceComplete, false);
  write(f.indexFile, database => {
    database.exec(`UPDATE source SET quarantine_code='codex_rollout_lineage_invalid'
      WHERE id=(SELECT MIN(id) FROM source)`);
  });
  const quarantined = equalDescriptor(f.indexFile);
  assert.equal(quarantined.status, "partial");
  assert.equal(quarantined.blockReason, "codex_rollout_sources_quarantined");
  assert.equal(quarantined.skippedSourceCount, 1);
  assert.equal(quarantined.issueCounts.codex_rollout_lineage_invalid.sourceCount, 1);

  write(f.indexFile, database => { database.exec("DELETE FROM usage_event"); rebuildRollups(database); });
  const empty = equalDescriptor(f.indexFile);
  assert.equal(empty.usageEvents, 0);
  assert.equal(empty.coveredStartMs, null);
  assert.equal(empty.coveredEndMs, null);
});

test("descriptors read no presentation quota series or report projections", async t => {
  const f = await fixture(t);
  const expected = equalDescriptor(f.indexFile);
  // This report-only table is absent only in the disposable synthetic store.
  // A descriptor still has all its required coverage, usage and tool evidence.
  write(f.indexFile, database => {
    database.exec("ALTER TABLE quota_observation RENAME TO unavailable_report_quota");
  });
  assert.deepEqual(readLocalIndexGenerationDescriptor({ indexFile: f.indexFile, nowMs: NOW }), expected);
  assert.throws(() => fullDescriptor(f.indexFile));
});

test("descriptor readers preserve null refusals, basis admission and cancellation", async t => {
  const f = await fixture(t);
  assert.equal(readLocalIndexGenerationDescriptor({ indexFile: join(f.state, "missing.sqlite"), nowMs: NOW }), null);
  assert.equal(readLocalIndexGenerationDescriptor({ indexFile: f.state, nowMs: NOW }), null);
  const neverCommitted = join(f.state, "empty.sqlite");
  openLocalIndexStore(neverCommitted, { create: true }).close();
  assert.equal(readLocalIndexGenerationDescriptor({ indexFile: neverCommitted, nowMs: NOW }), null);
  for (const options of [{ indexFile: "", nowMs: NOW }, { indexFile: f.indexFile, nowMs: NaN }]) {
    assert.throws(() => readLocalIndexGenerationDescriptor(options), TypeError);
  }
  const controller = new AbortController(); controller.abort();
  assert.throws(() => readLocalIndexGenerationDescriptor({ indexFile: f.indexFile,
    nowMs: NOW, signal: controller.signal }), { name: "AbortError" });
  const during = new AbortController();
  assert.throws(() => afterSnapshotPinned(() => during.abort(), () => readLocalIndexGenerationDescriptor({
    indexFile: f.indexFile, nowMs: NOW, signal: during.signal,
  })), { name: "AbortError" });
  assert.notEqual(readLocalIndexGenerationDescriptor({ indexFile: f.indexFile, nowMs: NOW }), null);
  write(f.indexFile, database => { database.exec("INSERT INTO rollup_context_start(start_tokens) VALUES(987654321)"); });
  assert.equal(readLocalIndexGenerationDescriptor({ indexFile: f.indexFile, nowMs: NOW }), null);
  assert.throws(() => fullDescriptor(f.indexFile), { code: "local_index_rollup_basis_stale" });
});

test("all descriptor fields remain on one pinned publication across a concurrent commit", async t => {
  const f = await fixture(t);
  const before = equalDescriptor(f.indexFile);
  const pinned = afterSnapshotPinned(() => write(f.indexFile, database => {
    database.exec(`BEGIN IMMEDIATE;
      UPDATE store_state SET commit_seq=commit_seq+1,calculation_revision=calculation_revision+1 WHERE id=1;
      UPDATE source SET quarantine_code='codex_rollout_lineage_invalid' WHERE id=(SELECT MIN(id) FROM source);
      COMMIT;`);
  }), () => readLocalIndexGenerationDescriptor({ indexFile: f.indexFile, nowMs: NOW }));
  assert.deepEqual(pinned, before);
  const after = equalDescriptor(f.indexFile);
  assert.equal(after.id, before.id + 1);
  assert.ok(after.calculationRevision > before.calculationRevision);
  assert.notEqual(after.fingerprint, before.fingerprint);
  assert.equal(after.skippedSourceCount, 1);
});

test("backend descriptor cache observes calculation revision changes without a new commit", async t => {
  const f = await fixture(t);
  const backend = createLocalIndexBackend({ indexFile: f.indexFile, secretFile: f.secretFile,
    now: () => NOW, maintenance: async () => ({ consistent: true }),
    refresh: async () => ({ status: "refreshed", unchanged: true, sources: 3 }),
  });
  t.after(() => backend.projectionReader.reader.close());
  const first = await backend.refreshUnifiedIndex({ codexHome: f.codexHome });
  assert.deepEqual(first.generation, readLocalIndexGenerationDescriptor({ indexFile: f.indexFile, nowMs: NOW }));
  const identity = readLocalIndexGenerationIdentity({ indexFile: f.indexFile });
  write(f.indexFile, database => {
    database.exec("UPDATE store_state SET calculation_revision=calculation_revision+1 WHERE id=1");
  });
  const changedIdentity = readLocalIndexGenerationIdentity({ indexFile: f.indexFile });
  assert.equal(changedIdentity.id, identity.id);
  assert.equal(changedIdentity.fingerprint, identity.fingerprint);
  assert.equal(changedIdentity.calculationRevision, identity.calculationRevision + 1);
  const second = await backend.refreshUnifiedIndex({ codexHome: f.codexHome });
  assert.equal(second.generation.id, first.generation.id);
  assert.equal(second.generation.fingerprint, first.generation.fingerprint);
  assert.equal(second.generation.calculationRevision, first.generation.calculationRevision + 1);
  assert.deepEqual(second.generation, readLocalIndexGenerationDescriptor({ indexFile: f.indexFile, nowMs: NOW }));
});
