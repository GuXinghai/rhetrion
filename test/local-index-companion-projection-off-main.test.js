import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import test from "node:test";

import { readLocalIndexCompanionProjection } from "../src/local-index-companion-source.js";
import {
  createLocalIndexCompanionProjectionReader,
  readLocalIndexCompanionProjectionOffMain,
} from "../src/local-index-companion-projection-off-main.js";
import {
  LOCAL_INDEX_COMPANION_PROJECTION_ABORT_ERROR,
  LOCAL_INDEX_COMPANION_PROJECTION_WORKER_CONTRACT,
  LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR,
  runLocalIndexCompanionProjectionWorkerThread,
} from "../src/local-index-companion-projection-off-main-worker.js";
import { refreshLocalIndex } from "../src/local-index-refresh.js";
import { createWorkspace } from "./helpers/local-index-facts.js";
import { collectRuntimeGraph } from "../scripts/lib/runtime-closure.mjs";

const NOW_MS = Date.parse("2026-09-01T01:00:00.000Z");
const OPTIONS = { indexFile: "synthetic-unused.sqlite", nowMs: NOW_MS, declaredSpeedBaselines: [], mode: "full" };
const WORKER_ERROR = LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR;
const ABORT_ERROR = LOCAL_INDEX_COMPANION_PROJECTION_ABORT_ERROR;
const CANARY = "PRIVATE-WORKER-CANARY-raw-payload";
const immediate = () => new Promise(setImmediate);
const comparable = value => {
  const copy = structuredClone(value);
  delete copy.readWallMs;
  return copy;
};
const assertFixed = code => error => error.code === code && error.message === code
  && !JSON.stringify({ message: error.message, code: error.code }).includes(CANARY);

async function missingResult() {
  return readLocalIndexCompanionProjection({ ...OPTIONS, mode: "deferred" });
}

test("the real worker preserves synthetic companion figures and leaves the parent event loop available", async () => {
  const workspace = createWorkspace({ variety: true, files: 4, events: 600, days: 6, seed: 73 });
  try {
    const indexFile = join(workspace.state, "worker.sqlite");
    await refreshLocalIndex({ indexFile, codexHome: workspace.codexHome,
      secretFile: workspace.secretFile, workerCount: 1 });
    const options = { ...OPTIONS, indexFile };
    const direct = await readLocalIndexCompanionProjection(options);
    const stages = [];
    let exited = false;
    let heartbeats = 0;
    class TrackingWorker extends Worker {
      constructor(...args) { super(...args); this.on("exit", () => { exited = true; }); }
    }
    const heartbeat = setInterval(() => { heartbeats++; }, 1);
    let actual;
    try {
      actual = await readLocalIndexCompanionProjectionOffMain({ ...options,
        onTiming: span => stages.push(span),
      }, { WorkerClass: TrackingWorker });
    } finally { clearInterval(heartbeat); }
    assert.equal(exited, true, "delivery waits for the real worker to exit");
    assert.ok(heartbeats > 0, "worker startup/projection yields the parent loop");
    assert.deepEqual(comparable(actual), comparable(direct));
    assert.ok(stages.some(span => span.stage === "projection_report"));
    assert.ok(stages.every(span => Object.keys(span).sort().join() === "outcome,stage,wallMs"));
    const serialized = JSON.stringify(actual);
    assert.equal(serialized.includes(workspace.root), false);
    assert.equal(serialized.includes(workspace.codexHome), false);
    assert.equal(Object.hasOwn(actual, "workUsage"), false);

    const writer = new DatabaseSync(indexFile);
    try { writer.exec("DELETE FROM rollup_context_start"); } finally { writer.close(); }
    const staleDirect = await readLocalIndexCompanionProjection(options);
    const staleWorker = await readLocalIndexCompanionProjectionOffMain(options);
    assert.equal(staleWorker.status, "unavailable");
    assert.equal(staleWorker.errorCode, "local_index_rollup_basis_stale");
    assert.deepEqual(staleWorker, staleDirect);
  } finally { workspace.cleanup(); }
});

test("missing and invalid stores retain direct outcomes; deferred reads spawn no worker", async () => {
  const workspace = createWorkspace({ files: 1, events: 5, days: 1, seed: 74 });
  try {
    const options = { ...OPTIONS, indexFile: join(workspace.state, "absent.sqlite") };
    assert.deepEqual(await readLocalIndexCompanionProjectionOffMain(options),
      await readLocalIndexCompanionProjection(options));
    assert.deepEqual(await readLocalIndexCompanionProjectionOffMain({ ...options, indexFile: workspace.state }),
      await readLocalIndexCompanionProjection({ ...options, indexFile: workspace.state }));
    class UnexpectedWorker { constructor() { assert.fail("deferred must not spawn"); } }
    assert.deepEqual(await readLocalIndexCompanionProjectionOffMain({ ...options, mode: "deferred" },
      { WorkerClass: UnexpectedWorker }), await readLocalIndexCompanionProjection({ ...options, mode: "deferred" }));
  } finally { workspace.cleanup(); }
});

test("companion worker input is narrowed and refuses malformed baselines and controls", async () => {
  const result = await missingResult();
  let captured;
  class CapturingWorker extends EventEmitter {
    constructor(url, options) {
      super(); captured = { url, options };
      queueMicrotask(() => { this.emit("message", { type: "result", result, timings: [] }); this.emit("exit", 0); });
    }
  }
  await readLocalIndexCompanionProjectionOffMain({ ...OPTIONS, codexHome: CANARY, secretFile: CANARY,
    onTiming() {}, private: CANARY }, { WorkerClass: CapturingWorker });
  assert.equal(String(captured.url).endsWith("local-index-companion-projection-off-main-worker.js"), true);
  assert.deepEqual(captured.options.execArgv, []);
  assert.equal(captured.options.workerData.contract, LOCAL_INDEX_COMPANION_PROJECTION_WORKER_CONTRACT);
  assert.deepEqual(captured.options.workerData.options, OPTIONS);
  assert.equal(JSON.stringify(captured.options).includes(CANARY), false);
  for (const options of [
    { ...OPTIONS, onTiming: 1 },
    { ...OPTIONS, nowMs: NaN }, { ...OPTIONS, mode: "unreviewed" },
    { ...OPTIONS, monotonicClock: 1 },
    { ...OPTIONS, declaredSpeedBaselines: [{ mode: "standard", firstSeenAt: "bad", lastSeenAt: "bad" }] },
    { ...OPTIONS, declaredSpeedBaselines: [{ mode: "standard", firstSeenAt: new Date(NOW_MS).toISOString(),
      lastSeenAt: new Date(NOW_MS).toISOString(), private: CANARY }] },
  ]) await assert.rejects(readLocalIndexCompanionProjectionOffMain(options), TypeError);
  await assert.rejects(readLocalIndexCompanionProjectionOffMain(OPTIONS, { signal: {} }), TypeError);
  await assert.rejects(readLocalIndexCompanionProjectionOffMain(OPTIONS, { WorkerClass: null }), TypeError);
  await readLocalIndexCompanionProjectionOffMain({ ...OPTIONS, declaredSpeedBaselines: null }, { WorkerClass: CapturingWorker });
  assert.deepEqual(captured.options.workerData.options.declaredSpeedBaselines, []);
});

test("success waits for exit zero and isolates validated timing observers", async () => {
  const result = await missingResult();
  let instance;
  class ManualWorker extends EventEmitter {
    constructor() { super(); instance = this; }
    terminate() { this.emit("exit", 1); return Promise.resolve(1); }
  }
  let delivered = false;
  const reading = readLocalIndexCompanionProjectionOffMain({ ...OPTIONS,
    onTiming: () => { throw Error(CANARY); },
  }, { WorkerClass: ManualWorker }).then(value => { delivered = true; return value; });
  instance.emit("message", { type: "result", result, timings: [{ stage: "projection_report", wallMs: 3, outcome: "completed" }] });
  await immediate();
  assert.equal(delivered, false);
  instance.emit("exit", 0);
  assert.deepEqual(await reading, result);
});

test("malformed framing, result, timing and exits produce fixed content-free errors", async (t) => {
  const result = await missingResult();
  for (const [name, message, exit] of [
    ["expanded frame", { type: "result", result, timings: [], private: CANARY }, 0],
    ["expanded result", { type: "result", result: { ...result, privateRow: CANARY }, timings: [] }, 0],
    ["raw result", { type: "result", result: { privateRow: CANARY }, timings: [] }, 0],
    ["unknown timing", { type: "result", result, timings: [{ stage: CANARY, wallMs: 1, outcome: "completed" }] }, 0],
    ["expanded timing", { type: "result", result, timings: [{ stage: "projection_report", wallMs: 1, outcome: "completed", private: CANARY }] }, 0],
    ["raw error", { type: "error", code: CANARY }, 0],
    ["nonzero success exit", { type: "result", result, timings: [] }, 1],
    ["empty zero exit", null, 0],
  ]) await t.test(name, async () => {
    class InvalidWorker extends EventEmitter {
      constructor() { super(); queueMicrotask(() => { if (message) this.emit("message", message); this.emit("exit", exit); }); }
      terminate() { return Promise.resolve(1); }
    }
    await assert.rejects(readLocalIndexCompanionProjectionOffMain(OPTIONS, { WorkerClass: InvalidWorker }), assertFixed(WORKER_ERROR));
  });
  class ThrowingWorker { constructor() { throw Error(CANARY); } }
  await assert.rejects(readLocalIndexCompanionProjectionOffMain(OPTIONS, { WorkerClass: ThrowingWorker }), assertFixed(WORKER_ERROR));
});

test("duplicate terminal output and worker errors cannot promote success", async () => {
  const result = await missingResult();
  for (const errorEvent of [false, true]) {
    class DuplicateWorker extends EventEmitter {
      constructor() { super(); queueMicrotask(() => {
        this.emit("message", { type: "result", result, timings: [] });
        if (errorEvent) this.emit("error", Error(CANARY));
        else this.emit("message", { type: "result", result, timings: [] });
        this.emit("exit", 0);
      }); }
      terminate() { return Promise.resolve(1); }
    }
    await assert.rejects(readLocalIndexCompanionProjectionOffMain(OPTIONS, { WorkerClass: DuplicateWorker }), assertFixed(WORKER_ERROR));
  }
});

test("abort before spawn, during construction and after result preserves cancellation", async () => {
  const result = await missingResult();
  const before = new AbortController(); before.abort();
  class UnexpectedWorker { constructor() { assert.fail("pre-aborted reads must not spawn"); } }
  await assert.rejects(readLocalIndexCompanionProjectionOffMain(OPTIONS,
    { signal: before.signal, WorkerClass: UnexpectedWorker }), assertFixed(ABORT_ERROR));
  for (const afterResult of [false, true]) {
    const controller = new AbortController();
    let terminations = 0;
    class AbortedWorker extends EventEmitter {
      constructor() {
        super();
        if (afterResult) queueMicrotask(() => {
          this.emit("message", { type: "result", result, timings: [] }); controller.abort();
        });
        else controller.abort();
      }
      terminate() { terminations++; queueMicrotask(() => { this.emit("error", Error(CANARY)); this.emit("exit", 1); }); return Promise.resolve(1); }
    }
    await assert.rejects(readLocalIndexCompanionProjectionOffMain(OPTIONS,
      { signal: controller.signal, WorkerClass: AbortedWorker }), assertFixed(ABORT_ERROR));
    assert.equal(terminations, 1);
  }
});

test("the real worker is terminated on cancellation without touching a live profile", async () => {
  const workspace = createWorkspace({ files: 1, events: 5, days: 1, seed: 75 });
  let terminated = 0;
  class TrackingWorker extends Worker {
    terminate(...args) { terminated++; return super.terminate(...args); }
  }
  const controller = new AbortController();
  try {
    const reading = readLocalIndexCompanionProjectionOffMain({ ...OPTIONS,
      indexFile: join(workspace.state, "missing.sqlite") }, { signal: controller.signal, WorkerClass: TrackingWorker });
    controller.abort();
    await assert.rejects(reading, assertFixed(ABORT_ERROR));
    assert.equal(terminated, 1);
  } finally { workspace.cleanup(); }
});

test("a success without exit fails within bounded settlement and close drains active reads", async () => {
  const result = await missingResult();
  let terminations = 0;
  class NonClosingWorker extends EventEmitter {
    constructor() { super(); queueMicrotask(() => this.emit("message", { type: "result", result, timings: [] })); }
    terminate() { terminations++; return Promise.resolve(1); }
  }
  await assert.rejects(readLocalIndexCompanionProjectionOffMain(OPTIONS, { WorkerClass: NonClosingWorker }), assertFixed(WORKER_ERROR));
  assert.equal(terminations, 1);
  let active = 0;
  class HangingWorker extends EventEmitter {
    constructor() { super(); active++; }
    terminate() { active--; queueMicrotask(() => this.emit("exit", 1)); return Promise.resolve(1); }
  }
  const reader = createLocalIndexCompanionProjectionReader({ WorkerClass: HangingWorker });
  const reading = reader(OPTIONS);
  const rejected = assert.rejects(reading, assertFixed(ABORT_ERROR));
  assert.equal(active, 1);
  const close = reader.close();
  assert.equal(reader.close(), close);
  await close; await rejected;
  assert.equal(active, 0);
  await assert.rejects(reader(OPTIONS), assertFixed(ABORT_ERROR));
});

test("one backend permits at most two active workers and validates controls before starting", async () => {
  let instances = 0;
  class HangingWorker extends EventEmitter {
    constructor() { super(); instances++; }
    terminate() { queueMicrotask(() => this.emit("exit", 1)); return Promise.resolve(1); }
  }
  const reader = createLocalIndexCompanionProjectionReader({ WorkerClass: HangingWorker });
  await assert.rejects(reader(OPTIONS, null), TypeError);
  await assert.rejects(reader(OPTIONS, { signal: {} }), TypeError);
  assert.equal(instances, 0);
  const first = assert.rejects(reader(OPTIONS), assertFixed(ABORT_ERROR));
  const second = assert.rejects(reader(OPTIONS), assertFixed(ABORT_ERROR));
  await assert.rejects(reader(OPTIONS), assertFixed(WORKER_ERROR));
  assert.equal(instances, 2);
  await reader.close(); await Promise.all([first, second]);
});

test("worker entrypoint rejects expanded inputs and does not claim unrelated worker channels", async () => {
  const output = [];
  let closed = false;
  await runLocalIndexCompanionProjectionWorkerThread({
    port: { postMessage: value => output.push(value), close: () => { closed = true; } },
    data: { contract: LOCAL_INDEX_COMPANION_PROJECTION_WORKER_CONTRACT,
      options: { ...OPTIONS, private: CANARY } },
  });
  assert.deepEqual(output, [{ type: "error", code: WORKER_ERROR }]);
  assert.equal(closed, true);
  const source = `import { parentPort } from 'node:worker_threads'; await import(${JSON.stringify(new URL("../src/local-index-companion-projection-off-main.js", import.meta.url).href)}); parentPort.postMessage({unrelated:true}); parentPort.close();`;
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`),
    { workerData: { contract: "unrelated", private: CANARY }, execArgv: [] });
  const messages = [];
  worker.on("message", value => messages.push(value));
  const [exit] = await once(worker, "exit");
  assert.equal(exit, 0);
  assert.deepEqual(messages, [{ unrelated: true }]);
});

test("the runtime import closure includes the statically linked companion worker", async () => {
  const graph = await collectRuntimeGraph();
  for (const file of ["src/local-index-companion-projection-off-main.js", "src/local-index-companion-projection-off-main-worker.js"]) {
    assert.ok(graph.files.includes(resolve(file)), file);
  }
});
