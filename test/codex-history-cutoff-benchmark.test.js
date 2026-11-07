import assert from "node:assert/strict";
import test from "node:test";

import { benchmarkCodexHistoryCutoffs, parseCodexHistoryCutoffBenchmarkArguments }
  from "../scripts/benchmark-codex-history-cutoff.mjs";

test("history-cutoff benchmark refuses implicit live access and unbounded arguments", async () => {
  for (const args of [[], ["--phase", "cold", "--run", "1"],
    ["--allow-live-read", "--phase", "cold", "--run", "4"],
    ["--synthetic", "--phase", "other", "--run", "1"],
    ["--synthetic", "--phase", "warm", "--run", "1", "--parents", "129", "--prefix-mib", "1"],
    ["--synthetic", "--phase", "warm", "--run", "1", "--parents", "128", "--prefix-mib", "32"],
    ["--allow-live-read", "--phase", "cold", "--run", "1", "--parents", "1", "--prefix-mib", "1"],
    ["--synthetic", "--phase", "cold", "--run", "1", "--write"]]) {
    assert.throws(() => parseCodexHistoryCutoffBenchmarkArguments(args), /ARGUMENT_INVALID/u);
  }
  assert.deepEqual(parseCodexHistoryCutoffBenchmarkArguments(["--synthetic", "--phase", "cold", "--run", "2"]),
    { synthetic: true, allowLiveRead: false, phase: "cold", run: 2, parents: 12, prefixMiB: 9 });
  assert.equal(parseCodexHistoryCutoffBenchmarkArguments(["--allow-live-read", "--phase", "warm", "--run", "1"]).allowLiveRead, true);
  for (const options of [{ phase: "cold", run: 1 }, { synthetic: true, allowLiveRead: true, phase: "cold", run: 1 },
    { synthetic: true, phase: "cold", run: 1, parents: 129 }, { synthetic: true, phase: "cold", run: 1, prefixBytes: 1 }]) {
    await assert.rejects(benchmarkCodexHistoryCutoffs(options), /CONTEXT_INVALID/u);
  }
});

test("small synthetic cutoff comparison preserves complete semantics and bounded content-free metrics", {
  skip: process.platform !== "win32" || process.arch !== "x64",
}, async () => {
  const samples = await benchmarkCodexHistoryCutoffs({ synthetic: true, phase: "warm", run: 1,
    parents: 12, prefixBytes: 8192 });
  assert.equal(samples.length, 4);
  assert.deepEqual(samples.map(sample => sample.phase), ["warmup", "warm", "warm", "warm"]);
  assert.equal(new Set(samples.map(sample => sample.corpusFingerprint)).size, 1);
  for (const sample of samples) {
    assert.equal(sample.equal, true);
    assert.equal(sample.stateUnchanged, true);
    assert.equal(sample.sourceUnchanged, true);
    assert.equal(sample.sources, 24);
    assert.equal(sample.compressedSources, 11);
    assert.equal(sample.retainedCutoffs, 12);
    assert.equal(sample.baseline.selectedSources, 24);
    assert.equal(sample.candidate.selectedSources, 24);
    assert.equal(sample.baseline.cutoffDecoderCalls, 11);
    assert.ok(sample.baseline.cutoffLogicalBytes > 0);
    assert.ok(sample.baseline.physicalBytes > 0);
    assert.ok(sample.candidate.opens > 0);
    assert.equal(sample.candidate.opens, sample.candidate.closes);
    assert.ok(sample.candidate.wallMs >= 0);
    assert.ok(sample.candidate.stages.discovery_graph >= 0);
    assert.doesNotMatch(JSON.stringify(sample), /rhetrion-cutoff-benchmark-|\.jsonl|"path"|"lineage"|11111111-/u);
  }
  for (const sample of samples.slice(1)) {
    assert.equal(sample.candidate.physicalBytes, 0);
    assert.equal(sample.candidate.cutoffDecoderCalls, 0);
    assert.equal(sample.candidate.cutoffLogicalBytes, 0);
  }
  const [cold] = await benchmarkCodexHistoryCutoffs({ synthetic: true, phase: "cold", run: 2,
    parents: 12, prefixBytes: 8192 });
  assert.equal(cold.corpusFingerprint, samples[0].corpusFingerprint);
  assert.equal(cold.equal, true);
  assert.ok(cold.candidate.physicalBytes > 0);
  assert.ok(cold.candidate.cutoffLogicalBytes > 0);
  assert.equal(cold.candidate.cutoffDecoderCalls, 11);
});
