#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runR7MaterializedBoundaryHarness } from "../src/r7-materialized-boundary-harness.js";
import { stableJson } from "../src/storage.js";

export async function runR7MaterializedBoundaryWorker() {
  try {
    return {
      status: "completed",
      failureCode: "none",
      evidence: await runR7MaterializedBoundaryHarness(),
    };
  } catch {
    return { status: "failed", failureCode: "harness_failed", evidence: null };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(stableJson(await runR7MaterializedBoundaryWorker()));
}
