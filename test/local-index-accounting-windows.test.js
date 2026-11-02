import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import {
  assertAccountingWindowReceipts,
  compareAccountingWindowReceipts,
  createAccountingWindowReceipts,
} from "../src/local-index-accounting-windows.js";

async function fixture(t, options = {}) {
  const workspace = createWorkspace({
    files: 3, events: 300, days: 35, fillerBytesPerEvent: 0, ...options,
  });
  t.after(() => workspace.cleanup());
  const indexFile = join(workspace.state, "index.sqlite");
  await refreshLocalIndex({
    codexHome: workspace.codexHome,
    indexFile,
    secretFile: workspace.secretFile,
    workerCount: 1,
  });
  return { workspace, indexFile };
}

function factCounts(indexFile) {
  const database = new DatabaseSync(indexFile, { readOnly: true });
  try {
    return {
      usage: Number(database.prepare("SELECT COUNT(*) AS n FROM usage_event").get().n),
      quota: Number(database.prepare("SELECT COUNT(*) AS n FROM quota_occurrence").get().n),
    };
  } finally {
    database.close();
  }
}

test("window receipts cover committed facts deterministically without content", async t => {
  const { workspace, indexFile } = await fixture(t);
  const first = createAccountingWindowReceipts({ indexFile });
  const second = createAccountingWindowReceipts({ indexFile });
  assertAccountingWindowReceipts(first);
  assert.deepEqual(first, second);
  const counts = factCounts(indexFile);
  assert.equal(first.usageCount, counts.usage);
  assert.equal(first.quotaCount, counts.quota);
  assert.equal(first.factCount, counts.usage + counts.quota);
  assert.ok(first.windows.length >= 2);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu);
  assert.equal(serialized.includes(workspace.codexHome), false);
  for (const window of first.windows) {
    assert.match(window.key, /^\d{4}-\d{2}-\d{2}$/u);
    assert.match(window.factDigest, /^[a-f0-9]{64}$/u);
    assert.equal(window.factCount, window.usageCount + window.quotaCount);
  }
});

test("a single fact change dirties only its UTC window", async t => {
  const { indexFile } = await fixture(t);
  const before = createAccountingWindowReceipts({ indexFile });
  const database = new DatabaseSync(indexFile);
  let target;
  try {
    target = database.prepare(`SELECT source_id, source_offset, observed_at_ms
      FROM usage_event ORDER BY observed_at_ms, source_id, source_offset LIMIT 1`).get();
    database.prepare(`UPDATE usage_event
      SET tokens_out_text = COALESCE(tokens_out_text, 0) + 1
      WHERE source_id = ? AND source_offset = ?`).run(target.source_id, target.source_offset);
  } finally {
    database.close();
  }
  const after = createAccountingWindowReceipts({ indexFile });
  const changed = compareAccountingWindowReceipts(before, after);
  const key = new Date(target.observed_at_ms).toISOString().slice(0, 10);
  assert.deepEqual(changed.changed, [key]);
  assert.deepEqual(changed.added, []);
  assert.deepEqual(changed.removed, []);
});

test("a quota change dirties only its UTC window", async t => {
  const { indexFile } = await fixture(t);
  const before = createAccountingWindowReceipts({ indexFile });
  const database = new DatabaseSync(indexFile);
  let target;
  try {
    target = database.prepare(`SELECT source_id, source_offset, slot_order, observed_at_ms
      FROM quota_occurrence ORDER BY observed_at_ms, source_id, source_offset, slot_order LIMIT 1`).get();
    if (!target) {
      t.skip("synthetic workspace has no quota occurrence");
      return;
    }
    database.prepare(`UPDATE quota_occurrence SET used_percent = used_percent + 0.25
      WHERE source_id = ? AND source_offset = ? AND slot_order = ?`)
      .run(target.source_id, target.source_offset, target.slot_order);
  } finally {
    database.close();
  }
  const after = createAccountingWindowReceipts({ indexFile });
  const changed = compareAccountingWindowReceipts(before, after);
  const key = new Date(target.observed_at_ms).toISOString().slice(0, 10);
  assert.deepEqual(changed.changed, [key]);
});

test("receipt shape rejects count tampering and a keyed digest is stable", async t => {
  const { indexFile } = await fixture(t);
  const plain = createAccountingWindowReceipts({ indexFile });
  const keyed = createAccountingWindowReceipts({ indexFile, hmacKey: "synthetic-window-key" });
  const keyedAgain = createAccountingWindowReceipts({ indexFile, hmacKey: "synthetic-window-key" });
  assert.deepEqual(keyed, keyedAgain);
  assert.equal(keyed.factCount, plain.factCount);
  assert.notDeepEqual(keyed.windows.map(window => window.factDigest),
    plain.windows.map(window => window.factDigest));
  const tampered = structuredClone(plain);
  tampered.windows[0].factCount += 1;
  assert.throws(() => assertAccountingWindowReceipts(tampered), {
    code: "accounting_window_receipts_invalid",
  });
  const invalidDigest = structuredClone(plain);
  invalidDigest.windows[0].factDigest = "not-a-digest";
  assert.throws(() => assertAccountingWindowReceipts(invalidDigest), {
    code: "accounting_window_receipts_invalid",
  });
});
