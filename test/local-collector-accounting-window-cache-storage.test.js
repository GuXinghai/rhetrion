import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  defaultLocalCollectorStatePath,
  readLocalCollectorAccountingWindowCache,
  writeLocalCollectorAccountingWindowCache,
} from "../src/local-collector-state.js";

const cache = {
  schemaVersion: 2,
  basisFingerprint: "a".repeat(64),
  generation: "3",
  generationFingerprint: "generation-v2-synthetic",
  calculationRevision: 7,
  computedAtMs: 1_790_000_000_000,
  periodEndMs: 1_790_000_000_000,
  historyEndMs: 1_790_000_000_000,
  receipts: { schemaVersion: 2, windows: [] },
  days: [],
  periods: [{ id: "24h" }, { id: "7d" }, { id: "30d" }, { id: "all" }],
  history: null,
  audit: null,
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "accounting-window-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return defaultLocalCollectorStatePath(root);
}

test("window cache round-trips atomically and cancellation preserves the prior copy", async t => {
  const stateFile = await fixture(t);
  assert.deepEqual(await readLocalCollectorAccountingWindowCache({ stateFile }), {
    status: "missing", cache: null,
  });
  await writeLocalCollectorAccountingWindowCache({ stateFile, cache });
  assert.deepEqual(await readLocalCollectorAccountingWindowCache({ stateFile }), {
    status: "available", cache,
  });
  const changed = {
    ...cache, calculationRevision: 8,
    days: [{ key: "2026-11-02", lowerMs: 1, upperMs: 86_400_001, rowDigest: "b".repeat(64), snapshot: {} }],
  };
  await writeLocalCollectorAccountingWindowCache({ stateFile, cache: changed });
  assert.deepEqual((await readLocalCollectorAccountingWindowCache({ stateFile })).cache, changed);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(writeLocalCollectorAccountingWindowCache({
    stateFile, cache: { ...cache, calculationRevision: 9 }, signal: controller.signal,
  }), { name: "AbortError" });
  assert.deepEqual((await readLocalCollectorAccountingWindowCache({ stateFile })).cache, changed);
});

test("malformed window cache is reported invalid without deleting the prior row", async t => {
  const stateFile = await fixture(t);
  await writeLocalCollectorAccountingWindowCache({ stateFile, cache });
  const database = new DatabaseSync(stateFile);
  try {
    database.prepare("UPDATE meta SET value_json='{' WHERE key='accounting_window_cache'").run();
  } finally {
    database.close();
  }
  assert.deepEqual(await readLocalCollectorAccountingWindowCache({ stateFile }), {
    status: "invalid", cache: null,
  });
});
