import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { createLocalIndexWriter, openLocalIndexStore } from "../src/local-index-store.js";
import { createCodexLogSources } from "../src/providers/codex/log-sources.js";
import { createLocalCodexLogPorts } from "../src/platform/index.js";

const at = Date.parse("2026-09-01T00:00:00Z");
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const line = value => JSON.stringify(value) + "\n";
const meta = (id, ordinal, extra = {}) => ({ ordinal, timestamp: new Date(at).toISOString(), type: "session_meta",
  payload: { id, source: "cli", thread_source: "user", history_mode: "paginated", ...extra } });
const usage = (ordinal, input) => ({ ordinal, timestamp: new Date(at + ordinal * 1000).toISOString(),
  type: "event_msg", payload: { type: "token_count", info: { model: "gpt-5", total_token_usage: {
    input_tokens: input, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: input + 1,
  }, last_token_usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: input + 1 } } } });

async function fixture(t) {
  const w = createWorkspace({ files: 1, events: 1, forkFraction: 0 });
  t.after(() => w.cleanup());
  const home = join(w.root, "recovery-codex"), directory = join(home, "sessions");
  await mkdir(directory, { recursive: true });
  const parent = join(directory, `rollout-2026-09-01T00-00-00-${ids[0]}.jsonl`);
  const child = join(directory, `rollout-2026-09-01T00-00-01-${ids[1]}.jsonl`);
  const prefix = line(meta(ids[0], 0)) + line(usage(1, 10));
  await writeFile(parent, prefix);
  await writeFile(child, line(meta(ids[1], 2, { forked_from_id: ids[0], history_base: {
    thread_id: ids[0], end_ordinal_exclusive: 2, end_byte_offset: Buffer.byteLength(prefix),
  } })) + line(usage(3, 20)));
  const indexFile = join(w.state, "recovery.sqlite");
  const options = { codexHome: home, indexFile, secretFile: w.secretFile, workerCount: 1, now: () => at + 60000 };
  const facts = () => {
    const db = openLocalIndexStore(indexFile, { readOnly: true });
    try { return {
      usage: db.prepare("SELECT hex(event_key) AS key, observed_at_ms,total_input_context,tokens_in_uncached FROM usage_event ORDER BY event_key").all(),
      gaps: db.prepare("SELECT reason,repair_status FROM integrity_gap ORDER BY gap_id").all().map(row => ({ ...row })),
      quarantined: db.prepare("SELECT COUNT(*) AS n FROM source WHERE quarantine_code IS NOT NULL").get().n,
    }; } finally { db.close(); }
  };
  await refreshLocalIndex(options);
  return { ...w, home, parent, child, indexFile, options, facts };
}

function legacyQuarantine(f, { admitted = false, mismatchedIdentity = false, sessionId = ids[1] } = {}) {
  const db = openLocalIndexStore(f.indexFile), writer = createLocalIndexWriter(db);
  try {
    const row = db.prepare("SELECT s.* FROM source s JOIN session t ON t.id=s.session_id WHERE t.session_uuid=?").get(sessionId);
    writer.begin();
    const count = db.prepare("SELECT COUNT(*) AS n FROM usage_event WHERE source_id=?").get(row.id).n;
    if (!admitted) {
      writer.deleteSourceFacts(row.id);
      db.prepare("UPDATE source SET scanned_bytes=0,quarantine_code='codex_rollout_lineage_invalid',lineage_json=NULL WHERE id=?").run(row.id);
    }
    writer.recordSourceChange({ sourceId: Number(row.id), mode: "quarantine_gap", reason: "codex_rollout_lineage_invalid",
      oldFileId: mismatchedIdentity ? "1:999" : row.file_id, newFileId: row.file_id,
      oldScannedBytes: row.size_bytes, newScannedBytes: 0, oldSizeBytes: row.size_bytes, newSizeBytes: row.size_bytes,
      oldEventCount: count, newEventCount: 0, confidence: "bounded", factCounts: [], partitions: [], createdAtMs: at,
      gaps: [{ byteStart: 0, byteEnd: row.size_bytes, eventLowerMs: at + 3000, eventUpperMs: at + 3000,
        reason: "codex_rollout_lineage_invalid", confidence: "bounded", createdAtMs: at }] });
    writer.commit();
  } finally { db.close(); }
}

test("a legal parent append during discovery retries without removing child facts or creating gaps", async t => {
  const f = await fixture(t), expected = f.facts(), ports = createLocalCodexLogPorts();
  let inject = true, attempts = 0;
  const scanner = createCodexLogSources({ ...ports, filesystem: { ...ports.filesystem,
    async openReadOnlyNoFollow(path) {
      if (inject && path === f.parent) { inject = false; await appendFile(path, line({ ordinal: 2, type: "synthetic_noop" })); }
      return ports.filesystem.openReadOnlyNoFollow(path);
    },
  } });
  await refreshLocalIndex({ ...f.options, discover: args => { attempts++; return scanner.discoverCodexRolloutInfos(args); } });
  assert.equal(attempts, 2);
  assert.deepEqual(f.facts(), expected);
});

test("discovery retries are bounded and cancellation preserves the prior facts", async t => {
  const f = await fixture(t), expected = f.facts(); let attempts = 0;
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await assert.rejects(refreshLocalIndex({ ...f.options, signal: alreadyAborted.signal }), { code: "codex_log_scan_aborted" });
  assert.deepEqual(f.facts(), expected);
  await assert.rejects(refreshLocalIndex({ ...f.options, discover: async () => {
    attempts++; throw Object.assign(new Error("synthetic change"), { code: "codex_log_source_changed" });
  } }), { code: "codex_rollout_source_changed" });
  assert.equal(attempts, 3); assert.deepEqual(f.facts(), expected);
  const controller = new AbortController();
  await assert.rejects(refreshLocalIndex({ ...f.options, signal: controller.signal, discover: async () => {
    controller.abort(); throw Object.assign(new Error("synthetic change"), { code: "codex_log_source_changed" });
  } }), { name: "AbortError" });
  assert.deepEqual(f.facts(), expected);
});

for (const admitted of [false, true]) test(`verified replay repairs a legacy gap with admitted=${admitted} and remains replay-safe`, async t => {
  const f = await fixture(t), expected = f.facts().usage;
  legacyQuarantine(f, { admitted });
  const first = await refreshLocalIndex(f.options);
  assert.deepEqual(f.facts().usage, expected);
  assert.equal(f.facts().quarantined, 0);
  assert.deepEqual(f.facts().gaps, [{ reason: "codex_rollout_lineage_invalid", repair_status: "repaired" }]);
  const again = await refreshLocalIndex(f.options);
  assert.equal(again.bytesScanned, 0); assert.equal(again.usageEvents, 0);
  assert.ok(first.bytesScanned > 0); assert.deepEqual(f.facts().usage, expected);
});

test("a newer physical identity cannot repair an old gap", async t => {
  const f = await fixture(t); legacyQuarantine(f, { mismatchedIdentity: true });
  await refreshLocalIndex(f.options);
  assert.equal(f.facts().quarantined, 0);
  assert.equal(f.facts().gaps[0].repair_status, "open");
});

test("a cancelled replay rolls back fact restoration and gap closure together", async t => {
  const f = await fixture(t); legacyQuarantine(f); const expected = f.facts();
  const controller = new AbortController();
  await assert.rejects(refreshLocalIndex({ ...f.options, signal: controller.signal, onTiming: ({ stage }) => {
    if (stage === "index_extract") controller.abort();
  } }), { code: "local_index_aborted" });
  assert.deepEqual(f.facts(), expected);
  await refreshLocalIndex(f.options); assert.equal(f.facts().gaps[0].repair_status, "repaired");
});

test("a partial tail preserves the gap until a complete replay succeeds", async t => {
  const f = await fixture(t); legacyQuarantine(f);
  await appendFile(f.child, '{"type":"synthetic_noop"');
  await refreshLocalIndex(f.options);
  assert.equal(f.facts().gaps[0].repair_status, "open");
  await appendFile(f.child, '}\n');
  await refreshLocalIndex(f.options);
  assert.equal(f.facts().gaps[0].repair_status, "repaired");
});

test("a stable invalid parent cutoff remains quarantined with an open gap", async t => {
  const f = await fixture(t); legacyQuarantine(f);
  await writeFile(f.parent, line(meta(ids[0], 0)));
  await refreshLocalIndex(f.options);
  assert.equal(f.facts().quarantined, 1);
  assert.equal(f.facts().gaps[0].repair_status, "open");
});

for (const damage of ["missing_provenance", "unknown_extent", "different_timestamp", "later_replacement"]) {
  test(`verified replay preserves gaps with ${damage}`, async t => {
    const f = await fixture(t); legacyQuarantine(f);
    const db = openLocalIndexStore(f.indexFile);
    try {
      if (damage === "missing_provenance") db.exec("DELETE FROM source_change WHERE mode='quarantine_gap'");
      if (damage === "unknown_extent") db.exec("UPDATE integrity_gap SET byte_end=NULL");
      if (damage === "different_timestamp") db.exec("UPDATE integrity_gap SET created_at_ms=created_at_ms+1");
      if (damage === "later_replacement") db.exec(`INSERT INTO source_change(commit_seq,source_id,mode,reason,
        old_file_id,new_file_id,old_scanned_bytes,new_scanned_bytes,old_size_bytes,new_size_bytes,
        old_event_count,new_event_count,confidence,created_at_ms)
        SELECT commit_seq,source_id,'source_replace','identity_changed',new_file_id,'1:999',0,0,
          old_size_bytes,new_size_bytes,0,0,'bounded',created_at_ms-1 FROM source_change WHERE mode='quarantine_gap'`);
    } finally { db.close(); }
    await refreshLocalIndex(f.options);
    assert.equal(f.facts().quarantined, 0);
    assert.equal(f.facts().gaps[0].repair_status, "open");
  });
}

test("worker lanes restore quarantined components and publish coverage recovery", async t => {
  const f = await fixture(t), expected = f.facts().usage;
  for (const sessionId of ids) legacyQuarantine(f, { sessionId });
  const before = openLocalIndexStore(f.indexFile, { readOnly: true });
  const previousChange = before.prepare("SELECT MAX(change_id) AS id FROM source_change").get().id;
  before.close();
  const result = await refreshLocalIndex({ ...f.options, workerCount: 2 });
  assert.equal(result.mode, "lanes");
  assert.deepEqual(f.facts().usage, expected);
  assert.equal(f.facts().quarantined, 0);
  assert.ok(f.facts().gaps.every(gap => gap.repair_status === "repaired"));
  const db = openLocalIndexStore(f.indexFile, { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM impact_partition WHERE partition_kind='coverage' AND change_id>?").get(previousChange).n, 2);
  } finally { db.close(); }
  assert.equal((await refreshLocalIndex(f.options)).bytesScanned, 0);
});
