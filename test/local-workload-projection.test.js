import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalIndexWorkloadProjection } from "../src/local-index-workload.js";

const nowMs = Date.parse("2026-11-11T00:00:00Z");
const scope = "a".repeat(64);
const options = { indexFile: "synthetic-index", stateFile: "synthetic-collector", nowMs,
  accountScopeToken: scope, previousAccountScopeToken: scope };
const workload = status => ({ status, errors: [], comparison: {
  startedAtMs: nowMs - 1000, capacityUsd: null, planType: "plus", baseline: null,
}, capacityHistory: [], pricingDetails: { capture: { status: "ready" } } });

test("workload publication persists fresh results only and reports protected-state failures", async () => {
  for (const status of ["available", "partial", "stale", "unavailable"]) {
    for (const sourceFresh of [false, true]) {
      let writes = 0;
      const previous = workload("available");
      const result = await buildLocalIndexWorkloadProjection({ ...options, sourceFresh, previous }, {
        store: { read: async () => { throw new Error("synthetic state read failure"); },
          write: async () => { writes++; throw new Error("synthetic state write failure"); } },
        readQuota: async () => ({}),
        readWorkload: request => {
          assert.equal(request.previous, previous);
          assert.equal(request.accountScopeToken, scope);
          assert.equal(request.previousAccountScopeToken, scope);
          return workload(status);
        },
      });
      const shouldWrite = sourceFresh && ["available", "partial"].includes(status);
      assert.equal(writes, Number(shouldWrite));
      assert.deepEqual(result.errors, [{ code: shouldWrite
        ? "workload_state_write_failed" : "workload_state_read_failed", stage: "publish" }]);
      assert.equal(result.status, status === "available" ? "partial" : status);
    }
  }
});

test("quota failures remain explicit and timing failures do not change workload evidence", async () => {
  const previous = workload("stale");
  let writes = 0;
  const result = await buildLocalIndexWorkloadProjection({ ...options, previous, sourceFresh: true,
    onTiming() { throw new Error("synthetic observer failure"); },
    errors: [{ code: "runtime_evidence_checkpoint_invalid", stage: "index" }],
  }, {
    store: { read: async () => null, write: async () => { writes++; } },
    readQuota: async () => { throw new Error("PRIVATE_ERROR_SENTINEL"); },
    readWorkload: request => {
      assert.deepEqual(request.quotaEvidence, { errorCode: "quota_history_read_failed" });
      assert.equal(request.previous, previous);
      return structuredClone(previous);
    },
  });
  assert.equal(writes, 0);
  assert.equal(result.status, "stale");
  assert.equal(result.pricingDetails.capture.status, "failed");
  assert.deepEqual(result.errors, [{ code: "runtime_evidence_checkpoint_invalid", stage: "index" }]);
  assert.equal(JSON.stringify(result).includes("PRIVATE_ERROR_SENTINEL"), false);
});

test("cancellation stops workload computation and state publication", async () => {
  const controller = new AbortController();
  await assert.rejects(buildLocalIndexWorkloadProjection({ ...options, signal: controller.signal }, {
    store: { read: async () => null, write: async () => assert.fail("cancelled state write") },
    readQuota: async () => { controller.abort(); controller.signal.throwIfAborted(); },
    readWorkload: () => assert.fail("cancelled workload computation"),
  }), { name: "AbortError" });
});
