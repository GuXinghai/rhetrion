#!/usr/bin/env node
// Reader-only comparison. Never refreshes or publishes production state.
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as zlib from "node:zlib";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MODULE = "src/providers/codex/log-sources.js";
const SOURCE_FILES = [MODULE, "src/platform/local-codex-log-ports.js", "src/platform/bounded-rollout-bytes.js",
  "src/providers/codex/log-normalization.js", "src/providers/codex/surface-classification.js", "src/local-refresh-timing.js"];
const BASELINE = "a911573fd324baf534f72bf143999d794c0aec6e";
const SYNTHETIC_ANCHOR = Date.parse("2026-07-30T15:00:00.000Z");
const round = value => Math.round(value * 1000) / 1000;
const fail = suffix => new Error(`CUTOFF_BENCHMARK_${suffix}`);
const hash = value => createHash("sha256").update(value).digest("hex");

export function parseCodexHistoryCutoffBenchmarkArguments(argv) {
  if (!Array.isArray(argv) || ![5, 9].includes(argv.length)
      || !["--synthetic", "--allow-live-read"].includes(argv[0])
      || argv[1] !== "--phase" || !["cold", "warm"].includes(argv[2])
      || argv[3] !== "--run" || !/^[1-3]$/u.test(argv[4])
      || argv.length === 9 && (argv[0] !== "--synthetic" || argv[5] !== "--parents"
        || !/^[1-9][0-9]{0,2}$/u.test(argv[6]) || argv[7] !== "--prefix-mib"
        || !/^[1-9][0-9]?$/u.test(argv[8]))) throw fail("ARGUMENT_INVALID");
  const options = { synthetic: argv[0] === "--synthetic", allowLiveRead: argv[0] === "--allow-live-read",
    phase: argv[2], run: Number(argv[4]), parents: argv.length === 9 ? Number(argv[6]) : 12,
    prefixMiB: argv.length === 9 ? Number(argv[8]) : 9 };
  if (options.parents > 128 || options.prefixMiB > 32 || options.parents * options.prefixMiB > 512) {
    throw fail("ARGUMENT_INVALID");
  }
  return options;
}

function exactState(stats) {
  const fields = ["dev", "ino", "size", "birthtimeNs", "mtimeNs", "ctimeNs", "nlink"];
  if (!stats?.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n
      || !fields.every(field => typeof stats[field] === "bigint")) throw fail("INPUT_REFUSED");
  return fields.map(field => String(stats[field])).join(":");
}

function scopedPath(home, path) {
  if (!isAbsolute(path)) return false;
  const local = relative(home, path);
  return local !== "" && !local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local)
    && ["sessions", "archived_sessions"].includes(local.split(sep)[0]);
}

function directoryIdentity(stats) {
  const fields = ["dev", "ino", "birthtimeNs"];
  if (!stats?.isDirectory() || stats.isSymbolicLink()
      || !fields.every(field => typeof stats[field] === "bigint")) throw fail("INPUT_REFUSED");
  return fields.map(field => String(stats[field])).join(":");
}

async function captureDirectories(home, inventory) {
  const paths = new Set([home]);
  for (const path of inventory.keys()) {
    if (!scopedPath(home, path)) throw fail("INPUT_REFUSED");
    for (let parent = dirname(path); parent !== home; parent = dirname(parent)) {
      if (dirname(parent) === parent) throw fail("INPUT_REFUSED");
      paths.add(parent);
    }
  }
  const states = new Map();
  for (const path of paths) states.set(path, directoryIdentity(await lstat(path, { bigint: true })));
  return states;
}

function virtualDirectories(home, inventory) {
  const directories = new Map([[join(home, "sessions"), new Map()], [join(home, "archived_sessions"), new Map()]]);
  for (const path of inventory.keys()) {
    let current = path;
    let directory = false;
    while (dirname(current) !== home) {
      const parent = dirname(current);
      const entries = directories.get(parent) ?? new Map();
      const isDirectory = directory;
      entries.set(basename(current), { name: basename(current), isFile: () => !isDirectory,
        isDirectory: () => isDirectory });
      directories.set(parent, entries);
      current = parent;
      directory = true;
    }
  }
  return directories;
}

function instrumentedPorts(ports, home, inventory) {
  const counts = { opens: 0, closes: 0, fstatCalls: 0, namedStatCalls: 0,
    physicalReadCalls: 0, physicalBytes: 0, cutoffDecoderCalls: 0, cutoffLogicalBytes: 0 };
  const directories = virtualDirectories(home, inventory);
  return { counts, ports: { filesystem: { ...ports.filesystem,
    async *openDirectory(path) { yield* (directories.get(path)?.values() ?? []); },
    async lstatPath(...args) { counts.namedStatCalls++; return ports.filesystem.lstatPath(...args); },
    async openReadOnlyNoFollow(path) {
      if (!inventory.has(path)) throw fail("INPUT_REFUSED");
      const handle = await ports.filesystem.openReadOnlyNoFollow(path);
      counts.opens++;
      return { fd: handle.fd,
        async stat(...args) { counts.fstatCalls++; return handle.stat(...args); },
        async read(...args) { const result = await handle.read(...args);
          counts.physicalReadCalls++; counts.physicalBytes += result.bytesRead; return result; },
        async close() { await handle.close(); counts.closes++; },
      };
    },
  }, lineReader: { ...ports.lineReader,
    async *readCompressedRolloutBytes(source, options) {
      counts.cutoffDecoderCalls++;
      for await (const chunk of ports.lineReader.readCompressedRolloutBytes(source, options)) {
        counts.cutoffLogicalBytes += chunk.length;
        yield chunk;
      }
    },
  } } };
}

async function sourceHash() {
  const digest = createHash("sha256");
  for (const file of SOURCE_FILES) digest.update(await readFile(join(ROOT, file)));
  return digest.digest("hex");
}

async function readers() {
  const moduleURL = pathToFileURL(join(ROOT, MODULE));
  const candidate = await import(moduleURL.href);
  const source = execFileSync("git", ["show", `${BASELINE}:${MODULE}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const relocated = source.replace(/from "(\.[^"]+)"/gu,
    (_, path) => `from ${JSON.stringify(new URL(path, moduleURL).href)}`);
  const baseline = await import(`data:text/javascript;base64,${Buffer.from(relocated).toString("base64")}`);
  return { baseline, candidate };
}

const metadata = (thread, base = null) => JSON.stringify({ ordinal: 0, type: "session_meta", payload: {
  id: thread, ...(base ? { history_mode: "paginated", history_base: {
    thread_id: thread, end_byte_offset: base.bytes, end_ordinal_exclusive: base.lines,
  } } : {}),
} });

async function syntheticInput(root, { parents, prefixBytes }, baseline, ports) {
  const home = join(root, "home"), folder = join(home, "sessions");
  await mkdir(folder, { recursive: true });
  const digest = createHash("sha256"), fixedAt = new Date(SYNTHETIC_ANCHOR - 60_000);
  let logicalPrefixBytes = 0, compressedParents = 0;
  const filler = `${JSON.stringify({ type: "synthetic_filler", payload: { padding: "x".repeat(4000) } })}\n`;
  for (let i = 1; i <= parents; i++) {
    const thread = `${i.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
    const replacement = `${i.toString(16).padStart(8, "0")}-2222-4222-8222-222222222222`;
    const header = `${metadata(thread)}\n`;
    const lines = Math.max(1, Math.floor((prefixBytes - Buffer.byteLength(header)) / Buffer.byteLength(filler)));
    const bytes = Buffer.from(header + filler.repeat(lines));
    const compressed = i % 12 !== 0;
    const parentPath = join(folder, `rollout-2026-07-30T11-00-00-${thread}.jsonl${compressed ? ".zst" : ""}`);
    const childPath = join(folder, `rollout-2026-07-30T12-00-00-${thread}_${replacement}.jsonl`);
    const child = Buffer.from(`${metadata(thread, { bytes: bytes.length, lines: lines + 1 })}\n`);
    digest.update(bytes).update(child);
    await writeFile(parentPath, compressed ? zlib.zstdCompressSync(bytes) : bytes, { flag: "wx", mode: 0o600 });
    await writeFile(childPath, child, { flag: "wx", mode: 0o600 });
    await utimes(parentPath, fixedAt, fixedAt); await utimes(childPath, fixedAt, fixedAt);
    logicalPrefixBytes += bytes.length;
    compressedParents += Number(compressed);
  }
  // Build a common validated inspection outside measured scanner/cache lifetime.
  const inspector = baseline.createCodexLogSources(ports);
  const infos = await inspector.discoverCodexRolloutInfos({ codexHome: home,
    startAt: "1970-01-01T00:00:00.000Z", endAt: new Date(SYNTHETIC_ANCHOR).toISOString(), selectedRolloutNames: null });
  if (infos.length !== parents * 2 || inspector.codexRolloutDiscoveryReceipt(infos).status !== "complete") throw fail("SYNTHETIC_INVALID");
  const inventory = new Map();
  for (const info of infos) inventory.set(info.path, { state: exactState(await lstat(info.path, { bigint: true })),
    known: { lineage: info.lineage, compressionReason: info.compressionReason,
      size: info.size, contentSha256: info.contentSha256 } });
  return { home, inventory, anchor: SYNTHETIC_ANCHOR, corpusFingerprint: digest.digest("hex"), generation: null,
    excludedSources: 0, logicalPrefixBytes, compressedParents, parents, readGeneration: () => null,
    directories: await captureDirectories(home, inventory) };
}

async function liveInput() {
  const key = process.env.RHETRION_PERF_COMPARISON_KEY;
  const anchor = Number(process.env.RHETRION_PERF_ANCHOR_MS), expected = Number(process.env.RHETRION_PERF_GENERATION);
  if (!/^[a-f0-9]{64}$/u.test(key ?? "") || !Number.isSafeInteger(anchor) || anchor < 1
      || !Number.isSafeInteger(expected) || expected < 1 || anchor > Date.now()
      || typeof process.env.APPDATA !== "string" || typeof process.env.USERPROFILE !== "string") throw fail("CONTEXT_INVALID");
  const { openLocalIndexStore } = await import("../src/local-index-store.js");
  const index = join(process.env.APPDATA, "UsageMonitor/profiles/stable/companion-state/local-index-store-v1.sqlite");
  const home = join(process.env.USERPROFILE, ".codex");
  const readGeneration = () => { const db = openLocalIndexStore(index, { readOnly: true });
    try { return db.prepare("SELECT commit_seq FROM store_state WHERE id=1").get().commit_seq; } finally { db.close(); } };
  const db = openLocalIndexStore(index, { readOnly: true });
  let rows, generation;
  try { db.exec("BEGIN"); generation = db.prepare("SELECT commit_seq FROM store_state WHERE id=1").get().commit_seq;
    rows = db.prepare(`SELECT path,file_id,birthtime_ms,mtime_ms,ctime_ms,lineage_json FROM source
      WHERE quarantine_code IS NULL AND scanned_bytes>0 AND lineage_json IS NOT NULL ORDER BY id LIMIT 50001`).all();
    db.exec("COMMIT");
  } finally { db.close(); }
  if (generation !== expected || rows.length > 50_000) throw fail("INPUT_CHANGED");
  const inventory = new Map(); let excludedSources = 0;
  for (const row of rows) {
    try {
      if (!scopedPath(home, row.path)) throw fail("INPUT_REFUSED");
      const known = JSON.parse(row.lineage_json), stats = await lstat(row.path), exact = await lstat(row.path, { bigint: true });
      const [dev, ino] = String(row.file_id).split(":").map(Number);
      if (!known.lineage || known.statSize !== stats.size
          || stats.mtimeMs > anchor - 300_000 || stats.dev !== dev || stats.ino !== ino
          || stats.birthtimeMs !== Number(row.birthtime_ms) || stats.mtimeMs !== Number(row.mtime_ms)
          || stats.ctimeMs !== Number(row.ctime_ms)) throw fail("INPUT_REFUSED");
      inventory.set(row.path, { state: exactState(exact), known });
    } catch { excludedSources++; }
  }
  if (inventory.size === 0) throw fail("INPUT_REFUSED");
  const directories = await captureDirectories(home, inventory);
  const keyed = createHmac("sha256", Buffer.from(key, "hex"));
  for (const [path, value] of [...inventory].sort(([a], [b]) => a.localeCompare(b))) {
    keyed.update(JSON.stringify([path, value.state, value.known]));
  }
  for (const [path, state] of [...directories].sort(([a], [b]) => a.localeCompare(b))) {
    keyed.update(JSON.stringify([path, state]));
  }
  const bases = new Map(); let compressedParents = 0;
  for (const { known } of inventory.values()) { const b = known.lineage?.historyBase;
    if (b && Number.isSafeInteger(b.endByteOffset) && b.endByteOffset >= 0)
      bases.set(JSON.stringify([b.rolloutId, b.endByteOffset, b.endOrdinalExclusive]), b); }
  // Counts describe retained references, not actual validation/read calls.
  for (const path of inventory.keys()) if (path.endsWith(".zst")) compressedParents++;
  if (bases.size === 0) throw fail("INPUT_REFUSED");
  return { home, inventory, anchor, corpusFingerprint: keyed.digest("hex"), generation, excludedSources,
    logicalPrefixBytes: [...bases.values()].reduce((n, b) => n + b.endByteOffset, 0),
    compressedParents, parents: bases.size, readGeneration, directories };
}

async function unchanged(input) {
  if (input.readGeneration() !== input.generation) return false;
  for (const [path, state] of input.directories) {
    try { if (directoryIdentity(await lstat(path, { bigint: true })) !== state) return false; }
    catch { return false; }
  }
  for (const [path, value] of input.inventory) {
    try { if (exactState(await lstat(path, { bigint: true })) !== value.state) return false; }
    catch { return false; }
  }
  return input.readGeneration() === input.generation;
}

async function removeSynthetic(root, scratchRoot) {
  const target = resolve(root), owner = await lstat(target);
  if (dirname(target) !== resolve(scratchRoot) || !basename(target).startsWith("rhetrion-cutoff-benchmark-")
      || !owner.isDirectory() || owner.isSymbolicLink()) throw fail("CLEANUP_REFUSED");
  await rm(target, { recursive: true });
}

export async function benchmarkCodexHistoryCutoffs({ synthetic = false, allowLiveRead = false, phase, run,
  parents = 12, prefixMiB = 9, prefixBytes = prefixMiB * 1024 ** 2, onSample = () => {} } = {}) {
  if (process.platform !== "win32" || process.arch !== "x64" || typeof synthetic !== "boolean"
      || typeof allowLiveRead !== "boolean" || synthetic === allowLiveRead
      || !["cold", "warm"].includes(phase) || ![1, 2, 3].includes(run)
      || typeof onSample !== "function" || !Number.isSafeInteger(parents) || parents < 1 || parents > 128
      || !Number.isSafeInteger(prefixBytes) || prefixBytes < 512 || prefixBytes > 32 * 1024 ** 2
      || parents * prefixBytes > 512 * 1024 ** 2) throw fail("CONTEXT_INVALID");
  if (typeof zlib.zstdCompressSync !== "function") throw fail("RUNTIME_UNAVAILABLE");
  const { createLocalCodexLogPorts } = await import("../src/platform/local-codex-log-ports.js");
  const { createLocalRefreshTimer } = await import("../src/local-refresh-timing.js");
  const sourceSha256 = await sourceHash(), modules = await readers(), ports = createLocalCodexLogPorts();
  if (sourceSha256 !== await sourceHash()) throw fail("INPUT_CHANGED");
  const scratchRoot = resolve(tmpdir()); let root = null;
  try {
    if (synthetic) root = await mkdtemp(join(scratchRoot, "rhetrion-cutoff-benchmark-"));
    const input = synthetic ? await syntheticInput(root, { parents, prefixBytes }, modules.baseline, ports) : await liveInput();
    const sides = Object.fromEntries(["baseline", "candidate"].map(name => {
      const wrapped = instrumentedPorts(ports, input.home, input.inventory);
      return [name, { ...wrapped, scanner: modules[name].createCodexLogSources(wrapped.ports) }];
    }));
    const measure = async name => {
      const side = sides[name], stages = {};
      for (const key of Object.keys(side.counts)) side.counts[key] = 0;
      const timer = createLocalRefreshTimer({ onTiming: ({ stage, wallMs }) => { stages[stage] = round((stages[stage] ?? 0) + wallMs); } });
      const processUptimeAtMeasurementMs = round(performance.now()), started = performance.now();
      const infos = await side.scanner.discoverCodexRolloutInfos({ codexHome: input.home,
        startAt: "1970-01-01T00:00:00.000Z", endAt: new Date(input.anchor).toISOString(), selectedRolloutNames: null,
        inspectionCache: info => input.inventory.get(info.path)?.known ?? null, diagnosticTimer: timer });
      timer.flush();
      const wallMs = round(performance.now() - started);
      return { semantic: JSON.stringify({ infos, receipt: side.scanner.codexRolloutDiscoveryReceipt(infos) }),
        metrics: { wallMs, processUptimeAtMeasurementMs, stages, ...side.counts, selectedSources: infos.length } };
    };
    const results = [];
    for (let i = 0; i < (phase === "warm" ? 4 : 1); i++) {
      if (!await unchanged(input)) throw fail("INPUT_CHANGED");
      const order = (i + run) % 2 ? ["baseline", "candidate"] : ["candidate", "baseline"];
      const measurements = {};
      for (const name of order) measurements[name] = await measure(name);
      if (measurements.baseline.metrics.physicalReadCalls === 0) throw fail("INPUT_REFUSED");
      const equal = measurements.baseline.semantic === measurements.candidate.semantic;
      const stateUnchanged = await unchanged(input), sourceUnchanged = sourceSha256 === await sourceHash();
      if (!equal || !stateUnchanged || !sourceUnchanged) throw fail("COMPARISON_REFUSED");
      const sample = { schemaVersion: "codex-history-cutoff-benchmark-v1", runtime: process.versions.node,
        corpus: synthetic ? "synthetic" : "closed-indexed-live-inventory", baselineRevision: BASELINE,
        phase: phase === "warm" && i === 0 ? "warmup" : phase, run: phase === "warm" ? i : run,
        generation: input.generation, anchorMs: input.anchor, corpusFingerprint: input.corpusFingerprint,
        sourceSha256, sourceUnchanged, stateUnchanged, equal, externalInputsFrozen: synthetic,
        sources: input.inventory.size, excludedSources: input.excludedSources,
        retainedCutoffs: input.parents, compressedSources: input.compressedParents, indexedPrefixBytes: input.logicalPrefixBytes,
        baseline: measurements.baseline.metrics, candidate: measurements.candidate.metrics };
      results.push(sample); await onSample(sample);
    }
    return results;
  } finally { if (root !== null) await removeSynthetic(root, scratchRoot); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => parseCodexHistoryCutoffBenchmarkArguments(process.argv.slice(2)))
    .then(options => benchmarkCodexHistoryCutoffs({ ...options, onSample: sample => console.log(JSON.stringify(sample)) }))
    .catch(() => { console.error("CUTOFF_BENCHMARK_REFUSED"); process.exitCode = 1; });
}
