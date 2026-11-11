import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import * as zlib from "node:zlib";

import { createCodexLogScanner } from "../src/providers/codex/logs.js";
import { createLocalCodexLogPorts } from "../src/platform/local-codex-log-ports.js";
import { compressedRolloutHandle, inspectCompressedRollout,
  readCompressedRolloutBytes, supportsCompressedRollouts } from "../src/platform/bounded-rollout-bytes.js";

const HOME = "/synthetic/cutoff-proof";
const THREAD = "11111111-1111-4111-8111-111111111111";
const REPLACEMENT = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-07-30T12:00:00.000Z");
const NS = BigInt(NOW) * 1_000_000n;
const NAME = `rollout-2026-07-30T11-00-00-${THREAD}.jsonl`;
const CHILD_NAME = `rollout-2026-07-30T12-00-00-${THREAD}_${REPLACEMENT}.jsonl`;
const metadata = (base = null, sessionId = THREAD) => JSON.stringify({ ordinal: 0, type: "session_meta", payload: {
  id: sessionId, ...(base ? { history_mode: "paginated", history_base: {
    thread_id: THREAD, end_byte_offset: base.bytes, end_ordinal_exclusive: base.lines,
  } } : {}),
} });

function fixture({ paddingBytes = 600_000, cutoffs = null, compressed = false } = {}) {
  const files = new Map();
  const parentPath = posix.join(HOME, "sessions", NAME + (compressed ? ".zst" : ""));
  let nextIno = 9_007_199_254_740_993n;
  const state = { statMode: "exact", failClose: false, onRead: null, onNamedStat: null,
    onClose: null, unsafeNamed: false, unsafeHandle: false };
  const counters = { bytes: 0, reads: 0, opens: 0, closes: 0, ordinaryStats: 0,
    exactStats: 0, namedStats: 0, decoderCalls: 0, logicalBytes: 0, completedDecoders: 0 };
  const add = (path, bytes) => {
    const file = { bytes: Buffer.from(bytes), ino: nextIno++, dev: 7n, birthtimeNs: NS,
      mtimeNs: NS, ctimeNs: NS, uid: 501n, nlink: 1n, regular: true, symlink: false };
    files.set(path, file); return file;
  };
  const parentBytes = cutoffs
    ? Buffer.from(`${metadata()}\n${"\n".repeat(cutoffs)}`)
    : Buffer.from(`${metadata()}\n${"x".repeat(paddingBytes)}\n`);
  const parent = add(parentPath, compressed ? zlib.zstdCompressSync(parentBytes) : parentBytes);
  const childPaths = [];
  if (cutoffs) {
    const firstBytes = Buffer.byteLength(`${metadata()}\n`);
    for (let index = 1; index <= cutoffs; index++) {
      const id = `${index.toString(16).padStart(8, "0")}-2222-4222-8222-222222222222`;
      const path = posix.join(HOME, "sessions", `rollout-2026-07-30T12-00-00-${THREAD}_${id}.jsonl`);
      add(path, `${metadata({ bytes: firstBytes + index, lines: index + 1 })}\n`);
      childPaths.push(path);
    }
  } else {
    const path = posix.join(HOME, "sessions", CHILD_NAME);
    add(path, `${metadata({ bytes: parentBytes.length, lines: 2 })}\n`);
    childPaths.push(path);
  }
  function stats(file, exact) {
    const fields = exact ? { dev: file.dev, ino: file.ino, size: BigInt(file.bytes.length),
      birthtimeNs: file.birthtimeNs, mtimeNs: file.mtimeNs, ctimeNs: file.ctimeNs,
      nlink: file.nlink, uid: file.uid } : { dev: Number(file.dev), ino: Number(file.ino),
      size: file.bytes.length, birthtimeMs: Number(file.birthtimeNs) / 1_000_000,
      mtimeMs: Number(file.mtimeNs) / 1_000_000, ctimeMs: Number(file.ctimeNs) / 1_000_000,
      nlink: Number(file.nlink), uid: Number(file.uid) };
    if (exact && state.statMode === "no_ns") delete fields.ctimeNs;
    return { ...fields, isFile: () => file.regular, isSymbolicLink: () => file.symlink };
  }
  const filesystem = {
    defaultCodexHome: () => HOME, joinPath: posix.join, currentUid: () => 501,
    readSelectedRolloutNames: async () => null,
    async *openDirectory(path) {
      for (const name of files.keys()) if (posix.dirname(name) === path) yield {
        name: posix.basename(name), isFile: () => true, isDirectory: () => false,
      };
    },
    async statPath(path) { return stats(files.get(path), false); },
    async lstatPath(path, options) {
      if (path === parentPath) { counters.namedStats++; state.onNamedStat?.(files.get(path)); }
      if (!files.has(path)) throw Object.assign(Error("synthetic_missing"), { code: "ENOENT" });
      const file = files.get(path);
      const result = stats(file, options?.bigint && state.statMode !== "number");
      return state.unsafeNamed ? { ...result, isSymbolicLink: () => true } : result;
    },
    async openReadOnlyNoFollow(path) {
      const file = files.get(path);
      if (!file) throw Object.assign(Error("synthetic_missing"), { code: "ENOENT" });
      if (path === parentPath) counters.opens++;
      return {
        async stat(options) {
          if (path === parentPath) counters[options?.bigint ? "exactStats" : "ordinaryStats"]++;
          if (options?.bigint && state.statMode === "throw") throw TypeError("synthetic_unsupported");
          const result = stats(file, options?.bigint && state.statMode !== "number");
          return state.unsafeHandle ? { ...result, nlink: options?.bigint ? 2n : 2 } : result;
        },
        async read(buffer, offset, length, position) {
          const bytes = file.bytes.subarray(position, position + length);
          buffer.set(bytes, offset);
          if (path === parentPath) { counters.bytes += bytes.length; counters.reads++; state.onRead?.(file); }
          return { bytesRead: bytes.length, buffer };
        },
        async close() {
          if (path === parentPath) { counters.closes++; state.onClose?.(file); }
          if (state.failClose) throw Error("synthetic_close_refused");
        },
      };
    },
    createSha256: () => createHash("sha256"),
    async *readUtf8Range() {}, async *readUtf8LinesRange() {},
  };
  const lineReader = { async *readBoundedUtf8Lines(path) {
    yield files.get(path).bytes.toString("utf8").split("\n", 1)[0];
  }, supportsCompressedRollouts, compressedRolloutHandle,
  async inspectCompressedRollout(path, options) {
    const handle = await filesystem.openReadOnlyNoFollow(path);
    try { return await inspectCompressedRollout(compressedRolloutHandle(handle), options); }
    finally { await handle.close(); }
  },
  async *readCompressedRolloutBytes(source, options) {
    counters.decoderCalls++;
    for await (const chunk of readCompressedRolloutBytes(source, options)) {
      counters.logicalBytes += chunk.length; yield chunk;
    }
    counters.completedDecoders++;
  } };
  const scanner = createCodexLogScanner({ filesystem, lineReader });
  const inspections = new Map();
  const discover = async options => {
    const infos = await scanner.discoverCodexRolloutInfos({ codexHome: HOME,
      startAt: "2026-07-30T10:00:00.000Z", endAt: "2026-07-30T15:00:00.000Z",
      inspectionCache: info => inspections.get(info.path) ?? null, ...options });
    return { infos, receipt: scanner.codexRolloutDiscoveryReceipt(infos) };
  };
  const cacheInspections = result => {
    for (const info of result.infos) inspections.set(info.path, {
      lineage: info.lineage, compressionReason: info.compressionReason,
      size: info.size, contentSha256: info.contentSha256,
    });
  };
  const reset = () => { for (const key of Object.keys(counters)) counters[key] = 0; };
  return { scanner, filesystem, lineReader, parent, parentBytes, parentPath, childPaths, files,
    state, counters, discover, reset, add, cacheInspections };
}

test("unchanged exact cutoff proofs skip prefix bytes while opening, guarding and closing again", async () => {
  const f = fixture();
  const first = await f.discover();
  assert.equal(first.receipt.status, "complete");
  assert.equal(f.counters.bytes, f.parent.bytes.length);
  f.reset();
  const second = await f.discover();
  assert.deepEqual(second, first);
  assert.equal(f.counters.bytes, 0);
  assert.equal(f.counters.reads, 0);
  assert.equal(f.counters.opens, 1);
  assert.equal(f.counters.closes, 1);
  assert.equal(f.counters.ordinaryStats, 1);
  assert.equal(f.counters.exactStats, 2);
  assert.equal(f.counters.namedStats, 2);
  const restarted = createCodexLogScanner({ filesystem: f.filesystem, lineReader: f.lineReader });
  f.reset();
  await restarted.discoverCodexRolloutInfos({ codexHome: HOME, startAt: "2026-07-30T10:00:00.000Z" });
  assert.equal(f.counters.bytes, f.parent.bytes.length, "a new scanner cannot inherit a proof");
});

test("append, exact nanosecond mutation and replacement require fresh prefix reads", async (t) => {
  for (const kind of ["append", "nanoseconds", "replacement"]) await t.test(kind, async () => {
    const f = fixture(); await f.discover(); f.reset();
    if (kind === "append") { f.parent.bytes = Buffer.concat([f.parent.bytes, Buffer.from("\n")]); f.parent.mtimeNs++; }
    if (kind === "nanoseconds") { f.parent.bytes[300] = 0x79; f.parent.ctimeNs++; }
    if (kind === "replacement") f.add(f.parentPath, f.parent.bytes);
    const actual = await f.discover();
    assert.equal(actual.receipt.status, "complete");
    assert.ok(f.counters.bytes > 0);
    f.reset(); await f.discover();
    assert.equal(f.counters.bytes, 0, "only the new fully checked state becomes reusable");
  });
});

test("missing or coarse exact-stat support never authorizes or retains a proof", async (t) => {
  for (const mode of ["number", "no_ns", "throw"]) await t.test(mode, async () => {
    const f = fixture(); f.state.statMode = mode;
    await f.discover(); f.reset(); await f.discover();
    assert.equal(f.counters.bytes, f.parent.bytes.length);
    f.state.statMode = "exact"; f.reset(); await f.discover();
    assert.equal(f.counters.bytes, f.parent.bytes.length);
    f.reset(); await f.discover(); assert.equal(f.counters.bytes, 0);
    f.state.statMode = mode; f.reset(); await f.discover();
    assert.equal(f.counters.bytes, f.parent.bytes.length, "a former exact proof cannot bypass an unsupported adapter");
  });
});

test("mutation during prefix read or guarded reuse refuses publication", async (t) => {
  await t.test("cold read", async () => {
    const f = fixture(); let changed = false;
    f.state.onRead = file => { if (!changed) { changed = true; file.ctimeNs++; } };
    await assert.rejects(f.discover(), { code: "codex_log_source_changed" });
    f.state.onRead = null; f.reset();
    assert.equal((await f.discover()).receipt.status, "complete");
    assert.ok(f.counters.bytes > 0, "a failed read-state proof was not seeded");
  });
  await t.test("warm proof", async () => {
    const f = fixture(); await f.discover(); f.reset();
    let named = 0;
    f.state.onNamedStat = file => { if (++named === 2) file.ctimeNs++; };
    await assert.rejects(f.discover(), { code: "codex_log_source_changed" });
    assert.equal(f.counters.bytes, 0);
    f.state.onNamedStat = null; f.reset(); await f.discover();
    assert.ok(f.counters.bytes > 0, "a failed warm revalidation evicts its proof");
  });
});

test("unsafe or missing named files, failed closes and cancelled proof reads cannot reuse success", async (t) => {
  for (const kind of ["unsafe_named", "unsafe_handle", "missing_named", "failed_close", "cancel"]) await t.test(kind, async () => {
    const f = fixture(); await f.discover(); f.reset();
    const controller = new AbortController();
    if (kind === "unsafe_named") f.state.unsafeNamed = true;
    if (kind === "unsafe_handle") f.state.unsafeHandle = true;
    if (kind === "missing_named") f.state.onNamedStat = () => { throw Object.assign(Error("synthetic_missing"), { code: "ENOENT" }); };
    if (kind === "failed_close") f.state.failClose = true;
    if (kind === "cancel") f.state.onNamedStat = () => controller.abort();
    if (kind === "cancel") await assert.rejects(f.discover({ signal: controller.signal }), { name: "AbortError" });
    else await assert.rejects(f.discover(), { code: "codex_log_source_changed" });
    assert.equal(f.counters.opens, f.counters.closes);
    f.state.unsafeNamed = false; f.state.unsafeHandle = false; f.state.failClose = false; f.state.onNamedStat = null;
    f.reset(); await f.discover(); assert.ok(f.counters.bytes > 0);
  });
});

test("resource limits still abort warm proofs and short reads never seed", async () => {
  const f = fixture(); await f.discover(); f.reset();
  const limit = Object.assign(Error("synthetic_limit"), { code: "export_resource_elapsed_time" });
  await assert.rejects(f.discover({ resourceGuard: { observeDirectoryEntry() {}, checkRuntime() { throw limit; } } }), error => error === limit);
  const original = f.filesystem.openReadOnlyNoFollow;
  // Create a new scanner so the modified port is the reviewed port snapshot.
  const scanner = createCodexLogScanner({ filesystem: { ...f.filesystem,
    async openReadOnlyNoFollow(path) {
      const handle = await original(path);
      return { ...handle, async read(...args) { const read = await handle.read(...args); return { ...read, bytesRead: read.bytesRead - 1 }; } };
    },
  }, lineReader: f.lineReader });
  await assert.rejects(scanner.discoverCodexRolloutInfos({ codexHome: HOME, startAt: "2026-07-30T10:00:00.000Z" }),
    { code: "codex_log_source_changed" });
});

test("an out-of-range cutoff requires stable final dependency state before quarantine", async () => {
  const f=fixture();
  f.files.get(f.childPaths[0]).bytes=Buffer.from(`${metadata({bytes:f.parentBytes.length+1,lines:3})}\n`);
  let named=0;
  f.state.onNamedStat=file=>{if(++named===2)file.ctimeNs++;};
  await assert.rejects(f.discover(),{code:"codex_log_source_changed"});
  f.state.onNamedStat=null;
  assert.equal((await f.discover()).receipt.status,"partial");
});

test("stable lineage failures report fixed subcodes without changing the durable receipt", async t => {
  const cases = [
    ["lineage_cutoff_out_of_bounds", f => ({ bytes: f.parentBytes.length + 1, lines: 3 })],
    ["lineage_cutoff_boundary_invalid", f => ({ bytes: f.parentBytes.length - 1, lines: 2 })],
    ["lineage_cutoff_line_count_mismatch", f => ({ bytes: f.parentBytes.length, lines: 3 })],
    ["lineage_cutoff_ordinal_invalid", f => ({ bytes: f.parentBytes.length, lines: 0 })],
    ["lineage_base_invalid", () => ({ bytes: -1, lines: 2 })],
    ["lineage_replacement_mode_invalid", () => null],
  ];
  for (const [code, base] of cases) await t.test(code, async () => {
    const f = fixture();
    f.files.get(f.childPaths[0]).bytes = Buffer.from(`${metadata(base(f))}\n`);
    const codes = [];
    const actual = await f.discover({ onLineageDiagnostic: code => codes.push(code) });
    assert.deepEqual(codes, [code]);
    assert.deepEqual(actual.receipt.reasonCounts, { codex_rollout_lineage_invalid: 1 });
    const withoutObserver = await f.discover();
    assert.deepEqual(actual, withoutObserver, "diagnostics do not enter receipts or proof identity");
    for (const observer of [() => { throw Error("synthetic-private-content"); },
      async () => { throw Error("synthetic-private-content"); }]) {
      assert.deepEqual(await f.discover({ onLineageDiagnostic: observer }), actual);
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.doesNotMatch(JSON.stringify(codes), /synthetic|rollout|11111111|22222222/);
  });
  await t.test("missing parent", async () => {
    const f = fixture(), codes = []; f.files.delete(f.parentPath);
    assert.equal((await f.discover({ onLineageDiagnostic: code => codes.push(code) })).receipt.status, "partial");
    assert.deepEqual(codes, ["lineage_parent_missing"]);
  });
  await t.test("invalid reset ordinal", async () => {
    const f = fixture(), codes = [];
    const record = JSON.parse(metadata()); record.ordinal = 1; record.payload.history_mode = "paginated";
    f.files.get(f.childPaths[0]).bytes = Buffer.from(`${JSON.stringify(record)}\n`);
    await f.discover({ onLineageDiagnostic: code => codes.push(code) });
    assert.deepEqual(codes, ["lineage_reset_invalid"]);
  });
});

test("graph diagnostics distinguish absent metadata, ambiguous parents, cycles and invalid dependencies", async t => {
  const other = "33333333-3333-4333-8333-333333333333";
  for (const kind of ["metadata_missing", "parent_ambiguous", "physical_cycle", "logical_cycle", "dependency_invalid"]) {
    await t.test(kind, async () => {
      const f = fixture(), codes = [];
      const parent = JSON.parse(metadata());
      const otherPath = posix.join(HOME, "sessions", `rollout-2026-07-30T12-00-00-${other}.jsonl`);
      if (kind === "metadata_missing") f.add(posix.join(HOME, "sessions", "synthetic-missing.jsonl"), '{"type":"synthetic_noop"}\n');
      if (kind === "parent_ambiguous") {
        const reset = JSON.parse(metadata()); reset.payload.history_mode = "paginated";
        f.add(posix.join(HOME, "sessions", `rollout-2026-07-30T12-00-00-${THREAD}_${other}.jsonl`), `${JSON.stringify(reset)}\n`);
        const child = JSON.parse(metadata(null, other)); child.payload.parent_thread_id = THREAD;
        f.add(otherPath, `${JSON.stringify(child)}\n`);
      }
      if (kind === "physical_cycle") {
        parent.payload.history_mode = "paginated";
        parent.payload.history_base = { thread_id: REPLACEMENT, end_byte_offset: 0, end_ordinal_exclusive: 0 };
        f.files.get(f.parentPath).bytes = Buffer.from(`${JSON.stringify(parent)}\n`);
      }
      if (kind === "logical_cycle") {
        parent.payload.parent_thread_id = other;
        const bytes = Buffer.from(`${JSON.stringify(parent)}\n`);
        f.files.get(f.parentPath).bytes = bytes;
        f.files.get(f.childPaths[0]).bytes = Buffer.from(`${metadata({ bytes: bytes.length, lines: 1 })}\n`);
        const child = JSON.parse(metadata(null, other)); child.payload.parent_thread_id = THREAD;
        f.add(otherPath, `${JSON.stringify(child)}\n`);
      }
      if (kind === "dependency_invalid") {
        parent.payload.history_base = {};
        const bytes = Buffer.from(`${JSON.stringify(parent)}\n`);
        f.files.get(f.parentPath).bytes = bytes;
        f.add(otherPath, `${metadata({ bytes: bytes.length, lines: 1 }, other)}\n`);
      }
      assert.equal((await f.discover({ onLineageDiagnostic: code => codes.push(code) })).receipt.status, "partial");
      const expected = kind === "logical_cycle" ? ["lineage_logical_cycle", "lineage_logical_cycle"]
        : kind === "dependency_invalid" ? ["lineage_base_invalid", "lineage_dependency_invalid"] : [`lineage_${kind}`];
      assert.deepEqual(codes.sort(), expected.sort());
      assert.doesNotMatch(JSON.stringify(codes), /synthetic|rollout|11111111|22222222|33333333/);
      if (kind === "metadata_missing") {
        f.files.get(posix.join(HOME, "sessions", "synthetic-missing.jsonl")).mtimeNs = NS - 86_400_000_000_000n;
        codes.length = 0;
        assert.equal((await f.discover({ onLineageDiagnostic: code => codes.push(code) })).receipt.status, "complete");
        assert.deepEqual(codes, [], "an unrelated old invalid group is outside this diagnostic receipt");
      }
    });
  }
});

test("transient cutoff diagnostics distinguish changed, open, read, short-read and close failures", async t => {
  for (const kind of ["changed", "open_failed", "read_failed", "short_read", "close_failed"]) await t.test(kind, async () => {
    const f = fixture(), codes = [];
    const first = await f.discover(); f.cacheInspections(first);
    const openOriginal = f.filesystem.openReadOnlyNoFollow;
    const filesystem = { ...f.filesystem, async openReadOnlyNoFollow(path) {
      if (kind === "open_failed") throw Error("synthetic-private-open");
      const handle = await openOriginal(path);
      if (kind === "read_failed") return { ...handle, async stat() { throw Error("synthetic-private-stat"); } };
      if (kind === "short_read") return { ...handle, async read(...args) {
        const result = await handle.read(...args); return { ...result, bytesRead: result.bytesRead - 1 };
      } };
      return handle;
    } };
    if (kind === "changed") f.state.onRead = file => { file.ctimeNs++; };
    if (kind === "close_failed") f.state.failClose = true;
    // New scanner and cached inspections isolate the cutoff reader from headers.
    const scanner = createCodexLogScanner({ filesystem, lineReader: f.lineReader });
    const options = { codexHome: HOME, startAt: "2026-07-30T10:00:00.000Z",
      inspectionCache: info => first.infos.find(x => x.path === info.path),
      onLineageDiagnostic: code => codes.push(code) };
    await assert.rejects(scanner.discoverCodexRolloutInfos(options), { code: "codex_log_source_changed" });
    assert.deepEqual(codes, [`lineage_parent_${kind}`]);
    assert.doesNotMatch(JSON.stringify(codes), /synthetic|rollout|11111111|22222222/);
    if (kind !== "open_failed") assert.equal(f.counters.opens, f.counters.closes);
  });
});

test("the process-local proof cache evicts beyond its fixed entry bound", async () => {
  const f = fixture({ cutoffs: 2049 });
  assert.equal((await f.discover()).receipt.status, "complete");
  for (const path of f.childPaths.slice(1)) f.files.get(path).mtimeNs = NS - 86_400_000_000_000n;
  f.reset(); await f.discover();
  assert.ok(f.counters.bytes > 0, "the first of 2049 keys was evicted");
  f.reset(); await f.discover(); assert.equal(f.counters.bytes, 0);
});

test("cutoff cleanup cannot replace a resource limit or cancellation with a retry", async t => {
  for (const kind of ["resource", "abort"]) await t.test(kind, async () => {
    const f = fixture(), codes = [];
    const first = await f.discover();
    const control = kind === "resource"
      ? Object.assign(Error("synthetic-private-limit"), { code: "export_resource_elapsed_time" })
      : Object.assign(Error("synthetic-private-abort"), { name: "AbortError", code: "ABORT_ERR" });
    const scanner = createCodexLogScanner({ filesystem: { ...f.filesystem,
      async openReadOnlyNoFollow(path) {
        const handle = await f.filesystem.openReadOnlyNoFollow(path);
        return { ...handle, async read() { throw control; } };
      },
    }, lineReader: f.lineReader });
    f.state.failClose = true;
    await assert.rejects(scanner.discoverCodexRolloutInfos({ codexHome: HOME, startAt: "2026-07-30T10:00:00.000Z",
      inspectionCache: info => first.infos.find(x => x.path === info.path),
      onLineageDiagnostic: code => codes.push(code) }), error => error === control);
    assert.deepEqual(codes, []);
    assert.equal(f.counters.opens, f.counters.closes);
  });
});

test("shared rejected cutoffs read once per discovery but are retried in the next pass", async t => {
  for (const compressed of [false, true]) for (const mode of ["exact", "number"]) {
    await t.test(`${compressed ? "compressed" : "plain"} ${mode}`, {
      skip: compressed && !supportsCompressedRollouts(),
    }, async () => {
      const f = fixture({ compressed });
      f.state.statMode = mode;
      f.files.delete(f.childPaths[0]);
      for (let index = 1; index <= 32; index++) {
        const id = `${index.toString(16).padStart(8, "0")}-3333-4333-8333-333333333333`;
        const path = posix.join(HOME, "sessions", `rollout-2026-07-30T12-00-00-${id}.jsonl`);
        // Each child owns a different logical group, but all reference the
        // same incorrect line count for one fully read parent prefix.
        f.add(path, `${metadata({ bytes: f.parentBytes.length, lines: 3 }, id)}\n`);
      }
      const first = await f.discover();
      assert.equal(first.receipt.status, "partial");
      if (compressed) assert.equal(f.counters.decoderCalls, 1);
      else assert.equal(f.counters.bytes, f.parentBytes.length);
      f.cacheInspections(first); f.reset();
      const codes = [];
      const next = await f.discover({ onLineageDiagnostic: code => codes.push(code) });
      assert.equal(next.receipt.status, "partial");
      assert.deepEqual(codes, Array(32).fill("lineage_cutoff_line_count_mismatch"), "shared rejection retains its cause");
      assert.equal(f.counters.opens, 1);
      assert.equal(f.counters.closes, 1);
      if (compressed) assert.equal(f.counters.decoderCalls, 1);
      else assert.equal(f.counters.bytes, f.parentBytes.length);
    });
  }
});

test("the Node lstat port forwards bigint options instead of returning coarse metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "cutoff-port-"));
  const path = join(root, "source.jsonl");
  try {
    await writeFile(path, "{}\n");
    const ports = createLocalCodexLogPorts({ environment: {}, homeDirectory: root });
    const named = await ports.filesystem.lstatPath(path, { bigint: true });
    const handle = await open(path, "r");
    try {
      const held = await handle.stat({ bigint: true });
      for (const key of ["dev", "ino", "size", "birthtimeNs", "mtimeNs", "ctimeNs"]) {
        assert.equal(typeof named[key], "bigint"); assert.equal(named[key], held[key]);
      }
    } finally { await handle.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("compressed cutoff proofs skip decoding only after the complete decoder has succeeded", {
  skip: !supportsCompressedRollouts(),
}, async () => {
  const f = fixture({ compressed: true });
  const first = await f.discover();
  assert.equal(first.receipt.status, "complete");
  assert.equal(f.counters.decoderCalls, 1);
  assert.equal(f.counters.completedDecoders, 1);
  assert.equal(f.counters.logicalBytes, f.parentBytes.length);
  f.cacheInspections(first); f.reset();
  const second = await f.discover();
  assert.deepEqual(second, first);
  assert.equal(f.counters.bytes, 0);
  assert.equal(f.counters.decoderCalls, 0);
  assert.equal(f.counters.logicalBytes, 0);
  assert.equal(f.counters.opens, 1); assert.equal(f.counters.closes, 1);
  assert.equal(f.counters.ordinaryStats, 1);
  assert.equal(f.counters.exactStats, 2); assert.equal(f.counters.namedStats, 2);
});

test("compressed mutations, truncation, close failure and unsupported precision cannot reuse old proofs", {
  skip: !supportsCompressedRollouts(),
}, async t => {
  for (const kind of ["mutation", "truncation", "failed_close", "number", "no_ns"]) await t.test(kind, async () => {
    const f = fixture({ compressed: true }); const first = await f.discover();
    f.cacheInspections(first); f.reset();
    const original = Buffer.from(f.parent.bytes);
    if (kind === "mutation") {
      const changed = Buffer.from(f.parentBytes); changed[300] = 0x79;
      f.parent.bytes = zlib.zstdCompressSync(changed); f.parent.ctimeNs++;
    }
    if (kind === "truncation") { f.parent.bytes = f.parent.bytes.subarray(0, -1); f.parent.ctimeNs++; }
    if (kind === "failed_close") f.state.failClose = true;
    if (["number", "no_ns"].includes(kind)) f.state.statMode = kind;
    if (kind === "failed_close") await assert.rejects(f.discover(), { code: "codex_log_source_changed" });
    else {
      const actual = await f.discover();
      assert.equal(actual.receipt.status, kind === "truncation" ? "partial" : "complete");
    }
    if (kind !== "failed_close") assert.ok(f.counters.decoderCalls > 0);
    f.state.failClose = false; f.state.statMode = "exact";
    f.parent.bytes = original; f.parent.ctimeNs++;
    f.reset(); await f.discover();
    assert.ok(f.counters.decoderCalls > 0, "a failed or changed proof cannot seed restored bytes");
    f.reset(); await f.discover(); assert.equal(f.counters.decoderCalls, 0);
  });
});

test("a compressed decoder failure after its final yielded prefix never seeds a proof", {
  skip: !supportsCompressedRollouts(),
}, async () => {
  const f = fixture({ compressed: true });
  // The original inspector validates the full synthetic compressed stream; this
  // separate cutoff iterator fails after yielding an otherwise valid prefix.
  let fail = true;
  const scanner = createCodexLogScanner({ filesystem: f.filesystem, lineReader: {
    ...f.lineReader,
    async *readCompressedRolloutBytes(source, options) {
      yield* f.lineReader.readCompressedRolloutBytes(source, options);
      if (fail) throw Object.assign(Error("synthetic_decoder_failure"), { code: "codex_rollout_content_invalid" });
    },
  } });
  const options = { codexHome: HOME, startAt: "2026-07-30T10:00:00.000Z" };
  const codes = [];
  const rejected = await scanner.discoverCodexRolloutInfos({ ...options, onLineageDiagnostic: code => codes.push(code) });
  assert.equal(scanner.codexRolloutDiscoveryReceipt(rejected).status, "partial");
  assert.deepEqual(codes, ["lineage_parent_content_invalid"]);
  fail = false; f.reset();
  const complete = await scanner.discoverCodexRolloutInfos(options);
  assert.equal(scanner.codexRolloutDiscoveryReceipt(complete).status, "complete");
  assert.equal(f.counters.decoderCalls, 1);
});

test("a stable short decoded prefix reports truncation rather than a positional short read", {
  skip: !supportsCompressedRollouts(),
}, async () => {
  const f = fixture({ compressed: true }), codes = [];
  const scanner = createCodexLogScanner({ filesystem: f.filesystem, lineReader: { ...f.lineReader,
    async *readCompressedRolloutBytes(source, options) {
      for await (const chunk of f.lineReader.readCompressedRolloutBytes(source, options)) yield chunk.subarray(0, chunk.length - 1);
    },
  } });
  const infos = await scanner.discoverCodexRolloutInfos({ codexHome: HOME, startAt: "2026-07-30T10:00:00.000Z",
    onLineageDiagnostic: code => codes.push(code) });
  assert.equal(scanner.codexRolloutDiscoveryReceipt(infos).status, "partial");
  assert.deepEqual(codes, ["lineage_cutoff_truncated"]);
});

test("actual Node handle and named bigint metadata allow unchanged plain source reuse", async () => {
  const root = await mkdtemp(join(tmpdir(), "cutoff-real-ports-"));
  const sessions = join(root, "sessions");
  const parentPath = join(sessions, NAME);
  const bytes = Buffer.from(`${metadata()}\n${"x".repeat(16_000)}\n`);
  let opens = 0, closes = 0, readBytes = 0;
  try {
    await mkdir(sessions);
    await writeFile(parentPath, bytes);
    await writeFile(join(sessions, CHILD_NAME), `${metadata({ bytes: bytes.length, lines: 2 })}\n`);
    const ports = createLocalCodexLogPorts({ environment: {}, homeDirectory: root });
    const scanner = createCodexLogScanner({ ...ports, filesystem: { ...ports.filesystem,
      async openReadOnlyNoFollow(path) {
        const handle = await ports.filesystem.openReadOnlyNoFollow(path);
        opens++;
        return { fd: handle.fd, stat: options => handle.stat(options),
          async read(...args) { const result = await handle.read(...args); readBytes += result.bytesRead; return result; },
          async close() { closes++; await handle.close(); },
        };
      },
    } });
    const options = { codexHome: root, startAt: "1970-01-01T00:00:00.000Z" };
    const first = await scanner.discoverCodexRolloutInfos(options);
    assert.equal(scanner.codexRolloutDiscoveryReceipt(first).status, "complete");
    assert.equal(readBytes, bytes.length);
    readBytes = 0;
    const second = await scanner.discoverCodexRolloutInfos(options);
    assert.deepEqual(second, first);
    assert.equal(readBytes, 0);
    assert.equal(opens, 2); assert.equal(closes, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
