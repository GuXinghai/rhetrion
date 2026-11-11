import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);

// Internal identity material and process-local broker announcements never
// belong to the research dependency's environment.
const PRIVATE_ENVIRONMENT_KEYS = new Set([
  "USAGE_MONITOR_KEYCHAIN_BROKER_FD", "APP_USAGEMONITOR_ACCOUNT_HMAC_KEY",
]);
const MAXIMUM_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAXIMUM_TIMEOUT_MS = 120_000;
const TERMINATION_TIMEOUT_MS = 1000;
const failure = code => Object.assign(new Error(code), {
  code, ...(code === "ccusage_aborted" ? { name: "AbortError" } : {}),
});

function resolveCcusageBinary() {
  if (process.platform !== "win32" || process.arch !== "x64") throw failure("ccusage_unavailable");
  // The pinned package's JavaScript entrypoint launches another process. Own
  // the actual Windows executable so timeout/cancellation cannot orphan it.
  return require.resolve("@ccusage/ccusage-win32-x64/bin/ccusage.exe", {
    paths: [dirname(require.resolve("ccusage/src/cli.js"))],
  });
}

export function ccusageChildEnv(environment = process.env) {
  const childEnvironment = { ...environment };
  for (const key of Object.keys(childEnvironment)) {
    if (PRIVATE_ENVIRONMENT_KEYS.has(key.toUpperCase())) delete childEnvironment[key];
  }
  return childEnvironment;
}

export async function runCcusageCodexDaily({
  since, until, timezone = "UTC", offline = false, signal = null,
  timeoutMs = MAXIMUM_TIMEOUT_MS, maximumOutputBytes = MAXIMUM_OUTPUT_BYTES,
} = {}, { spawnProcess = spawn, resolveBinary = resolveCcusageBinary } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAXIMUM_TIMEOUT_MS
      || !Number.isSafeInteger(maximumOutputBytes) || maximumOutputBytes < 1 || maximumOutputBytes > MAXIMUM_OUTPUT_BYTES
      || signal !== null && !(signal instanceof AbortSignal)
      || typeof spawnProcess !== "function" || typeof resolveBinary !== "function") {
    throw failure("ccusage_options_invalid");
  }
  if (signal?.aborted) throw failure("ccusage_aborted");
  let binary;
  try { binary = resolveBinary(); } catch { throw failure("ccusage_unavailable"); }
  if (signal?.aborted) throw failure("ccusage_aborted");
  const args = ["codex", "daily", "--since", since, "--until", until, "--timezone", timezone, "--json"];
  if (offline) args.push("--offline");

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(binary, args, {
        stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: ccusageChildEnv(),
      });
    } catch { reject(failure("ccusage_unavailable")); return; }
    let settled = false, terminal = null, terminationTimer = null, outputBytes = 0;
    const chunks = [];
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      signal?.removeEventListener("abort", abort);
      chunks.length = 0;
      if (error) reject(error); else resolve(value);
    };
    const stop = code => {
      if (settled || terminal !== null) return;
      terminal = failure(code);
      chunks.length = 0;
      clearTimeout(timer);
      terminationTimer = setTimeout(() => {
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
        finish(failure("ccusage_termination_failed"));
      }, TERMINATION_TIMEOUT_MS);
      try { child.kill("SIGKILL"); } catch { /* Close or bounded refusal settles below. */ }
    };
    const abort = () => stop("ccusage_aborted");
    const read = (chunk, retain) => {
      if (settled || terminal !== null) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (bytes.length > maximumOutputBytes - outputBytes) { stop("ccusage_output_limit"); return; }
      outputBytes += bytes.length;
      if (retain) chunks.push(bytes);
    };
    child.stdout.on("data", chunk => read(chunk, true));
    child.stderr.on("data", chunk => read(chunk, false));
    child.stdout.on("error", () => stop("ccusage_failed"));
    child.stderr.on("error", () => stop("ccusage_failed"));
    child.once("error", () => {
      if (child.pid) stop("ccusage_failed"); else finish(failure("ccusage_unavailable"));
    });
    // `exit` can precede the final stdout chunk. Parse only after both pipes close.
    child.once("close", (code, exitSignal) => {
      if (settled) return;
      if (terminal !== null) { finish(terminal); return; }
      if (code !== 0 || exitSignal !== null) { finish(failure("ccusage_failed")); return; }
      let value;
      try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { finish(failure("ccusage_invalid_json")); return; }
      finish(null, value);
    });
    timer = setTimeout(() => stop("ccusage_timeout"), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export function summarizeCcusage(report) {
  const byModel = {};
  for (const day of report.daily ?? []) {
    for (const [model, usage] of Object.entries(day.models ?? {})) {
      const target = byModel[model] ??= {
        inputUncachedTokens: 0,
        inputCacheReadTokens: 0,
        inputCacheWriteTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        fallbackModel: false,
      };
      target.inputUncachedTokens += usage.inputTokens ?? 0;
      target.inputCacheReadTokens += usage.cacheReadTokens ?? 0;
      target.inputCacheWriteTokens += usage.cacheCreationTokens ?? 0;
      target.outputTokens += usage.outputTokens ?? 0;
      target.reasoningOutputTokens += usage.reasoningOutputTokens ?? 0;
      target.totalTokens += usage.totalTokens ?? 0;
      target.fallbackModel ||= usage.isFallback === true;
    }
  }
  return {
    totals: {
      inputUncachedTokens: report.totals?.inputTokens ?? 0,
      inputCacheReadTokens: report.totals?.cacheReadTokens ?? 0,
      inputCacheWriteTokens: report.totals?.cacheCreationTokens ?? 0,
      outputTokens: report.totals?.outputTokens ?? 0,
      reasoningOutputTokens: report.totals?.reasoningOutputTokens ?? 0,
      totalTokens: report.totals?.totalTokens ?? 0,
      costUsd: report.totals?.costUSD ?? null,
    },
    byModel,
    daily: (report.daily ?? []).map((day) => ({
      date: day.date,
      totalTokens: day.totalTokens,
      costUsd: day.costUSD,
    })),
    limitations: [
      "ccusage JSON reports cacheCreationTokens as zero for Codex 20.0.18 even when the local schema has a cache-write field",
      "ccusage cost uses standard API pricing and is not provider subscription accounting",
    ],
  };
}
