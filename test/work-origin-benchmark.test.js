import assert from "node:assert/strict";
import test from "node:test";
import { benchmarkWorkOriginReads, parseWorkOriginBenchmarkArguments } from "../scripts/benchmark-work-origin-reads.mjs";

test("live work-origin diagnostics require explicit bounded admission before state access", async () => {
  for (const argv of [[], ["--phase", "warm", "--run", "1"],
    ["--allow-live-read", "--phase", "warm", "--run", "999"],
    ["--allow-live-read", "--phase", "other", "--run", "1"],
    ["--allow-live-read", "--phase", "warm", "--run", "1", "--write"]]) {
    assert.throws(() => parseWorkOriginBenchmarkArguments(argv), /ARGUMENT_INVALID/u);
  }
  assert.deepEqual(parseWorkOriginBenchmarkArguments(["--allow-live-read", "--phase", "warm", "--run", "1"]),
    { allowLiveRead: true, phase: "warm", run: 1, target: "origins" });
  assert.equal(parseWorkOriginBenchmarkArguments(["--allow-live-read", "--phase", "cold", "--run", "2", "--target", "snapshot"]).target,
    "snapshot");
  await assert.rejects(benchmarkWorkOriginReads({ phase: "warm", run: 1 }), /CONTEXT_INVALID/u);
});
