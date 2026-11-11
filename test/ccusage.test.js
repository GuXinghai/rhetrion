import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { ccusageChildEnv, runCcusageCodexDaily } from "../src/ccusage.js";

const options = { since: "2026-07-01", until: "2026-07-02", offline: true };
const canary = "synthetic-private-error-canary";
const safeFailure = code => error => {
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  assert.equal(JSON.stringify(error).includes(canary), false);
  assert.equal(error.cause, undefined);
  return true;
};
function childFixture(action) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.pid = 123; child.kills = [];
  child.unref = () => {};
  child.kill = signal => {
    child.kills.push(signal);
    queueMicrotask(() => child.emit("close", null, signal));
    return true;
  };
  return { child, controls: {
    resolveBinary: () => "synthetic-ccusage.exe",
    spawnProcess: (_binary, _args, _spawnOptions) => {
      queueMicrotask(() => action(child));
      return child;
    },
  } };
}

test("ccusage waits for closed stdout and preserves split UTF-8 JSON", async () => {
  const value = { daily: [], totals: {}, synthetic: "界" };
  const bytes = Buffer.from(JSON.stringify(value));
  const split = bytes.indexOf(Buffer.from("界")) + 1;
  const fixture = childFixture(child => {
    child.stdout.write(bytes.subarray(0, split));
    child.emit("exit", 0, null);
    child.stdout.write(bytes.subarray(split));
    child.emit("close", 0, null);
  });
  assert.deepEqual(await runCcusageCodexDaily(options, fixture.controls), value);
  assert.deepEqual(fixture.child.kills, []);
});

test("ccusage owns the pinned Windows executable and passes arguments without a shell", async () => {
  const fixture = childFixture(child => { child.stdout.write("{}"); child.emit("close", 0, null); });
  const result = await runCcusageCodexDaily(options, {
    spawnProcess: (binary, args, spawnOptions) => {
      assert.match(binary, /ccusage\.exe$/u);
      assert.deepEqual(args, ["codex", "daily", "--since", options.since, "--until", options.until,
        "--timezone", "UTC", "--json", "--offline"]);
      assert.equal(spawnOptions.windowsHide, true);
      assert.equal(spawnOptions.shell, undefined);
      assert.deepEqual(spawnOptions.stdio, ["ignore", "pipe", "pipe"]);
      return fixture.controls.spawnProcess();
    },
  });
  assert.deepEqual(result, {});
});

test("ccusage redacts resolver, spawn, process and parse failures", async () => {
  await assert.rejects(runCcusageCodexDaily(options, {
    resolveBinary: () => { throw new Error(canary); },
  }), safeFailure("ccusage_unavailable"));
  await assert.rejects(runCcusageCodexDaily(options, {
    resolveBinary: () => "synthetic.exe", spawnProcess: () => { throw new Error(canary); },
  }), safeFailure("ccusage_unavailable"));
  for (const [action, code] of [
    [child => { child.stderr.write(canary); child.emit("close", 1, null); }, "ccusage_failed"],
    [child => { child.stdout.write(`{"${canary}":`); child.emit("close", 0, null); }, "ccusage_invalid_json"],
    [child => child.emit("error", new Error(canary)), "ccusage_failed"],
    [child => child.stdout.emit("error", new Error(canary)), "ccusage_failed"],
  ]) {
    const fixture = childFixture(action);
    await assert.rejects(runCcusageCodexDaily(options, fixture.controls), safeFailure(code));
  }
});

test("ccusage bounds combined stdout/stderr bytes and terminates on overflow", async () => {
  for (const stream of ["stdout", "stderr"]) {
    const fixture = childFixture(child => {
      child.stdout.write("{}"); child[stream].write(Buffer.alloc(7));
    });
    await assert.rejects(runCcusageCodexDaily({ ...options, maximumOutputBytes: 8 }, fixture.controls),
      safeFailure("ccusage_output_limit"));
    assert.deepEqual(fixture.child.kills, ["SIGKILL"]);
  }
  const fixture = childFixture(child => { child.stdout.write("{}"); child.emit("close", 0, null); });
  assert.deepEqual(await runCcusageCodexDaily({ ...options, maximumOutputBytes: 2 }, fixture.controls), {});
});

test("ccusage validates resource bounds and pre-aborted calls before spawning", async () => {
  const controls = { resolveBinary: () => { assert.fail("must not resolve"); } };
  for (const override of [{ timeoutMs: 0 }, { timeoutMs: 120001 }, { maximumOutputBytes: 0 },
    { maximumOutputBytes: 16 * 1024 * 1024 + 1 }, { signal: {} }]) {
    await assert.rejects(runCcusageCodexDaily({ ...options, ...override }, controls),
      safeFailure("ccusage_options_invalid"));
  }
  await assert.rejects(runCcusageCodexDaily({ ...options, signal: AbortSignal.abort(canary) }, controls), error => {
    assert.equal(error.name, "AbortError");
    return safeFailure("ccusage_aborted")(error);
  });
});

test("ccusage timeout and cancellation settle only after the owned Windows child closes", async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    let child, closed = false;
    const promise = runCcusageCodexDaily({ ...options, signal: controller.signal,
      timeoutMs: cancel ? 5000 : 100 }, {
      resolveBinary: () => "synthetic.exe",
      spawnProcess: (_binary, _args, spawnOptions) => {
        child = spawn(process.execPath, ["-e", "process.stdout.write('ready');setInterval(()=>{},1000)"], spawnOptions);
        child.once("close", () => { closed = true; });
        if (cancel) child.stdout.once("data", () => controller.abort(canary));
        return child;
      },
    });
    await assert.rejects(promise, safeFailure(cancel ? "ccusage_aborted" : "ccusage_timeout"));
    assert.equal(closed, true);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  }
});

test("ccusage reports an explicit bounded refusal when termination cannot be confirmed", async () => {
  const fixture = childFixture(() => {});
  fixture.child.kill = () => false;
  await assert.rejects(runCcusageCodexDaily({ ...options, timeoutMs: 1 }, fixture.controls),
    safeFailure("ccusage_termination_failed"));
  assert.equal(fixture.child.stdout.destroyed, true);
  assert.equal(fixture.child.stderr.destroyed, true);
});

test("ccusage strips internal identity and broker variables case-insensitively", () => {
  const environment = Object.freeze({ PATH: "synthetic-tools", usage_monitor_keychain_broker_fd: "0",
    app_usagemonitor_account_hmac_key: canary });
  assert.deepEqual(ccusageChildEnv(environment), { PATH: "synthetic-tools" });
});
