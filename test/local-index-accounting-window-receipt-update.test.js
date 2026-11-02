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
  updateAccountingWindowReceipts,
} from "../src/local-index-accounting-windows.js";

const KEY = "synthetic-window-key";
const NOW = Date.parse("2026-09-04T00:00:00.000Z");
const DAY = 86_400_000;

async function setup(t, options = {}) {
  const workspace = createWorkspace({
    files: 1, events: 20, days: 2, fillerBytesPerEvent: 0, ...options,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  const refresh = () => refreshLocalIndex({
    codexHome: workspace.codexHome, indexFile,
    secretFile: workspace.secretFile, workerCount: 1,
  });
  await refresh();
  return { workspace, indexFile, refresh };
}

function receipts(indexFile) {
  return createAccountingWindowReceipts({ indexFile, hmacKey: KEY, now: () => NOW });
}

function update(previous, indexFile) {
  return updateAccountingWindowReceipts({
    previous, indexFile, hmacKey: KEY, now: () => NOW,
  });
}

test("a normal append updates only its bounded windows and equals a full scan", async t => {
  const { workspace, indexFile, refresh } = await setup(t, {
    files: 2, events: 300, days: 35,
  });
  const database = new DatabaseSync(indexFile);
  const compactDay = Date.parse("2026-08-28T12:00:00.000Z");
  try {
    const source = database.prepare("SELECT id FROM source ORDER BY id LIMIT 1").get();
    database.prepare("UPDATE usage_event SET observed_at_ms = ? WHERE source_id = ?")
      .run(compactDay, source.id);
  } finally {
    database.close();
  }
  const before = await receipts(indexFile);
  const target = before.windows.at(-1);
  appendSyntheticCodexEvents(workspace.receipt.sources.slice(0, 1), {
    seed: 41, events: 1, fillerBytesPerEvent: 0,
    atMs: target.lowerMs + 3_600_000,
  });
  await refresh();
  const updated = await update(before, indexFile);
  assert.equal(updated.mode, "incremental");
  assert.ok(updated.rebuiltKeys.includes(target.key));
  assert.ok(updated.rebuiltKeys.length < before.windows.length,
    `bounded ${updated.rebuiltKeys.length} of ${before.windows.length} windows`);
  assert.deepEqual(updated.changed, [target.key]);
  const full = await receipts(indexFile);
  assert.deepEqual(updated.receipts, full);
  assert.deepEqual(updated.receipts.windows, full.windows);
  assert.equal(updated.receipts.lastChangeId, full.lastChangeId);
  assert.ok(updated.receipts.lastChangeId > before.lastChangeId);
});

test("an unchanged generation reuses receipts without scanning", async t => {
  const { indexFile } = await setup(t);
  const before = await receipts(indexFile);
  const updated = await update(before, indexFile);
  assert.equal(updated.mode, "unchanged");
  assert.equal(updated.receipts, before);
});

test("a quota-only manifest range rebuilds its day and equals a full scan", async t => {
  const { indexFile } = await setup(t);
  const before = await receipts(indexFile);
  const database = new DatabaseSync(indexFile);
  let target;
  try {
    target = database.prepare(`SELECT q.source_id, q.source_offset, q.slot_order,
      q.observed_at_ms, s.scanned_bytes FROM quota_occurrence q
      JOIN source s ON s.id = q.source_id
      WHERE q.admission = 'admitted' ORDER BY q.observed_at_ms LIMIT 1`).get();
    if (!target) {
      t.skip("synthetic workspace has no admitted quota occurrence");
      return;
    }
    const sourceId = target.source_id;
    const change = database.prepare(`INSERT INTO source_change(commit_seq, source_id,
      mode, reason, old_file_id, new_file_id, old_scanned_bytes, new_scanned_bytes,
      old_size_bytes, new_size_bytes, old_event_count, new_event_count, confidence,
      created_at_ms) VALUES ((SELECT commit_seq FROM store_state WHERE id = 1), ?,
      'append', NULL, NULL, NULL, ?, ?, NULL, NULL, 0, 0, 'exact', ?)`)
      .run(sourceId, target.scanned_bytes, target.scanned_bytes, NOW);
    const changeId = Number(change.lastInsertRowid);
    database.prepare(`INSERT INTO impact_partition(change_id, partition_kind,
      partition_key, lower_ms, upper_ms, session_id, lineage_component_id,
      account_scope_id, basis_kind, basis_key, status)
      VALUES (?, 'quota_time_range', ?, ?, ?, NULL, NULL, NULL, 'fact_delta', NULL, 'dirty')`)
      .run(changeId, `quota_time_range:${sourceId}`,
        target.observed_at_ms, target.observed_at_ms);
    database.prepare(`INSERT INTO change_fact_count(change_id, fact_kind,
      old_count, new_count, old_min_at_ms, old_max_at_ms, new_min_at_ms, new_max_at_ms)
      VALUES (?, 'quota', 1, 2, ?, ?, ?, ?)`)
      .run(changeId, target.observed_at_ms, target.observed_at_ms,
        target.observed_at_ms, target.observed_at_ms);
    database.prepare("UPDATE store_state SET calculation_revision = calculation_revision + 1 WHERE id = 1").run();
    database.prepare(`UPDATE quota_occurrence SET used_percent = used_percent + 0.5
      WHERE source_id = ? AND source_offset = ? AND slot_order = ?`)
      .run(target.source_id, target.source_offset, target.slot_order);
  } finally {
    database.close();
  }
  const updated = await update(before, indexFile);
  assert.equal(updated.mode, "incremental");
  const key = new Date(target.observed_at_ms).toISOString().slice(0, 10);
  assert.ok(updated.rebuiltKeys.includes(key));
  const full = await receipts(indexFile);
  assert.deepEqual(updated.receipts, full);
});

test("an unsafe manifest mode or partition falls back to a full scan", async t => {
  const { indexFile } = await setup(t);
  const before = await receipts(indexFile);
  const database = new DatabaseSync(indexFile);
  try {
    const source = database.prepare("SELECT id, scanned_bytes FROM source ORDER BY id LIMIT 1").get();
    const change = database.prepare(`INSERT INTO source_change(commit_seq, source_id,
      mode, reason, old_file_id, new_file_id, old_scanned_bytes, new_scanned_bytes,
      old_size_bytes, new_size_bytes, old_event_count, new_event_count, confidence,
      created_at_ms) VALUES ((SELECT commit_seq FROM store_state WHERE id = 1), ?,
      'range_rescan', 'same_size_changed', NULL, NULL, ?, ?, NULL, NULL, 0, 0, 'exact', ?)`)
      .run(source.id, source.scanned_bytes, source.scanned_bytes, NOW);
    database.prepare("UPDATE store_state SET calculation_revision = calculation_revision + 1 WHERE id = 1").run();
    database.prepare(`INSERT INTO impact_partition(change_id, partition_kind,
      partition_key, lower_ms, upper_ms, session_id, lineage_component_id,
      account_scope_id, basis_kind, basis_key, status)
      VALUES (?, 'session', ?, NULL, NULL, NULL, NULL, NULL, 'fact_delta', NULL, 'pending')`)
      .run(Number(change.lastInsertRowid), `session:${source.id}`);
  } finally {
    database.close();
  }
  const updated = await update(before, indexFile);
  assert.equal(updated.mode, "full");
  assert.ok(["manifest_unsafe_mode", "manifest_unsafe_partition"].includes(updated.reason));
});

test("a basis change and a rewound manifest both require a full scan", async t => {
  const { indexFile } = await setup(t);
  const before = await receipts(indexFile);
  const database = new DatabaseSync(indexFile);
  try {
    database.prepare("UPDATE meta SET value = 'synthetic-basis' WHERE key = 'rollup_basis'").run();
  } finally {
    database.close();
  }
  const basis = await update(before, indexFile);
  assert.deepEqual({ mode: basis.mode, reason: basis.reason },
    { mode: "full", reason: "basis_changed" });
  const database2 = new DatabaseSync(indexFile);
  try {
    database2.prepare("UPDATE meta SET value = ? WHERE key = 'rollup_basis'")
      .run(before.basis.rollupBasis);
    database2.prepare("UPDATE store_state SET calculation_revision = calculation_revision + 1 WHERE id = 1").run();
    const source = database2.prepare("SELECT id, scanned_bytes FROM source ORDER BY id LIMIT 1").get();
    database2.prepare(`INSERT INTO source_change(commit_seq, source_id, mode, reason,
      old_file_id, new_file_id, old_scanned_bytes, new_scanned_bytes,
      old_size_bytes, new_size_bytes, old_event_count, new_event_count, confidence,
      created_at_ms) VALUES ((SELECT commit_seq FROM store_state WHERE id = 1), ?,
      'append', NULL, NULL, NULL, ?, ?, NULL, NULL, 0, 0, 'exact', ?)`)
      .run(source.id, source.scanned_bytes, source.scanned_bytes, NOW);
    database2.prepare("UPDATE meta SET value = '999999' WHERE key = 'impact_manifest_since_change_id'").run();
  } finally {
    database2.close();
  }
  const pruned = await update(before, indexFile);
  assert.deepEqual({ mode: pruned.mode, reason: pruned.reason },
    { mode: "full", reason: "manifest_pruned" });
});

test("a fact revision advance without a change row requires a full scan", async t => {
  const { indexFile } = await setup(t);
  const before = await receipts(indexFile);
  const database = new DatabaseSync(indexFile);
  try {
    database.prepare("UPDATE store_state SET calculation_revision = calculation_revision + 1 WHERE id = 1").run();
  } finally {
    database.close();
  }
  const updated = await update(before, indexFile);
  assert.deepEqual({ mode: updated.mode, reason: updated.reason },
    { mode: "full", reason: "revision_without_change" });
});

test("the incremental plan never exceeds its bounded window count", async t => {
  const { indexFile } = await setup(t);
  const before = await receipts(indexFile);
  const database = new DatabaseSync(indexFile);
  try {
    const source = database.prepare("SELECT id, scanned_bytes FROM source ORDER BY id LIMIT 1").get();
    const change = database.prepare(`INSERT INTO source_change(commit_seq, source_id,
      mode, reason, old_file_id, new_file_id, old_scanned_bytes, new_scanned_bytes,
      old_size_bytes, new_size_bytes, old_event_count, new_event_count, confidence,
      created_at_ms) VALUES ((SELECT commit_seq FROM store_state WHERE id = 1), ?,
      'append', NULL, NULL, NULL, ?, ?, NULL, NULL, 0, 0, 'exact', ?)`)
      .run(source.id, source.scanned_bytes, source.scanned_bytes, NOW);
    database.prepare("UPDATE store_state SET calculation_revision = calculation_revision + 1 WHERE id = 1").run();
    database.prepare(`INSERT INTO impact_partition(change_id, partition_kind,
      partition_key, lower_ms, upper_ms, session_id, lineage_component_id,
      account_scope_id, basis_kind, basis_key, status)
      VALUES (?, 'usage_time_range', ?, 0, ?, NULL, NULL, NULL, 'fact_delta', NULL, 'dirty')`)
      .run(Number(change.lastInsertRowid), `usage_time_range:${source.id}`,
        5_000 * DAY);
  } finally {
    database.close();
  }
  const updated = await update(before, indexFile);
  assert.equal(updated.mode, "full");
  assert.equal(updated.reason, "manifest_too_wide");
});

test("a declared speed baseline change dirties only the windows it covers", async t => {
  const { indexFile } = await setup(t);
  const before = await receipts(indexFile);
  const last = before.windows.at(-1);
  const baselines = [{
    mode: "standard",
    firstSeenAt: new Date(last.lowerMs).toISOString(),
    lastSeenAt: new Date(last.upperMs - 1).toISOString(),
  }];
  const after = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, declaredSpeedBaselines: baselines, now: () => NOW,
  });
  const comparison = compareAccountingWindowReceipts(before, after, { hmacKey: KEY });
  assert.equal(comparison.basisChanged, false);
  assert.ok(comparison.changed.includes(last.key));
  for (const key of comparison.changed) assert.equal(key, last.key);
  const updated = await updateAccountingWindowReceipts({
    previous: before, indexFile, hmacKey: KEY,
    declaredSpeedBaselines: baselines, now: () => NOW,
  });
  assert.deepEqual({ mode: updated.mode, reason: updated.reason },
    { mode: "full", reason: "baselines_changed" });
  const full = await createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, declaredSpeedBaselines: baselines, now: () => NOW,
  });
  assert.deepEqual(full, after);
});
