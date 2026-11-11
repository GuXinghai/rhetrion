import { R7_MATERIALIZED_BOUNDARY_GENERATION_RETIRED_CODE } from "./r7-materialized-boundary-benchmark.js";

export const R7_MATERIALIZED_BOUNDARY_HARNESS_VERSION =
  "g1-r7-materialized-boundary-integration-v0.3";

// Historical evidence remains readable; no direct harness bypass may create
// a fresh evidence matrix after retirement, including with supplied fixtures.
export async function runR7MaterializedBoundaryHarness() {
  throw Object.assign(new Error("R7 v0.1 receipt generation is retired"), {
    code: R7_MATERIALIZED_BOUNDARY_GENERATION_RETIRED_CODE,
  });
}
