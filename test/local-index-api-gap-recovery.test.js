import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { createLocalIndexWriter, openLocalIndexStore, LOCAL_INDEX_PARSER_VERSION } from "../src/local-index-store.js";
import { readLocalIndexWorkload } from "../src/local-index-workload.js";
import { readLocalIndexWorkUsage } from "../src/local-index-work-usage.js";
import { localCodexLogScanner } from "../src/local-node-runtime.js";

const at = Date.parse("2026-09-01T00:00:00Z");
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const line = (type, payload) => JSON.stringify({ timestamp: new Date(at + 1000).toISOString(), type, payload }) + "\n";
function source(id, classification = "subscription") {
  const raw = { input_tokens: 100, cached_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: 110 };
  return line("session_meta", { id, ...(classification === "unknown" ? {} : {
    model_provider: classification === "api" ? "synthetic-relay" : "openai",
  }) }) + line("turn_context", { model: "gpt-6.1-sol" })
    + line("event_msg", { type: "token_count", info: { last_token_usage: raw, total_token_usage: raw } });
}

async function fixture(t, { retired = false, classification = "api", queued = false } = {}) {
  const w = createWorkspace({ files: 1, events: 1, forkFraction: 0 });
  t.after(() => w.cleanup());
  const home = join(w.root, "gap-codex"), directory = join(home, "sessions");
  await mkdir(directory, { recursive: true });
  const paths = ids.map(id => join(directory, `rollout-2026-09-01T00-00-00-${id}.jsonl`));
  for (let i = 0; i < paths.length; i++) await writeFile(paths[i], source(ids[i]));
  const indexFile = join(w.state, "gaps.sqlite");
  const options = { codexHome: home, indexFile, secretFile: w.secretFile, workerCount: 1, now: () => at + 60_000 };
  await refreshLocalIndex(options);
  // Rehearse a retained pre-v23 source, whose API declaration the old parser
  // accepted, and its committed quarantine gap. No legacy parser is restored.
  await writeFile(paths[0], source(ids[0], classification));
  const db = openLocalIndexStore(indexFile), writer = createLocalIndexWriter(db);
  let sourceId;
  try {
    const row = db.prepare("SELECT * FROM source WHERE path=?").get(paths[0]);
    sourceId = Number(row.id);
    writer.begin();
    writer.deleteSourceFacts(sourceId);
    db.prepare(`UPDATE source SET scanned_bytes=0,lineage_json=NULL,presence=?,quarantine_code=?,parser_version=?
      WHERE id=?`).run(retired ? "absent" : "present", retired ? null : "codex_rollout_lineage_invalid",
      retired ? LOCAL_INDEX_PARSER_VERSION : "local-index-rollout-typed-v3+unified-rollout-typed-v22", sourceId);
    const change = { sourceId, oldFileId: row.file_id, newFileId: row.file_id,
      oldScannedBytes: row.size_bytes, newScannedBytes: 0, oldSizeBytes: row.size_bytes, newSizeBytes: row.size_bytes,
      oldEventCount: 1, newEventCount: 0, confidence: "bounded", factCounts: [], partitions: [], createdAtMs: at };
    writer.recordSourceChange({ ...change, mode: "quarantine_gap", reason: "codex_rollout_lineage_invalid",
      gaps: [{ byteStart: 0, byteEnd: row.size_bytes, eventLowerMs: null, eventUpperMs: null,
        reason: "codex_rollout_lineage_invalid", confidence: "bounded", createdAtMs: at }] });
    if (retired) writer.recordSourceChange({ ...change, mode: "fact_correction", reason: null,
      oldScannedBytes: 0, oldEventCount: 0, gaps: [], createdAtMs: at + 1 });
    writer.commit({ kind: "refresh", sourcesChanged: 1 });
    if (queued) db.prepare("UPDATE integrity_gap SET repair_status='queued' WHERE source_id=?").run(sourceId);
  } finally { db.close(); }
  const inspect = work => {
    const database = openLocalIndexStore(indexFile, { readOnly: true });
    try { return work(database); } finally { database.close(); }
  };
  const snapshot = () => inspect(database => ({
    state: { ...database.prepare("SELECT * FROM store_state").get() },
    source: { ...database.prepare("SELECT * FROM source WHERE id=?").get(sourceId) },
    gaps: database.prepare("SELECT * FROM integrity_gap ORDER BY gap_id").all().map(row => ({ ...row })),
    changes: database.prepare("SELECT * FROM source_change ORDER BY change_id").all().map(row => ({ ...row })),
    usage: database.prepare("SELECT hex(event_key) AS key,* FROM usage_event ORDER BY event_key").all(),
  }));
  const workload = () => readLocalIndexWorkload({ indexFile, nowMs: at + 60_000, liveSinceMs: at, sourceFresh: true });
  const workGeneration = async () => {
    const database = openLocalIndexStore(indexFile, { readOnly: true });
    try {
      const value = await readLocalIndexWorkUsage({ database, indexFile, codexHome: home,
        secretFile: w.secretFile, nowMs: at + 60_000,
        intervals: [{ id: "probe", fromMs: at, toMs: at + 60_000 }] });
      return Object.values(value.periods.probe.snapshots)[0].generation;
    } finally { database.close(); }
  };
  return { ...w, options, paths, indexFile, sourceId, inspect, snapshot, workload, workGeneration };
}

for (const retired of [false, true]) test(`an authenticated API gap is superseded with prior retirement=${retired}`, async t => {
  const f = await fixture(t, { retired, queued: retired });
  const before = f.snapshot(), sourceBytes = await readFile(f.paths[0]);
  assert.ok(f.workload().errors.some(error => error.code === "integrity_gap"));
  assert.equal((await f.workGeneration()).usageProvenanceComplete, false);
  const result = await refreshLocalIndex(f.options), after = f.snapshot();
  assert.equal(result.unchanged, false);
  assert.equal(after.source.presence, "absent");
  assert.equal(after.source.scanned_bytes, 0);
  assert.equal(after.source.quarantine_code, null);
  assert.deepEqual(after.usage, before.usage, "subscription facts remain exact");
  assert.equal(after.usage.length, 1);
  assert.deepEqual(after.gaps, before.gaps.map(gap => ({ ...gap, repair_status: "superseded" })),
    "the gap and its original provenance are retained");
  assert.deepEqual(await readFile(f.paths[0]), sourceBytes);
  assert.ok(!f.workload().errors.some(error => error.code === "integrity_gap"));
  assert.equal((await f.workGeneration()).status, "complete");
  assert.equal((await f.workGeneration()).usageProvenanceComplete, true);
  f.inspect(db => assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM impact_partition p
    JOIN source_change c ON c.change_id=p.change_id WHERE c.source_id=? AND c.mode='fact_correction'
      AND p.partition_kind='coverage'`).get(f.sourceId).n, 1));
  // Each refresh reopens the store; no process-local remembered classification
  // is needed, and an API append cannot create another publication.
  for (let run = 0; run < 2; run++) {
    assert.equal((await refreshLocalIndex(f.options)).unchanged, true);
    assert.deepEqual(f.snapshot(), after);
  }
  await appendFile(f.paths[0], line("synthetic_noop", {}));
  const restarted = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { refreshLocalIndex } from ${JSON.stringify(new URL("../src/local-index-refresh.js", import.meta.url).href)};
      const options=JSON.parse(process.argv[1]);
      const result=await refreshLocalIndex({...options,now:()=>options.nowMs});
      if(!result.unchanged)process.exitCode=2;`,
    JSON.stringify({ ...f.options, nowMs: at + 60_000 }),
  ], { env: process.env, windowsHide: true, timeout: 30_000, stdio: "ignore" });
  assert.equal(restarted.status, 0, "a fresh process must leave the corrected generation unchanged");
  assert.deepEqual(f.snapshot(), after);
});

for (const classification of ["subscription", "unknown"]) test(`an absent ${classification} gap remains unknown`, async t => {
  const f = await fixture(t, { classification, retired: true });
  await rm(f.paths[0]);
  const before = f.snapshot();
  await refreshLocalIndex(f.options);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.snapshot().gaps[0].repair_status, "open");
  assert.ok(f.workload().errors.some(error => error.code === "integrity_gap"));
  assert.equal((await f.workGeneration()).usageProvenanceComplete, false);
});

for (const damage of ["missing_provenance", "unknown_extent", "different_identity", "later_replacement"]) {
  test(`an API declaration cannot supersede a gap with ${damage}`, async t => {
    const f = await fixture(t, { retired: true });
    const db = openLocalIndexStore(f.indexFile);
    try {
      if (damage === "missing_provenance") db.exec("DELETE FROM source_change WHERE mode='quarantine_gap'");
      if (damage === "unknown_extent") db.exec("UPDATE integrity_gap SET byte_end=NULL");
      if (damage === "different_identity") db.exec("UPDATE source_change SET old_file_id='1:999' WHERE mode='quarantine_gap'");
      if (damage === "later_replacement") db.exec("UPDATE source_change SET new_file_id='1:999' WHERE mode='fact_correction'");
    } finally { db.close(); }
    const before = f.snapshot();
    assert.equal((await refreshLocalIndex(f.options)).unchanged, true);
    assert.deepEqual(f.snapshot(), before);
    assert.ok(f.workload().errors.some(error => error.code === "integrity_gap"));
  });
}

test("a stale API discovery cannot resolve a gap from a changed source", async t => {
  const f = await fixture(t, { retired: true }), before = f.snapshot();
  await assert.rejects(refreshLocalIndex({ ...f.options, discover: async options => {
    const infos = await localCodexLogScanner.discoverCodexRolloutInfos(options);
    await writeFile(f.paths[0], source(ids[0]));
    return infos;
  } }), { code: "codex_rollout_source_changed" });
  assert.deepEqual(f.snapshot(), before);
});

test("cancelled API gap recovery preserves the prior publication and provenance", async t => {
  const f = await fixture(t, { retired: true }), before = f.snapshot();
  const controller = new AbortController();
  await assert.rejects(refreshLocalIndex({ ...f.options, signal: controller.signal,
    onTiming: ({ stage }) => { if (stage === "index_classify") controller.abort(); },
  }), { name: "AbortError" });
  assert.deepEqual(f.snapshot(), before);
  await refreshLocalIndex(f.options);
  assert.equal(f.snapshot().gaps[0].repair_status, "superseded");
});
