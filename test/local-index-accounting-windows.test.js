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

const KEY = "synthetic-window-key";
const NOW = Date.parse("2026-09-02T00:00:00.000Z");

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

function receipts(indexFile, options = {}) {
  return createAccountingWindowReceipts({
    indexFile, hmacKey: KEY, now: () => NOW, ...options,
  });
}

function factCounts(indexFile) {
  const database = new DatabaseSync(indexFile, { readOnly: true });
  try {
    return {
      usage: Number(database.prepare(`SELECT COUNT(*) AS n FROM usage_event u
        JOIN source s ON s.id = u.source_id WHERE u.source_offset <= s.scanned_bytes`).get().n),
      quota: Number(database.prepare(`SELECT COUNT(*) AS n FROM quota_occurrence q
        JOIN source s ON s.id = q.source_id WHERE q.admission = 'admitted'
        AND q.source_offset <= s.scanned_bytes`).get().n),
    };
  } finally {
    database.close();
  }
}

test("window receipts cover committed facts deterministically without content", async t => {
  const { workspace, indexFile } = await fixture(t);
  const first = await receipts(indexFile);
  const second = await receipts(indexFile);
  assertAccountingWindowReceipts(first, { hmacKey: KEY });
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
  const before = await receipts(indexFile);
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
  const after = await receipts(indexFile);
  const changed = compareAccountingWindowReceipts(before, after, { hmacKey: KEY });
  const key = new Date(target.observed_at_ms).toISOString().slice(0, 10);
  assert.equal(changed.basisChanged, false);
  assert.deepEqual(changed.changed, [key]);
  assert.deepEqual(changed.added, []);
  assert.deepEqual(changed.removed, []);
});

test("a quota change dirties only its UTC window", async t => {
  const { indexFile } = await fixture(t);
  const before = await receipts(indexFile);
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
  const after = await receipts(indexFile);
  const changed = compareAccountingWindowReceipts(before, after, { hmacKey: KEY });
  const key = new Date(target.observed_at_ms).toISOString().slice(0, 10);
  assert.equal(changed.basisChanged, false);
  assert.deepEqual(changed.changed, [key]);
});

test("a referenced dimension change dirties its windows without a basis change", async t => {
  const { indexFile } = await fixture(t);
  const before = await receipts(indexFile);
  const database = new DatabaseSync(indexFile);
  try {
    const row = database.prepare(`SELECT model_id FROM usage_event
      ORDER BY observed_at_ms, source_id, source_offset LIMIT 1`).get();
    database.prepare("UPDATE model SET recognition = recognition || '-synthetic' WHERE id = ?")
      .run(row.model_id);
  } finally {
    database.close();
  }
  const after = await receipts(indexFile);
  const changed = compareAccountingWindowReceipts(before, after, { hmacKey: KEY });
  assert.equal(changed.basisChanged, false);
  assert.ok(changed.changed.length >= 1);
  assert.deepEqual(changed.added, []);
  assert.deepEqual(changed.removed, []);
});

test("a global basis change is reported separately from window dirtiness", async t => {
  const { indexFile } = await fixture(t);
  const before = await receipts(indexFile);
  const database = new DatabaseSync(indexFile);
  try {
    database.prepare("UPDATE meta SET value = 'synthetic-basis-change' WHERE key = 'rollup_basis'").run();
  } finally {
    database.close();
  }
  const after = await receipts(indexFile);
  const changed = compareAccountingWindowReceipts(before, after, { hmacKey: KEY });
  assert.equal(changed.basisChanged, true);
  assert.deepEqual(changed.changed, []);
  assert.deepEqual(changed.added, []);
  assert.deepEqual(changed.removed, []);
});

test("provisional rows are excluded from receipts", async t => {
  const { indexFile } = await fixture(t);
  const before = await receipts(indexFile);
  const database = new DatabaseSync(indexFile);
  try {
    const columns = database.prepare("PRAGMA table_info(usage_event)").all().map(row => row.name);
    const projected = columns.map((name, index) => index === 0 ? "source_id"
      : index === 1 ? "source_offset + 1000000" : name).join(",");
    database.exec(`INSERT INTO usage_event (${columns.join(",")})
      SELECT ${projected} FROM usage_event LIMIT 1`);
  } finally {
    database.close();
  }
  const after = await receipts(indexFile);
  assert.equal(after.factCount, before.factCount);
  assert.deepEqual(after.windows, before.windows);
});

test("an unpublished fact set is rejected", async t => {
  const { indexFile } = await fixture(t);
  const database = new DatabaseSync(indexFile);
  try {
    database.exec("UPDATE store_state SET commit_seq = 0 WHERE id = 1");
  } finally {
    database.close();
  }
  await assert.rejects(receipts(indexFile), { code: "accounting_window_unpublished_facts" });
});

test("a key is required by default and keyed receipts are stable", async t => {
  const { indexFile } = await fixture(t);
  await assert.rejects(createAccountingWindowReceipts({ indexFile, now: () => NOW }),
    { code: "accounting_window_key_required" });
  const plain = await createAccountingWindowReceipts({
    indexFile, allowUnkeyed: true, now: () => NOW,
  });
  const keyed = await receipts(indexFile);
  const keyedAgain = await receipts(indexFile);
  assert.deepEqual(keyed, keyedAgain);
  assert.equal(keyed.factCount, plain.factCount);
  assert.equal(keyed.keyed, true);
  assert.equal(plain.keyed, false);
  assert.notDeepEqual(keyed.windows.map(window => window.factDigest),
    plain.windows.map(window => window.factDigest));
  assertAccountingWindowReceipts(plain);
  assertAccountingWindowReceipts(keyed, { hmacKey: KEY });
  assert.throws(() => assertAccountingWindowReceipts(keyed), {
    code: "accounting_window_key_required",
  });
});

test("tampered receipts fail closed", async t => {
  const { indexFile } = await fixture(t);
  const receipt = await receipts(indexFile);
  const tamperedCount = structuredClone(receipt);
  tamperedCount.windows[0].factCount += 1;
  assert.throws(() => assertAccountingWindowReceipts(tamperedCount, { hmacKey: KEY }), {
    code: "accounting_window_receipts_invalid",
  });
  const tamperedBounds = structuredClone(receipt);
  tamperedBounds.windows[0].lowerMs += 1;
  assert.throws(() => assertAccountingWindowReceipts(tamperedBounds, { hmacKey: KEY }), {
    code: "accounting_window_receipts_invalid",
  });
  const tamperedDigest = structuredClone(receipt);
  tamperedDigest.receiptDigest = "0".repeat(64);
  assert.throws(() => assertAccountingWindowReceipts(tamperedDigest, { hmacKey: KEY }), {
    code: "accounting_window_receipts_invalid",
  });
});

test("a pre-aborted or mid-scan request rejects without returning a receipt", async t => {
  const { indexFile } = await fixture(t);
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(receipts(indexFile, { signal: pre.signal }), { name: "AbortError" });
  const mid = new AbortController();
  const pending = receipts(indexFile, { signal: mid.signal, yieldEvery: 1 });
  setImmediate(() => mid.abort());
  await assert.rejects(pending, { name: "AbortError" });
});
