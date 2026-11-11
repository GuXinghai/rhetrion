import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { runR7MaterializedBoundaryHarness } from "../src/r7-materialized-boundary-harness.js";
import { R7_MATERIALIZED_BOUNDARY_GENERATION_RETIRED_CODE } from "../src/r7-materialized-boundary-benchmark.js";
import { runR7MaterializedBoundaryWorker } from "../scripts/r7-materialized-boundary-worker.js";

test("direct materialized evidence generation refuses before option or fixture access", async () => {
  let accessed = false;
  const options = new Proxy({}, { get() { accessed = true; throw new Error("PRIVATE_OPTION_CANARY"); } });
  for (const value of [undefined, null, options]) {
    await assert.rejects(runR7MaterializedBoundaryHarness(value), error =>
      error.code === R7_MATERIALIZED_BOUNDARY_GENERATION_RETIRED_CODE
      && !error.message.includes("PRIVATE_OPTION_CANARY"));
    assert.deepEqual(await runR7MaterializedBoundaryWorker(value), {
      status: "failed", failureCode: "harness_failed", evidence: null,
    });
  }
  assert.equal(accessed, false);
});

test("retired worker refuses without waiting for or interpreting stdin", () => {
  const result = spawnSync(process.execPath, ["scripts/r7-materialized-boundary-worker.js"], {
    input: "PRIVATE_INVALID_JSON_CANARY", encoding: "utf8", env: process.env,
    windowsHide: true, timeout: 5000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "failed", failureCode: "harness_failed", evidence: null,
  });
});

test("retirement guard has no filesystem, fixture, or provider dependency", async () => {
  const source = await readFile(new URL("../src/r7-materialized-boundary-harness.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:fs|resource-benchmark-fixture|local-node-runtime|tmpdir|process\.env/u);
});
