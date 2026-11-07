#!/usr/bin/env node
// Explicit read-only live diagnostic. No refresh, cache writes or credentials.
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MODULE = "src/platform/local-codex-thread-store.js";
const BASELINE_REVISION = "9b0b5fa1a7b8b504f08f7dd869e87499bbbec301";

export function parseWorkOriginBenchmarkArguments(argv) {
  if (!Array.isArray(argv) || ![5, 7].includes(argv.length) || argv[0] !== "--allow-live-read"
      || argv[1] !== "--phase" || !["cold", "warm"].includes(argv[2])
      || argv[3] !== "--run" || !/^[1-3]$/u.test(argv[4])
      || argv.length === 7 && (argv[5] !== "--target" || !["origins", "snapshot"].includes(argv[6]))) {
    throw new Error("WORK_ORIGIN_BENCHMARK_ARGUMENT_INVALID");
  }
  return { allowLiveRead: true, phase: argv[2], run: Number(argv[4]), target: argv[6] ?? "origins" };
}

export async function benchmarkWorkOriginReads({ allowLiveRead = false, phase, run, target = "origins" } = {}) {
  if (!allowLiveRead || process.platform !== "win32" || process.arch !== "x64"
      || !["cold", "warm"].includes(phase) || ![1, 2, 3].includes(run)
      || !["origins", "snapshot"].includes(target)) {
    throw new Error("WORK_ORIGIN_BENCHMARK_CONTEXT_INVALID");
  }
  // Import only after the explicit CLI admission. Baseline code stays in
  // memory; relative dependencies keep their canonical repository owners.
  const root = pathToFileURL(`${ROOT}/`);
  const moduleURL = new URL(MODULE, root);
  const candidateBytes = await readFile(moduleURL);
  const candidateSha256 = createHash("sha256").update(candidateBytes).digest("hex");
  const { openLocalIndexStore } = await import(new URL("src/local-index-store.js", root));
  const { loadWindowsSourceReadBinding } = await import(new URL("src/platform/windows-filesystem.js", root));
  const { createLocalRefreshTimer } = await import(new URL("src/local-refresh-timing.js", root));
  const index = join(process.env.APPDATA, "UsageMonitor", "profiles", "stable", "companion-state", "local-index-store-v1.sqlite");
  const codexHome = join(process.env.USERPROFILE, ".codex");
  if (target === "snapshot") {
    const { readLocalIndexProjection } = await import(new URL("src/local-index-backend.js", root));
    const nowMs = Number(process.env.RHETRION_PERF_ANCHOR_MS ?? Date.now());
    if (!Number.isSafeInteger(nowMs) || nowMs < 1) throw new Error("WORK_ORIGIN_BENCHMARK_CONTEXT_INVALID");
    const readGeneration = () => {
      const db = openLocalIndexStore(index, { readOnly: true });
      try { return db.prepare("SELECT commit_seq FROM store_state WHERE id=1").get().commit_seq; }
      finally { db.close(); }
    };
    const generation = readGeneration();
    const measure = async includeWorkUsage => {
      const stages = {}, began = performance.now();
      const result = await readLocalIndexProjection({ indexFile: index, codexHome, nowMs,
        mode: "full", includeWorkUsage, declaredSpeedBaselines: [],
        onTiming: ({ stage, wallMs }) => { stages[stage] = (stages[stage] ?? 0) + wallMs; } });
      const companion = result.companion ?? result;
      if (companion.status !== "available") throw new Error("WORK_ORIGIN_BENCHMARK_PROJECTION_UNAVAILABLE");
      // readWallMs is the reader's elapsed-time observation, not a figure.
      return { semantic: { ...companion, readWallMs: null },
        metrics: { wallMs: Math.round((performance.now() - began) * 1000) / 1000, stages } };
    };
    for (let i = 0; i < (phase === "warm" ? 4 : 1); i++) {
      let baseline, candidate;
      if ((i + run) % 2) { baseline = await measure(true); candidate = await measure(false); }
      else { candidate = await measure(false); baseline = await measure(true); }
      const equal = JSON.stringify(baseline.semantic) === JSON.stringify(candidate.semantic);
      const generationStable = readGeneration() === generation;
      const sourceUnchanged = candidateSha256 === createHash("sha256").update(await readFile(moduleURL)).digest("hex");
      console.log(JSON.stringify({ schema: "live-snapshot-projection-comparison-v1", runtime: process.versions.node,
        phase: phase === "warm" && i === 0 ? "warmup" : phase, run: phase === "warm" ? i : run,
        generation, nowMs, equal, generationStable, sourceUnchanged, candidateSha256,
        scope: "companion-projection-default-baselines", baseline: baseline.metrics, candidate: candidate.metrics }));
      if (!equal || !generationStable || !sourceUnchanged) throw new Error("WORK_ORIGIN_BENCHMARK_COMPARISON_REFUSED");
    }
    return;
  }
  const current = await import(moduleURL);
  const baselineSource = execFileSync("git", ["show", `${BASELINE_REVISION}:${MODULE}`], { cwd: ROOT, encoding: "utf8" });
  const baselineModule = baselineSource.replace(/from "(\.[^"]+)"/gu,
    (_, path) => `from ${JSON.stringify(new URL(path, moduleURL).href)}`);
  const original = await import(`data:text/javascript;base64,${Buffer.from(baselineModule).toString("base64")}`);
  const database = openLocalIndexStore(index, { readOnly: true });
  let generation, rows;
  try {
    database.exec("BEGIN");
    generation = database.prepare("SELECT commit_seq FROM store_state WHERE id=1").get().commit_seq;
    rows = database.prepare(`SELECT s.session_uuid,src.path,src.lineage_json FROM source src
      JOIN session s ON s.id=src.session_id
      WHERE src.quarantine_code IS NULL AND src.scanned_bytes>0
      ORDER BY s.id,src.id LIMIT 50001`).all();
    database.exec("COMMIT");
  } finally { database.close(); }
  if (rows.length > 50_000) throw new Error("WORK_ORIGIN_BENCHMARK_CAPACITY");
  // Live recording continues during this diagnostic. Select closed sources
  // directly from live state; explicitly exclude recently written sessions
  // rather than accepting unequal inputs or freezing the production writer.
  const mutable = new Set();
  const inventory = new Map();
  const cutoff = Date.now() - 5 * 60_000;
  let nextRow = 0;
  await Promise.all(Array.from({ length: Math.min(16, rows.length) }, async () => {
    for (;;) {
      const row = rows[nextRow++];
      if (!row) return;
      try {
        const stats = await lstat(row.path, { bigint: true });
        const recorded = JSON.parse(row.lineage_json ?? "null");
        if (Number(stats.mtimeMs) >= cutoff || Number(stats.size) !== recorded?.statSize) mutable.add(row.session_uuid);
        inventory.set(row.path, JSON.stringify([String(stats.dev), String(stats.ino), String(stats.size),
          String(stats.birthtimeNs), String(stats.mtimeNs), String(stats.ctimeNs)]));
      }
      catch { mutable.add(row.session_uuid); }
    }
  }));
  const paths = new Map();
  for (const row of rows) {
    if (mutable.has(row.session_uuid)) continue;
    const list = paths.get(row.session_uuid) ?? [];
    if (!list.includes(row.path)) list.push(row.path);
    paths.set(row.session_uuid, list);
  }
  const ids = [...paths.keys()].filter(id => /^[0-9a-f-]{36}$/iu.test(id));
  if (ids.length < 1 || ids.length > 25_000) throw new Error("WORK_ORIGIN_BENCHMARK_CAPACITY");
  const native = loadWindowsSourceReadBinding();
  const key = process.env.RHETRION_PERF_COMPARISON_KEY;
  if (!/^[0-9a-f]{64}$/u.test(key ?? "")) throw new Error("WORK_ORIGIN_BENCHMARK_KEY_REQUIRED");
  const corpusFingerprint = createHmac("sha256", Buffer.from(key, "hex"))
    .update(JSON.stringify([...paths].map(([id, entries]) => [id, entries.map(path => [path, inventory.get(path)])])))
    .digest("hex");
  const states = new Map();
  const changed = new Set(), changedFields = {};
  let stable = true;
  const state = s => JSON.stringify([s.dev, s.ino, s.size, s.birthtimeMs, s.mtimeMs, s.ctimeMs]);
  async function measure(module) {
    let bytes = 0, requested = 0, reads = 0, opens = 0;
    const leases = new Map(), stages = {};
    const binding = { ...native,
      openSourceFile(file) {
        const lease = native.openSourceFile(file);
        leases.set(lease, file); opens++;
        return lease;
      },
      statSourceFile(lease) {
        const result = native.statSourceFile(lease), file = leases.get(lease), value = state(result);
        if (states.has(file) && states.get(file) !== value) {
          stable = false; changed.add(file);
          const previous = JSON.parse(states.get(file)), current = JSON.parse(value);
          for (const [i, name] of ["device", "identity", "size", "birthtime", "mtime", "ctime"].entries()) {
            if (previous[i] !== current[i]) changedFields[name] = (changedFields[name] ?? 0) + 1;
          }
        }
        states.set(file, value);
        return result;
      },
      readSourceFile(lease, position, length) {
        const value = native.readSourceFile(lease, position, length);
        bytes += value.length; requested += length; reads++;
        return value;
      },
      closeSourceFile(lease) { native.closeSourceFile(lease); leases.delete(lease); },
    };
    const timer = createLocalRefreshTimer({ onTiming: ({ stage, wallMs }) => {
      stages[stage] = (stages[stage] ?? 0) + wallMs;
    } });
    const began = performance.now(), cpu = process.cpuUsage();
    const result = await module.readCodexLocalThreadUsageRelations(codexHome, ids, {
      platform: "win32", loadWindowsBinding: () => binding,
      sourcePaths: paths, includeProjectAncestry: true,
      signal: AbortSignal.timeout(180_000), diagnosticTimer: timer,
    });
    timer.flush();
    if (leases.size) throw new Error("WORK_ORIGIN_BENCHMARK_LEASE_LEAK");
    const usage = process.cpuUsage(cpu);
    return { result, metrics: { wallMs: Math.round((performance.now() - began) * 1000) / 1000,
      cpuMs: (usage.user + usage.system) / 1000, readBytes: bytes,
      requestedBytes: requested, reads, opens, stages } };
  }
  for (let i = 0; i < (phase === "warm" ? 4 : 1); i++) {
    let baseline, candidate;
    if ((i + run) % 2) { baseline = await measure(original); candidate = await measure(current); }
    else { candidate = await measure(current); baseline = await measure(original); }
    const check = openLocalIndexStore(index, { readOnly: true });
    let settled;
    try { settled = check.prepare("SELECT commit_seq FROM store_state WHERE id=1").get().commit_seq; }
    finally { check.close(); }
    const equal = JSON.stringify([...baseline.result]) === JSON.stringify([...candidate.result]);
    const sourceUnchanged = candidateSha256 === createHash("sha256").update(await readFile(moduleURL)).digest("hex");
    console.log(JSON.stringify({ schema: "live-work-origin-comparison-v1", runtime: process.versions.node,
      baselineRevision: BASELINE_REVISION,
      phase: phase === "warm" && i === 0 ? "warmup" : phase, run: phase === "warm" ? i : run,
      corpus: "live-closed-sources", excludedMutableSessions: mutable.size,
      corpusFingerprint, candidateSha256, sourceUnchanged,
      generation, selectedSessions: ids.length, originFiles: states.size,
      equal, inputStable: stable, generationStable: settled === generation,
      changedFiles: changed.size, changedFields,
      baseline: baseline.metrics, candidate: candidate.metrics }));
    if (!equal || !stable || !sourceUnchanged || settled !== generation) throw new Error("WORK_ORIGIN_BENCHMARK_COMPARISON_REFUSED");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => parseWorkOriginBenchmarkArguments(process.argv.slice(2)))
    .then(benchmarkWorkOriginReads).catch(() => {
      console.error("WORK_ORIGIN_BENCHMARK_FAILED"); process.exitCode = 1;
    });
}
