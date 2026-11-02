---
title: Incremental accounting windows and receipt-gated fallback
date: 2026-11-02
type: plan
status: proposed
---

# Scope and claim boundary

This plan implements the
[accounting window receipt contract](../design/2026-11-02-accounting-window-incremental-contract.md).
It covers the accounting derived cache only. It does not change source
ingestion, parser semantics, `work_rollup`, `workload_bucket`, quota tracks,
lineage, the generation/publication fence, or the installed application.

Claim boundary: source-level design, implementation, and validation planning.
No live profile is migrated, repaired, or activated by this plan. Tests use
synthetic stores and protected copies. Performance numbers below are
point-in-time observations, not a release or installed-app claim.

The checkout for this plan is `refactor/local-index-v11-impact-projections`.
Work stays on that branch; no merge to `main`, push, release, or installed-app
operation is implied.

# Current verified facts

These source facts decide the plan:

- `usage_event` has primary key `(source_id, source_offset)` and a stable
  `event_key`; quota and work facts have equivalent source/offset-based primary
  keys. Stable occurrence identities already exist for content-free receipts.
- `impact_partition` already records `accounting_window` partitions with
  `lower_ms`, `upper_ms`, session, basis kind, and status. The index refresh
  records them; the accounting cache does not consume them yet.
- `projectReplaySafeAccountingTime` already refreshes moving windows,
  timelines, and forecasts without rebuilding historical calibration or
  ledgers. It currently requires the cache generation to equal the new
  generation and does not update the source descriptor or historical intervals.
- The accounting reuse gate is global: its key includes
  `calculation_revision`, baseline windows clamped to the usage range, and an
  origin key covering all sessions. Any normal fact change therefore misses the
  gate.
- On 2026-11-02, two observed live refreshes skipped 4,268 of 4,273 index
  sources and read 5.45-8.43 MB, but still spent 302-345 seconds in
  `accounting_rebuild`; total refresh time was 596-647 seconds. The misses
  reported `inputs_revision_changed`, `inputs_baselines_changed`,
  `inputs_origins_changed`, and `inputs_changed`.
- `work_rollup` and `workload_bucket` totals reconciled with `usage_event` after
  both refreshes, so those projections are already incremental and are not the
  subject of this plan.

# Decisions

1. **Full rebuild is explicit, not a fallback.** `inputs_*` diagnostics identify
   dirty windows. They must not invoke a full rebuild.
2. **Receipts are authoritative for completeness.** The global revision remains
   a cheap change hint and consistency fence, not the reuse key.
3. **Normal changes produce only dirty windows.** Append, new session, late
   event, source replacement, quota/origin update, and time advance are normal
   classes.
4. **Proof failures are local.** Mark the affected window unavailable, retain
   last-good state, enqueue a bounded repair, and surface partial state. Do not
   rebuild everything automatically.
5. **Calibration is a separate model.** Window freshness and calibration age
   are independent; a new event does not refit the global model.
6. **No reader switch before equality.** Incremental and full builds must match
   on synthetic sequences and a protected profile copy before readers consume
   the windowed manifest.
7. **Prefer the existing cache store for shadow phases.** Receipts are stored
   alongside the existing replay-safe accounting cache in the collector state
   while the contract is being proven. Final storage is an owner decision; a
   local-index schema change is not required unless the audit proves
   transactional coupling is necessary.
8. **Measure the whole refresh.** Accounting is only one stage. Discovery/stat
   and snapshot rebuild remain separate work and must not be hidden by an
   accounting-only success claim.

# Implementation slices

## 0. Contract and audit harness

Deliverables:

- this plan and the linked contract;
- a test-only harness that computes a full accounting cache and a windowed
  cache for the same generation and compares receipts and canonical rows;
- synthetic scenario definitions for append, late append, rewrite, shrink, new
  session, source replacement, boundary, restart, and cancellation.

Acceptance:

- the harness fails on any row or digest difference;
- no production reader changes;
- no real profile writes.

## 1. Shadow receipts

Deliverables:

- receipt computation during the existing full rebuild, stored beside the
  cache but not read by production readers;
- mapping assertion that every fact belongs to exactly one window;
- stable digest across repeated builds of identical inputs;
- receipt status and reason vocabulary, content-free and closed.

Acceptance:

- two identical builds produce identical input and output digests;
- fact counts and fold totals reconcile;
- cancellation leaves the previous manifest untouched;
- restart reproduces receipts.

Rollback: stop writing receipts; the existing full cache remains authoritative.

## 2. Shadow dirty-window recompute

Deliverables:

- consume `impact_partition.accounting_window` since the last projected change;
- recompute dirty windows in shadow mode, merge into a shadow manifest, and
  compare with the full rebuild;
- bounded dependency closure for boundary checkpoints and reset transitions;
- explicit handling for unavailable windows.

Acceptance:

- zero differences between shadow incremental and full output over the
  synthetic suite;
- zero differences on a protected copy of the owner profile;
- a normal append sequence produces zero full rebuilds;
- a deliberately corrupted receipt marks only its window unavailable;
- no `inputs_*` diagnostic invokes a full rebuild; only `basis_changed`,
  `algorithm_changed`, `explicit_repair`, or `initial_build` may do so.

Rollback: disable shadow recompute; full cache remains authoritative.

## 3. Reader fast path

Deliverables:

- readers consume the windowed manifest and fold periods from window rows;
- `partial`/`unavailable` states for missing windows;
- `calibrationAsOf` and `weeklyIntervalsAsOf` labels;
- a feature gate that can return to the last full cache without data deletion.

Acceptance:

- rendered work usage, accounting, and quota surfaces match the full-cache
  output on the protected copy;
- missing-window tests show partial, not zero;
- no full rebuild occurs for normal appends over repeated refreshes;
- the last full cache remains readable throughout.

Rollback: disable the fast-path gate; readers use the retained full cache.

## 4. Calibration cadence and explicit repair

Deliverables:

- independent calibration refit schedule or explicit trigger;
- repair operation for a named window or range, with receipt and audit;
- runtime counters for dirty, recomputed, unavailable, mismatch, and full
  rebuild by reason;
- removal of the automatic full-rebuild path from normal refresh errors.

Acceptance:

- a normal-change sequence records zero full rebuilds;
- a non-whitelisted full-rebuild reason fails the test gate;
- repeated repair of the same window is an alert, not a rebuild loop;
- basis/algorithm changes still rebuild and publish atomically.

Rollback: retain the explicit repair path; restore the old full-build path only
as a named repair reason with evidence.

## 5. Discovery and snapshot follow-up

Accounting is not the only cost. After the fast path is proven:

- measure index discovery/stat and snapshot reload/build separately;
- decide whether filesystem change detection, incremental discovery, or
  snapshot reuse is the next smallest change;
- keep those changes in a separate plan with their own equality and runtime
  evidence.

Acceptance: a measured whole-refresh improvement, not only an accounting-stage
improvement.

# Validation

Focused while iterating:

- the window receipt, dirty-window, repair, and reader test files;
- `node --test` on the affected source and local companion tests;
- `npm run architecture:check` for any boundary or public-facade change.

Broader before claiming the slice:

- `npm run test:preflight`;
- `npm run docs:check`;
- the owning local companion and web contract gates;
- a protected-copy audit with synthetic data and the owner profile copy;
- a live observation of repeated normal refreshes with the runtime counters.

No step may use real private session content in fixtures, logs, commits, or
reports. Aggregate counts and timings are allowed; paths, prompts, responses,
account identifiers, and session content are not.

# Proof gates

The implementation is not accepted unless all of these hold:

1. **Coverage proof**: every fact maps to exactly one window; receipt counts sum
   to the fact total.
2. **Determinism proof**: repeated builds of identical inputs have identical
   digests.
3. **Equality proof**: incremental and full results match on the synthetic
   suite and a protected profile copy.
4. **Fallback proof**: a normal-change sequence produces zero full rebuilds; a
   corrupted receipt produces an unavailable window, not a full rebuild.
5. **Basis proof**: price/policy/schema/algorithm changes produce an explicit
   `basis_changed`/`algorithm_changed` full rebuild with a receipt.
6. **Restart proof**: a crash before publication leaves the previous complete
   manifest readable; a crash after publication leaves the new complete
   manifest readable.
7. **Privacy proof**: receipts and diagnostics contain no raw content or private
   paths.
8. **Whole-refresh proof**: accounting improvement is measured together with
   discovery and snapshot stages; no claim is made from a stage in isolation.

# Risks and open decisions

- **Cross-window dependency**: a transition or reset checkpoint can make a
  correction affect a suffix. The plan bounds the suffix at the next reset
  boundary; if that is still too large, the window granularity or checkpoint
  design must change.
- **Calibration semantics**: reusing a model while new events arrive is a
  product decision. The default is an explicit age label and a separate refit
  cadence.
- **Receipt storage**: the collector state is preferred for Phase 1. If the
  audit requires atomic coupling with index facts, a forward-only local-index
  schema decision is needed; no downgrade or dual writer is allowed.
- **Partial reader behavior**: a missing window must surface as partial or
  unavailable. The UI copy and aggregation rules need owner approval.
- **Repair UX**: a repair command or route must be explicit, bounded, and
  receipt-backed; it must not become a hidden scheduler retry.
- **Performance**: a fast path that still scans all facts or rebuilds the
  snapshot will not deliver the expected whole-refresh gain. Measure each stage.

# Open owner decisions

Before implementation beyond shadow mode:

1. Window granularity: UTC day, with boundary checkpoints, or a finer bucket.
2. Calibration refit cadence and the exact `calibrationAsOf` presentation.
3. Whether partial windows render as stale, unavailable, or a retained last-good
   value with an age label.
4. Whether receipts live in the collector state or require a local-index schema
   version.
5. The allowed repair entrypoint and its authorization boundary.

# Remaining gates

This plan is not implementation or release evidence. Completion requires the
equality audit, protected-copy rehearsal, repeated live observation, and the
owning test gates. Signing, installer, installed-app, and release qualification
remain separate and unchanged.
