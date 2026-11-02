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
   last-good state, run an automatic bounded repair, and surface partial state.
   A manual **Recalculate** entry escalates window → related range → full
   rebuild; only the last step needs explicit confirmation.
5. **Calibration is a separate model.** Window freshness and calibration age
   are independent; a new event does not refit the global model. The interval is
   a fixed-option user setting: 6 hours, 12 hours, 24 hours (default), 3 days,
   or 7 days. A change starts timing from the change and does not refresh
   immediately; price or plan changes still calibrate immediately.
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
- `partial`/`unavailable` states for missing windows, with a last-good value
  carrying an explicit age or partial label;
- a **Recalculate** entry that repairs window → related range → full rebuild,
  with confirmation only for the full rebuild;
- `calibrationAsOf` and `weeklyIntervalsAsOf` labels;
- a feature gate that can return to the last full cache without data deletion.

Acceptance:

- rendered work usage, accounting, and quota surfaces match the full-cache
  output on the protected copy;
- missing-window tests show the labelled last-good value or partial state, never
  zero;
- the Recalculate entry follows the ordered escalation and never jumps directly
  to a full rebuild;
- no full rebuild occurs for normal appends over repeated refreshes;
- the last full cache remains readable throughout.

Rollback: disable the fast-path gate; readers use the retained full cache.

## 4. Calibration cadence and explicit repair

Deliverables:

- a settings control with five fixed options: every 6 hours, every 12 hours,
  every 24 hours (default), every 3 days, and every 7 days;
- changing the option starts the next interval from the change time and does not
  trigger an immediate refit;
- price, policy, or plan changes still calibrate immediately;
- a repair operation for a named window or range, with receipt and audit, plus
  the ordered manual escalation;
- runtime counters for dirty, recomputed, unavailable, mismatch, and full
  rebuild by reason;
- removal of the automatic full-rebuild path from normal refresh errors.

Acceptance:

- a normal-change sequence records zero full rebuilds;
- a non-whitelisted full-rebuild reason fails the test gate;
- changing the interval does not enqueue an immediate refit;
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

# Risks

- **Cross-window dependency**: a transition or reset checkpoint can make a
  correction affect a suffix. The plan bounds the suffix at the next reset
  boundary; if that is still too large, the window granularity or checkpoint
  design must change.
- **Calibration semantics**: the fixed options and age label are settled, but a
  model can still be older than the selected interval while a refit is pending.
  The UI must keep the age visible.
- **Receipt storage**: the collector state is preferred for Phase 1. If the
  audit requires atomic coupling with index facts, a forward-only local-index
  schema decision is needed; no downgrade or dual writer is allowed.
- **Partial reader behavior**: 1A is approved; implementation must keep the
  `截至 X 时间` / `部分数据` label visible and must not drop the value silently.
- **Repair UX**: automatic repair is local and bounded; the manual entry
  escalates in order. It must not become a hidden scheduler retry or skip the
  full-rebuild confirmation.
- **Performance**: a fast path that still scans all facts or rebuilds the
  snapshot will not deliver the expected whole-refresh gain. Measure each stage.

# Owner decisions (2026-11-02)

1. **Unavailable window display: 1A.** Keep the last-good value with an explicit
   `截至 X 时间` / `部分数据` label. Do not hide the value or the module.
2. **Calibration interval: fixed options.** Use 6 hours, 12 hours, 24 hours
   (default), 3 days, and 7 days. A change starts timing from the change and
   does not trigger an immediate refit. Price/plan/policy changes still
   calibrate immediately.
3. **Repair: automatic local plus manual escalation.** Automatic repair is
   limited to the affected window. A visible **Recalculate** entry escalates
   window → related range → full rebuild; the full rebuild requires explicit
   confirmation.
4. **Speed target: A now, B later.** Keep the page usable while the background
   refresh runs. Measure the accounting fast path first; if the remaining
   discovery/snapshot cost is still too high, proceed to the 3-minute target as
   a separate slice.

# Delegated engineering decisions

These do not need owner input unless the audit changes the conclusion:

- window granularity: UTC day with boundary checkpoints; finer buckets need a
  separate proof;
- receipt storage: the existing collector cache store during the shadow phases;
  a local-index schema change only if transactional coupling is proven necessary;
- full-rebuild reason enum and receipt schema;
- test layout, harness implementation, and runtime counter names.

# Proposed copy

The settings control belongs under **Settings → Data & diagnostics**, near the
existing refresh interval. The wording must make clear that it affects only the
allowance calibration and that saving does not refresh immediately.

| Purpose | 简体中文 | English |
|---|---|---|
| Card title | 额度校准刷新 | Allowance calibration refresh |
| Description | 只影响套餐额度折算 API 金额的校准模型。逐笔金额仍会即时更新。 | Affects only the allowance-to-API-equivalent calibration model. Per-event amounts still update immediately. |
| Field label | 校准间隔 | Calibration interval |
| Options | 每 6 小时 / 每 12 小时 / 每 24 小时（默认） / 每 3 天 / 每 7 天 | Every 6 hours / Every 12 hours / Every 24 hours (default) / Every 3 days / Every 7 days |
| Hint | 修改后从当前时间重新计时，不会立即刷新。价格表或套餐变化时仍会立即校准。 | Changes take effect from now and do not trigger an immediate refresh. Price or plan changes still calibrate immediately. |
| Status | 上次校准：{time} · 下次校准：{time} | Last calibrated: {time} · Next calibration: {time} |
| Stale label | 部分数据 · 截至 {time} | Partial data · as of {time} |
| Stale explanation | 这段时间暂时无法验证，显示的是上次正确结果。 | This period can't be verified right now. Showing the last correct result. |
| Repair button | 重新计算 | Recalculate |
| Repair progress | 正在重算 {date}… / 正在重算相关范围… | Recalculating {date}… / Recalculating the related range… |
| Full-rebuild confirmation | 需要完整重建。这会重新计算全部会计数据，可能需要几分钟。 | A full rebuild is required. This recalculates all accounting data and may take several minutes. |
| Confirm / cancel | 开始完整重建 / 取消 | Start full rebuild / Cancel |
| Success | 已更新到 {time} | Updated to {time} |
| Failure | 这次没有修好。可以稍后重试，或查看诊断。 | This repair did not succeed. Try again later or view diagnostics. |
| Already running | 已有更新正在进行，完成后可重新计算。 | An update is already running. You can recalculate when it finishes. |

Spanish entries follow the existing i18n catalog and must preserve the same
meaning; do not ship a locale with a missing or English-only string.

# Remaining gates

This plan is not implementation or release evidence. Completion requires the
equality audit, protected-copy rehearsal, repeated live observation, and the
owning test gates. Signing, installer, installed-app, and release qualification
remain separate and unchanged.
