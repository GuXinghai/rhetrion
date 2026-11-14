import { writeSourceFixtureSync as writeFileSync } from "./helpers/windows-source-fixture.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { readLocalIndexWorkUsage } from "../src/local-index-work-usage.js";
import { auditWorkRollups } from "../src/local-index-work-rollup.js";
import { createLocalIndexWriter, openLocalIndexStore } from "../src/local-index-store.js";
import { createWorkspace } from "./helpers/local-index-facts.js";

const END_MS = Date.parse("2026-09-01T00:00:00.000Z");
const CORPUS = {
  variety: true, files: 50, events: 3_000, days: 12, seed: 29,
  fillerBytesPerEvent: 0, quotaRate: 1, endAt: "2026-09-01T00:00:00.000Z",
};

function comparableWorkUsage(value) {
  const copy = structuredClone(value);
  for (const period of Object.values(copy.periods)) {
    for (const snapshot of Object.values(period.snapshots)) {
      delete snapshot.metadata.observedAt;
      snapshot.cells.sort((left, right) => left.id.localeCompare(right.id));
      for (const cell of snapshot.cells) {
        for (const key of ["threads", "projects", "worktrees", "models"]) {
          cell[key]?.sort();
        }
      }
      snapshot.autoReviewThreads?.sort();
    }
  }
  return copy;
}

test("the v11 day rollup read is exact against raw events, including a cleared last instant", async () => {
  const workspace = createWorkspace({ ...CORPUS, files: 6, events: 180, days: 5 });
  try {
    const file = join(workspace.state, "rollup-diff.sqlite");
    const options = {
      codexHome: workspace.codexHome, indexFile: file, secretFile: workspace.secretFile,
      workerCount: 1,
    };
    await refreshLocalIndex(options);
    const readNow = async () => {
      const database = openLocalIndexStore(file, { readOnly: true });
      try {
        return await readLocalIndexWorkUsage({
          database, indexFile: file, codexHome: workspace.codexHome,
          secretFile: workspace.secretFile, nowMs: END_MS,
        });
      } finally {
        database.close();
      }
    };
    const setStatus = (status) => {
      const database = new DatabaseSync(file);
      try {
        database.prepare(
          "UPDATE projection_watermark SET status=? WHERE projection_name='work_rollup'",
        ).run(status);
      } finally {
        database.close();
      }
    };

    setStatus("pending");
    const raw = await readNow();
    setStatus("ready");
    const rolled = await readNow();
    assert.deepEqual(comparableWorkUsage(rolled), comparableWorkUsage(raw));

    const database = new DatabaseSync(file);
    let day;
    try {
      day = database.prepare(
        "SELECT day_ms FROM work_rollup WHERE events > 0 ORDER BY day_ms LIMIT 1",
      ).get().day_ms;
      database.prepare("UPDATE work_rollup SET last_at_ms=NULL WHERE day_ms=?").run(day);
    } finally {
      database.close();
    }
    const fallback = await readNow();
    assert.deepEqual(comparableWorkUsage(fallback), comparableWorkUsage(raw),
      "a cleared last instant falls back to raw events for that day");
  } finally {
    workspace.cleanup();
  }
});

test("the work breakdown from stored facts keeps its invariants at every boundary", async () => {
  const workspace = createWorkspace(CORPUS);
  try {
    const v2File = join(workspace.state, "v2.sqlite");
    await refreshLocalIndex({
      codexHome: workspace.codexHome, indexFile: v2File, secretFile: workspace.secretFile,
      workerCount: 1,
    });
    const database = openLocalIndexStore(v2File, { readOnly: true });
    try {
      assert.equal(auditWorkRollups(database), 0);
      let cells = 0;
      let statusExcluded = 0;
      for (const nowMs of [
        END_MS + 3_600_000,
        END_MS - 3 * 86_400_000 - 7 * 60_000 - 13_123,
        END_MS - 8 * 86_400_000 + 5,
      ]) {
        const spans = [];
        const actual = await readLocalIndexWorkUsage({
          database, indexFile: v2File, codexHome: workspace.codexHome,
          secretFile: workspace.secretFile, nowMs,
          onTiming: value => spans.push(value),
        });
        for (const stage of ["work_memberships", "work_origins", "work_projects", "work_aggregate", "work_finalize"]) {
          assert.ok(spans.some(row => row.stage === stage && row.outcome === "completed"));
        }
        assert.equal(actual.status, "available");
        assert.deepEqual(Object.keys(actual.periods).sort(), ["24h", "30d", "7d", "all"]);
        // A wider window never holds fewer events for any scope.
        const eventsOf = (id) => new Map(actual.periods[id].scopes.map((s) => [s.id, s.events]));
        for (const [narrow, wide] of [["24h", "7d"], ["7d", "30d"], ["30d", "all"]]) {
          const small = eventsOf(narrow);
          const large = eventsOf(wide);
          for (const [scope, events] of small) {
            assert.ok((large.get(scope) ?? 0) >= events, `${narrow} <= ${wide} for ${scope} at ${nowMs}`);
          }
        }
        for (const id of ["24h", "7d", "30d", "all"]) {
          const period = actual.periods[id];
          assert.deepEqual(
            Object.keys(period.snapshots).sort(),
            period.scopes.map((scope) => scope.id).sort(),
          );
          for (const snapshot of Object.values(period.snapshots)) {
            cells += snapshot.cells.length;
            statusExcluded += snapshot.metadata.excludedAllowanceUpdates;
          }
        }
      }
      assert.ok(cells > 100, `cells compared: ${cells}`);
      assert.ok(statusExcluded > 0, "status updates were classified and excluded");
    } finally {
      database.close();
    }
  } finally {
    workspace.cleanup();
  }
});

function observeSourcePaths(database, { onRow = () => {} } = {}) {
  const batches = [], singles = [];
  return {
    batches, singles,
    database: {
      prepare(sql) {
        const statement = database.prepare(sql);
        if (!sql.includes("FROM source src") || !sql.includes("s.session_uuid")) return statement;
        if (!sql.includes(" IN (")) return {
          all(uuid) {
            const rows = statement.all(uuid);
            singles.push({ uuid, paths: rows.map(row => row.path) });
            return rows;
          },
        };
        return {
          *iterate(...ids) {
            const paths = new Map(ids.map(id => [id, []]));
            batches.push({ ids, paths });
            for (const row of statement.iterate(...ids)) {
              const list = paths.get(row.session_uuid.toLowerCase());
              if (list.length < 33 && !list.includes(row.path)) list.push(row.path);
              onRow(row);
              yield row;
            }
          },
        };
      },
    },
  };
}

function addPathSources(database, sessionId, paths, { quarantineCode = null, scannedBytes = 1 } = {}) {
  const writer = createLocalIndexWriter(database);
  const first = Number(database.prepare("SELECT COALESCE(MAX(id),0) AS n FROM source").get().n) + 1;
  writer.begin();
  for (const [index, path] of paths.entries()) {
    const local = Buffer.alloc(32);
    local.writeUInt32BE(first + index);
    const source = writer.registerSource({
      sourceLocal: local, sessionId, surfaceId: null, path,
      rolloutKey: `synthetic-extra-${first + index}`, sizeBytes: scannedBytes, mtimeMs: 1,
    });
    database.prepare("UPDATE source SET scanned_bytes=?, quarantine_code=? WHERE id=?")
      .run(scannedBytes, quarantineCode, source.id);
  }
  writer.commit();
}

async function pathFixture(t, options = {}) {
  const workspace = createWorkspace({ files: 2, events: 4, days: 2, seed: 91, ...options });
  let database;
  t.after(() => { try { database?.close(); } finally { workspace.cleanup(); } });
  const indexFile = join(workspace.state, "work-source-paths.sqlite");
  await refreshLocalIndex({ indexFile, codexHome: workspace.codexHome,
    secretFile: workspace.secretFile, workerCount: 1 });
  database = openLocalIndexStore(indexFile);
  const read = (observed, extra = {}) => readLocalIndexWorkUsage({
    database: observed.database, indexFile, codexHome: workspace.codexHome,
    secretFile: workspace.secretFile, nowMs: END_MS, resolveProject: async () => null, ...extra,
  });
  return { workspace, database, read };
}

test("work source paths batch requested UUIDs case-insensitively without changing path selection", async t => {
  const { database, read } = await pathFixture(t, { files: 260, events: 520 });
  database.exec("UPDATE session SET session_uuid=upper(session_uuid)");
  const first = database.prepare("SELECT session_id,path FROM source ORDER BY id LIMIT 1").get();
  addPathSources(database, first.session_id, [first.path, first.path]);
  addPathSources(database, first.session_id, ["synthetic-quarantined.jsonl"], {
    quarantineCode: "codex_rollout_lineage_invalid", scannedBytes: 1,
  });
  addPathSources(database, first.session_id, ["synthetic-unscanned.jsonl"], { scannedBytes: 0 });
  const observed = observeSourcePaths(database);
  const result = await read(observed);
  assert.equal(result.status, "available");
  assert.equal(observed.batches.length, 2, "260 requested sessions need two bounded source scans");
  assert.equal(observed.singles.length, 0, "ordinary requested sessions never use per-session SQL");
  const expected = database.prepare(`SELECT DISTINCT src.path FROM source src
    JOIN session s ON s.id=src.session_id WHERE s.session_uuid=? COLLATE NOCASE
      AND src.quarantine_code IS NULL AND src.scanned_bytes>0 LIMIT 33`);
  for (const { ids, paths } of observed.batches) {
    assert.ok(ids.length <= 256);
    for (const id of ids) assert.deepEqual(paths.get(id), expected.all(id).map(row => row.path));
  }
  const repeated = await read(observeSourcePaths(database));
  assert.deepEqual(comparableWorkUsage(repeated), comparableWorkUsage(result),
    "the lookup is rebuilt for each work read without retaining completed results");
});

test("small work windows load verified parents lazily and ignore unrelated path overflow", async t => {
  const { database, workspace, read } = await pathFixture(t);
  const rows = database.prepare(`SELECT s.id,s.session_uuid,src.path FROM session s
    JOIN source src ON src.session_id=s.id ORDER BY s.id`).all();
  const [parent, child] = rows;
  const childBytes = readFileSync(child.path, "utf8");
  const newline = childBytes.indexOf("\n");
  const header = JSON.parse(childBytes.slice(0, newline));
  header.payload.thread_source = "subagent";
  header.payload.source = { subagent: { thread_spawn: { parent_thread_id: parent.session_uuid } } };
  writeFileSync(child.path, JSON.stringify(header) + childBytes.slice(newline));
  database.prepare("UPDATE usage_event SET observed_at_ms=? WHERE session_id=?")
    .run(END_MS - 60_000, child.id);
  database.prepare("UPDATE usage_event SET observed_at_ms=? WHERE session_id=?")
    .run(END_MS - 10 * 86_400_000, parent.id);
  const writer = createLocalIndexWriter(database);
  writer.begin();
  const unrelated = writer.internSession(Buffer.alloc(32, 0xfe), "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  writer.commit();
  addPathSources(database, unrelated, Array.from({ length: 40 }, (_, i) => join(workspace.codexHome, `unrelated-${i}.jsonl`)));
  const observed = observeSourcePaths(database);
  const result = await read(observed, { intervals: [{ id: "24h", fromMs: END_MS - 86_400_000, toMs: END_MS }] });
  assert.equal(observed.batches.length, 1);
  assert.deepEqual(observed.batches[0].ids, [child.session_uuid.toLowerCase()]);
  assert.deepEqual(observed.singles.map(item => item.uuid), [parent.session_uuid.toLowerCase()]);
  const snapshot = Object.values(result.periods["24h"].snapshots)[0];
  const childHandle = snapshot.threadLookup[child.session_uuid];
  const parentHandle = snapshot.threadLookup[parent.session_uuid];
  assert.ok(childHandle && parentHandle, "the verified out-of-window parent remains in the family");
  assert.equal(snapshot.threadFamilies[childHandle], parentHandle);
  assert.equal(observed.batches[0].paths.size, 1, "unrelated old sources do not enter the batch");
});

test("work path batches preserve DISTINCT and the 33-path refusal sentinel", async t => {
  const { database, workspace, read } = await pathFixture(t);
  const [parent, session] = database.prepare("SELECT id,session_uuid FROM session ORDER BY id").all();
  const source = database.prepare("SELECT path FROM source WHERE session_id=? LIMIT 1").get(session.id);
  const bytes = readFileSync(source.path, "utf8");
  const newline = bytes.indexOf("\n");
  const header = JSON.parse(bytes.slice(0, newline));
  header.payload.thread_source = "subagent";
  header.payload.source = { subagent: { thread_spawn: { parent_thread_id: parent.session_uuid } } };
  const updated = JSON.stringify(header) + bytes.slice(newline);
  writeFileSync(source.path, updated);
  addPathSources(database, session.id, Array(40).fill(source.path));
  const distinct = observeSourcePaths(database);
  await read(distinct);
  assert.deepEqual(distinct.batches[0].paths.get(session.session_uuid), [source.path]);
  const aliases = Array.from({ length: 31 }, (_, i) => join(workspace.codexHome, "sessions", `alias-${i}.jsonl`));
  for (const path of aliases) writeFileSync(path, updated);
  addPathSources(database, session.id, aliases);
  const allowed = observeSourcePaths(database);
  const accepted = Object.values((await read(allowed)).periods.all.snapshots)[0];
  assert.equal(allowed.batches[0].paths.get(session.session_uuid).length, 32);
  assert.equal(accepted.threadFamilies[accepted.threadLookup[session.session_uuid]],
    accepted.threadLookup[parent.session_uuid], "32 verified distinct sources still establish the parent");
  addPathSources(database, session.id, Array.from({ length: 40 }, (_, i) => join(workspace.codexHome, "sessions", `overflow-${i}.jsonl`)));
  const overflow = observeSourcePaths(database);
  const result = await read(overflow);
  assert.equal(overflow.batches[0].paths.get(session.session_uuid).length, 33);
  const snapshot = Object.values(result.periods.all.snapshots)[0];
  const handle = snapshot.threadLookup[session.session_uuid];
  assert.equal(snapshot.threadFamilies[handle], handle, "overflow cannot invent an ancestry edge");
});

test("cancellation interrupts a work source-path batch before using partial paths", async t => {
  const { database, read } = await pathFixture(t, { files: 4, events: 8 });
  const controller = new AbortController();
  let rows = 0;
  const observed = observeSourcePaths(database, { onRow() { rows++; controller.abort(); } });
  await assert.rejects(read(observed, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(rows, 1);
  assert.equal(observed.batches.length, 1);
  assert.equal(observed.singles.length, 0);
});
