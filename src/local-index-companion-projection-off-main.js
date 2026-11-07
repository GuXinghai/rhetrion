import { Worker } from "node:worker_threads";

import { readLocalIndexCompanionProjection } from "./local-index-companion-source.js";

import {
  LOCAL_INDEX_COMPANION_PROJECTION_ABORT_ERROR,
  LOCAL_INDEX_COMPANION_PROJECTION_WORKER_CONTRACT,
  LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR,
  safeLocalIndexCompanionWorkerError,
  validLocalIndexCompanionWorkerOptions,
  validLocalIndexCompanionWorkerResult,
  validLocalIndexCompanionWorkerTimings,
} from "./local-index-companion-projection-off-main-worker.js";

const SETTLEMENT_TIMEOUT_MS = 500;
const MAXIMUM_ACTIVE_READS = 2;
const fixedError = code => Object.assign(new Error(code), { code });
const abortError = () => fixedError(LOCAL_INDEX_COMPANION_PROJECTION_ABORT_ERROR);
const workerError = () => fixedError(LOCAL_INDEX_COMPANION_PROJECTION_WORKER_ERROR);
const exactKeys = (value, keys) => value !== null && typeof value === "object"
  && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const validSignal = signal => signal === null || signal !== null && typeof signal === "object"
  && typeof signal.aborted === "boolean" && typeof signal.addEventListener === "function"
  && typeof signal.removeEventListener === "function";

function selectOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)
      || options.includeWorkUsage === true
      || options.monotonicClock !== undefined && typeof options.monotonicClock !== "function"
      || options.onTiming !== undefined && options.onTiming !== null && typeof options.onTiming !== "function") {
    throw new TypeError("companion projection options are invalid");
  }
  const selected = {
    indexFile: options.indexFile,
    nowMs: options.nowMs ?? Date.now(),
    declaredSpeedBaselines: Array.isArray(options.declaredSpeedBaselines) ? options.declaredSpeedBaselines : [],
    mode: options.mode ?? "full",
  };
  // Refresh orchestration supplies its clock even in production. The worker
  // owns an independent monotonic clock; the caller's function stays local
  // and continues to time the enclosing snapshot span.
  if (!validLocalIndexCompanionWorkerOptions(selected)) {
    throw new TypeError("companion projection options are invalid");
  }
  return selected;
}

/** Run only the closed companion projection; private work metadata stays out. */
export async function readLocalIndexCompanionProjectionOffMain(options = {}, {
  signal = null, WorkerClass = Worker,
} = {}) {
  const selected = selectOptions(options);
  if (!validSignal(signal) || typeof WorkerClass !== "function") {
    throw new TypeError("companion projection controls are invalid");
  }
  if (signal?.aborted) throw abortError();
  if (selected.mode === "deferred") {
    return readLocalIndexCompanionProjection({ ...selected, includeWorkUsage: false, signal });
  }
  let worker;
  try {
    worker = new WorkerClass(new URL("./local-index-companion-projection-off-main-worker.js", import.meta.url), {
      workerData: { contract: LOCAL_INDEX_COMPANION_PROJECTION_WORKER_CONTRACT, options: selected },
      execArgv: [],
    });
  } catch {
    throw workerError();
  }
  return new Promise((resolve, reject) => {
    let terminal = null;
    let settled = false;
    let exited = false;
    let timer = null;
    let terminating = false;
    const terminate = () => {
      if (terminating) return;
      terminating = true;
      try { Promise.resolve(worker.terminate()).catch(() => {}); } catch { /* Fixed terminal error below. */ }
    };
    const settle = () => {
      if (settled || terminal === null) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (timer !== null) clearTimeout(timer);
      if (terminal.error) reject(terminal.error);
      else {
        for (const span of terminal.timings) {
          try { Promise.resolve(options.onTiming?.(Object.freeze({ ...span }))).catch(() => {}); }
          catch { /* Diagnostics never alter projection or shutdown. */ }
        }
        resolve(terminal.result);
      }
    };
    const armSettlement = () => {
      if (timer !== null || settled || exited) return;
      timer = setTimeout(() => {
        if (settled || exited) return;
        if (!terminal?.error) terminal = { error: workerError() };
        terminate();
        settle();
      }, SETTLEMENT_TIMEOUT_MS);
    };
    const fail = error => {
      if (settled) return;
      if (!terminal?.error) terminal = { error };
      armSettlement();
      terminate();
      if (exited) settle();
    };
    const abort = () => fail(abortError());
    signal?.addEventListener("abort", abort, { once: true });
    worker.on("message", message => {
      if (settled) return;
      if (terminal !== null) { if (!terminal.error) fail(workerError()); return; }
      if (exactKeys(message, ["type", "result", "timings"]) && message.type === "result"
          && validLocalIndexCompanionWorkerResult(message.result)
          && validLocalIndexCompanionWorkerTimings(message.timings)) {
        terminal = { result: message.result, timings: message.timings };
        armSettlement();
      } else if (exactKeys(message, ["type", "code"]) && message.type === "error") {
        terminal = { error: fixedError(safeLocalIndexCompanionWorkerError(message.code)) };
        armSettlement();
      } else fail(workerError());
    });
    worker.on("error", () => fail(workerError()));
    worker.on("exit", code => {
      exited = true;
      if (terminal === null || code !== 0 && !terminal.error) terminal = { error: workerError() };
      settle();
    });
    // Covers cancellation from a WorkerClass constructor or between its first
    // check and listener registration; never hand a cancelled caller a result.
    if (signal?.aborted) abort();
  });
}

/** One backend's lifecycle; the existing projection cache owns key sharing. */
export function createLocalIndexCompanionProjectionReader({ WorkerClass = Worker } = {}) {
  if (typeof WorkerClass !== "function") throw new TypeError("companion projection WorkerClass is invalid");
  const active = new Set();
  let closed = false;
  let closing = null;
  const read = async (options = {}, controls = {}) => {
    if (closed) throw abortError();
    if (!controls || typeof controls !== "object" || Array.isArray(controls)) {
      throw new TypeError("companion projection controls are invalid");
    }
    const signal = controls.signal ?? null;
    if (!validSignal(signal)) throw new TypeError("companion projection signal is invalid");
    if (signal?.aborted) throw abortError();
    if (active.size >= MAXIMUM_ACTIVE_READS) throw workerError();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const entry = { controller, pending: null };
    entry.pending = readLocalIndexCompanionProjectionOffMain(options, { signal: controller.signal, WorkerClass });
    active.add(entry);
    try { return await entry.pending; }
    finally { active.delete(entry); signal?.removeEventListener("abort", abort); }
  };
  read.close = () => {
    if (closing !== null) return closing;
    closed = true;
    const reads = [...active];
    for (const entry of reads) entry.controller.abort();
    closing = Promise.allSettled(reads.map(entry => entry.pending)).then(() => {});
    return closing;
  };
  return read;
}
