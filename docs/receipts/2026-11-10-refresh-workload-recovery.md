---
title: Verified lineage and workload recovery on protected index copies
date: 2026-11-10
type: receipt
status: source-and-copy-validated-live-pending
---

# Scope and identity

Recovery work follows the
[diagnosis](2026-11-10-live-refresh-workload-diagnosis.md) and
[repair plan](../plans/2026-11-10-refresh-workload-recovery.md).
Checkout is `71f1a2cb6dd673251195d966ba86ee6f4683ad8f` plus uncommitted
recovery changes and the owner's existing work-source-path batching change.
Validation used Windows x64 and Node.js 26.2.0. This is source and operational
copy evidence, not a candidate, installed, signed, release or live-state gate.

Two fresh SQLite online backups of the existing derived index were created
under a native-verified owner-only performance-lab directory. Only each copied
index was opened writable. The existing salt was read with the existing-only
reader. Original Codex sources were read through normal authenticated readers;
their paths, identities and contents were not projected into output. No source,
live index, collector, settings or private account-state write was performed.
No live refresh, quota request, app restart or forced exit was triggered.

The copied databases contain private local-index metadata and remain protected
local operational copies; they are not fixtures or repository artifacts. The
ignored harness retains code only and emits allowlisted counts/statuses.
Sources could advance during the rehearsal, so this is not a frozen-corpus
performance benchmark. No speed or baseline claim follows from its timings.

# Implemented repair

- A changing/unreadable cutoff dependency refuses discovery and receives at
  most two retries under the same cancellation/deadline. Stable invalidity
  still quarantines; failed proof reuse is evicted. Out-of-range cutoffs also
  validate final dependency state instead of trusting stale walked size.
- A source rejected by discovery for invalid lineage can be admitted after
  fresh discovery and extraction, even when its own bytes/stat did not change.
- Gap closure requires a complete authenticated replay, current full verified
  cursor, original quarantine provenance, matching creation time/reason/byte
  extent and unchanged physical identity. A later identity replacement blocks
  closure even when its wall-clock timestamp moves backwards. Fact, cursor,
  gap and coverage publication share the transaction. Partial/failed/cancelled
  reads cannot close a gap. Already admitted sources with eligible gaps receive
  full replay too.
- Workload policy `task-workload-v16` limits proven exact gaps to intersecting
  inclusive receipt ranges. Legacy bounded whole-source extrema and unknown
  extents remain conservative. Missing usage cannot produce expected zero;
  independently observed quota remains readable.

No persistent schema, migration, cache format, account-attribution rule,
allowance-capacity meaning, timeout limit or permission boundary was changed.

# Protected-copy result

Both rehearsals started from generation **25451** with **4,379 sources**, one
discovery-quarantined source and one open lineage gap. Original quarantine
provenance matched. Its indexed usage/quota/work fact counts were all zero.

Both ended at generation **25456**, with zero quarantined sources and the
gap repaired. The target's complete source bytes and verified cursor matched;
it recovered **2 usage facts, 2 quota occurrences and 3 work lifecycle facts**.
Four other sources required the existing response-reconciliation rescan, so
global non-target usage/work equality is not claimed.

The second rehearsal compared all row values in source/offset order for every
unaffected source, separately for `usage_event`, `quota_occurrence` and
`work_lifecycle_fact`. All three comparisons matched exactly after excluding
the five sources explicitly recorded as changed. SQLite `quick_check(1)` was
`ok`. A further ordinary refresh of that copy kept the recovered target's
three fact counts unchanged and its gap repaired. Synthetic tests separately
compare usage occurrence keys/values across recovery and retry.

At the same retained quota-time anchor, with the same scoped collector evidence
and no supplied capacity:

| Result | Before recovery | After recovery |
| --- | --- | --- |
| Workload errors | Work boundary, usage history and integrity gap | Work boundary only |
| Historical classification centers | Unavailable | Available |
| Remaining hours | All unavailable | Medium, light and composite available |
| Estimation work | 0 ms | 5,914,846 ms |
| Estimation observed quota | 0 pp | 6 pp |
| Recent elapsed API intensity | Unknown | Available |
| Startup observed quota subtotal | 8 pp | 8 pp |

Heavy work-hour estimates remain unavailable where supported paired samples
are insufficient. The independent incomplete lifecycle evidence is retained.
No missing terminal is inferred and no unknown value becomes zero. The reader
was invoked with source freshness as a controlled rehearsal input, not as a
claim about the stopped desktop's current freshness.

# Validation and remaining gates

The cutoff/discovery/workload test invocation completed with **145 passed,
0 failed, 0 skipped**. Additional recovery, impact, index-refresh and scoped
account tests passed in focused runs. The recovery suite covers worker lanes,
partial tails, stable invalid cutoffs, absent provenance/extent, later identity
changes, cancellation rollback and replay. Architecture, documentation and
preflight checks passed at this source stage. The owning local suite completed
with **300 passed, 0 failed, 0 skipped** and the Web UI suite with **904 passed,
0 failed, 0 skipped**. These are isolated synthetic tests, not native rendered
or live qualification. The owner then paused work for discussion; the running
broad root test process was stopped and has no passing gate result.

The most recent process/CDP inspection found no running Rhetrion candidate;
the earlier 2026110806 identity is historical. No new candidate was built or
activated in this repair stage. Rendered artifact and authorized natural live
refresh qualification remain outstanding.

Historical Plus capacity remains `historical_unattributed`; current-account
expected consumption remains unavailable. The owner requested its provenance
and meaning before choosing a changed historical-reference display contract.
Neither current-account identity assignment nor importing old unscoped Pro
capacity is part of this repair.

# Historical capacity clarification requested by the owner

A separate read-only inspection of the collector accounting cache, generated
at `2026-11-09T18:11:50.658Z`, confirms the selected Plus weekly scenario is
`unresolved_as_standard`. Its account attribution is explicitly
`historical_unattributed` and `accountVerified` is false.

The capacity is fitted API-price-equivalent usage per 100 observed quota
percentage points. `pairwiseCapacities`/`capacityFit` in
`src/reporting/weekly-calibration.js` fit positive cost/percentage differences
within each eligible window fragment; the selected estimate summarizes those
window values. This is neither subscription price, remaining balance nor an
official provider allowance. The six fragments are not six complete weeks.

| Fragment dates (UTC) | Observed movement (pp) | Fitted API-equivalent USD per 100 pp |
| --- | ---: | ---: |
| 2026-09-14–15 | 27 | 67.950277 |
| 2026-09-16–19 | 93 | 80.317431 |
| 2026-09-19 | 15 | 82.917701 |
| 2026-10-09–11 | 78 | 47.538907 |
| 2026-10-11 | 16 | 61.868214 |
| 2026-11-01–02 | 33 | 53.352698 |

The selected historical median is **64.909246** and its historical central
range is **50.445802–81.617566**. That range is not a confidence interval for
the current account. Same-window holdout MAE is **1.459976 pp**; validation
against prior reset windows has **zero scored groups and zero points**.
Unknown speed uses the displayed Standard assumption, rather than proved
historical speed.

These historical logs establish conditional plan labels, not continuity with
the current account. Missing account attribution does not mean missing token
accounting or an unconsumed allowance. The producer correctly labels the fit
unattributed; the workload consumer requires a matching current-account scope
that this producer cannot supply. Thus the unavailable expected-consumption
result has a separate provenance cause, even after index recovery. Assigning
the present account to these fragments would not repair that cause. A future
historical-reference display must have explicit reviewed meaning and labels;
the current scoped contract remains in force pending that decision.

# Later owner decision: local single-account capacity model

After the read-only evidence investigation and discussion, the owner explicitly
selected the local single-account assumption and requested no additional UI
assumption label. This supersedes the pending model decision above; it does
not change the earlier observations or qualify a live candidate.

The workload reader now admits the existing available, same-plan capacity
marked `historical_unattributed` without requiring a current-account token.
An explicitly different token is still refused. Raw/indexed facts and the
historical capacity DTO retain their attribution. Current observed-quota
epochs, plan/reset/price/coverage rules, account-keyed state and the old
unscoped file's non-import behavior remain in force. There is no new route,
schema, migration, cache format, service, account-field ingestion or UI label.
The maintained [expected-line contract](../design/composition-aware-expected-line.md#historical-plan-comparison-populations)
records this model policy. Creator-account attribution remains paused.

Eight focused account-connection tests passed, including restored positive
expected consumption, unchanged synthetic Plus 51% balance, A-B-A boundaries,
restart replay, explicit foreign-account refusal, missing provenance, plan
mismatch and missing usage. The subsequent workload/connection invocation
completed with **117 passed, 0 failed, 0 skipped**. It also proves a quota-history
read failure cannot reinstate a last-good expected value over a current
missing-usage refusal. The local suite completed with **300 passed, 0 failed,
0 skipped** after the selection change. Broad regression remains a separate
running gate at this point.

Read-only replay against the previously repaired protected index copy at
generation **25458**, with the same retained quota-time anchor
`2026-11-09T18:11:38.273Z`, the current collector scope and its 13 stored declared
speed windows, changed the comparison as follows:

| Field | Refused historical-capacity control | Single-account model |
| --- | ---: | ---: |
| Capacity (API-equivalent USD per 100 pp) | Unavailable | 64.909246 |
| Actual observed subtotal (pp) | 8 | 8 |
| Expected subtotal (pp) | Unavailable | 447.1519998861181 |
| Remaining allowance (%) | 92 | 92 |
| Capacity versions in returned analysis | 0 | 1 |

Repeated analysis returned the same comparison. No copied or live state was
written by this replay; source freshness was a controlled input at the stored
anchor. The only retained workload error was `work_boundary_incomplete`.
This qualifies model selection and deterministic calculation, not model
accuracy: the large actual/expected discrepancy remains unexplained in this
slice. No fit, cost formula, observation, bound or displayed value was altered
to reduce it. It is not a live dashboard observation or a baseline benchmark.

# Final source gates and broad-regression limitation

The final focused invocation covered lineage recovery, account connection,
workload reader/analyzer, cutoff proofs, discovery/source consistency, index
refresh and impact capture: **213 passed, 0 failed, 1 skipped** out of 214.
The existing skip is the Windows source-replacement case that requires a
deferred handle-identity contract; it was not added or broadened here.
Pre-aborted discovery retains its existing `codex_log_scan_aborted` error:
the new retry catch originally replaced it with the AbortSignal's generic
error, and that regression was fixed and included in final coverage.
Architecture, documentation and preflight checks passed.

Broad root regression reported **166 distinct failing tests** before being
stopped; it did not complete and does not establish a passing gate. A detached
worktree at unchanged HEAD `71f1a2cb6dd673251195d966ba86ee6f4683ad8f`, with no
product edits and a byte-identical existing native binary/manifest pair,
reproduced **46** failures also present in the current run. These cover API
route/export lists, reader-needle assertions, native export-storage operations,
legacy schema fixtures, accounting timing stages and generation shape. The
baseline used isolated synthetic state and no credential qualification.
The remaining broad failures have not all been attributed; no claim is made
that all 166 are pre-existing. Test assertions, schemas, privacy boundaries and
unrelated export/migration modules were not changed to obtain green results.

The logs and detached baseline remain ignored local validation artifacts.
No new package, rendered candidate or live activation was performed. The
single-account model source slice is implemented and narrowly validated; full
product/native/live qualification and the actual/expected model discrepancy
remain separate outstanding gates.

# Follow-up: the 447.15 pp discrepancy is not qualified

After the owner's challenge, independent read-only pricing of individual
committed usage events on the same protected copy, generation **25458**, used
the exact comparison endpoints `2026-11-08T07:34:52.250Z` through
`2026-11-09T18:11:38.273Z` (start exclusive, end inclusive). The result matched
the workload bucket/raw reader: **290.2429916 API-equivalent USD**, or
`100 * 290.2429916 / 64.909246 = 447.1519998861181 pp`.
All 1,828 priced non-Spark usage events used Standard in this interval. This
rules out a bucket aggregation discrepancy and a Fast multiplier as causes of
this particular result; it does not independently prove upstream quota debits
or every ingestion identity.

| Model | API-equivalent USD |
| --- | ---: |
| GPT-6 Astra | 239.6162930 |
| GPT-6.1 Sol | 50.4119956 |
| Codex Auto-review | 0.2147030 |

The six historical fragments used for the 64.909246 scalar contained no priced
Astra events in their corresponding committed raw ranges. Their fitted
capacities are not a demonstrated universal conversion for the current mix.
The selected-policy calibration contains no composition vector; the separate
Standard composition analysis is `fallback_blended`, with no fitted per-model
capacity vector either. It cannot be substituted for the selected policy.
There are still no scored prior-reset forecasts proving transfer accuracy.

Time partitioning exposes an additional unresolved observation/population
problem, rather than proving model mix explains the full discrepancy:

| Comparison subinterval (UTC) | API-equivalent USD | Stored direct weekly quota |
| --- | ---: | --- |
| Nov 8 07:34:52.250–10:56:30.836 | 42.5857854 | 23 reads, all 0% used |
| Nov 8 10:56:30.836–14:04:49.922 | 79.6868246 | 20 reads, 0% to 8% used |
| Nov 8 14:04:49.922–Nov 9 18:11:38.273 | 167.9703816 | 128 reads, all 8% used |

Usage partitions exclude each starting endpoint and include each ending
endpoint. Quota observation counts include both endpoints, so the two shared
boundary reads appear in adjacent rows and are not distinct observations.
All these direct observations retain available collector account scope; that
scope does not establish the billing ownership of every usage event. The raw
rollout quota evidence in the comparison interval also reports Plus, with
0–8% used. Repeated collector reads rule out a simple absence of polling but
do not prove the provider refreshed its underlying meter or that the meter
covers every selected session. Stored official daily token evidence does not
establish matching coverage or token semantics either.

The verified defect in this repair's acceptance is treating restored numeric
output as sufficient qualification of expected consumption. The single-account
selection change does not validate transferring the historical scalar to
these observations. The precise source of the quota/usage divergence remains
unresolved; account mismatch, provider display delay and a different billing
population are hypotheses, not findings. Do not tune the denominator from the
same observed 8 pp, clamp the result, substitute an incompatible model or
report this as an accurate forecast. No additional product arithmetic, live
profile, candidate or source data was changed during this follow-up.

Before candidate activation, establish which stored usage population the
direct quota series measures, reproduce its response/quota normalization
against minimal synthetic shapes, and validate any replacement calibration
prospectively on held-out comparable windows. If existing evidence cannot
establish that relationship, state the missing evidence instead of inventing
a corrected expected number. Refresh/lineage recovery and this unresolved
estimation gate remain separate.

# Owner-confirmed cause and implemented API exclusion

The owner then disclosed that Codex CLI uses a third-party API-key relay rather
than subscription allowance. Read-only authenticated inspection of the ten
sources contributing to the same generation-25458 comparison found six CLI
sources sharing one custom provider declaration, contributing
**285.1380462 API-equivalent USD**. The other four sources declared the built-in
OpenAI provider and contributed **5.1049454 API-equivalent USD**. All ten had
been stored as `chatgpt_subscription`: `tierRow` in the index refresh hard-coded
that label, and workload pricing selected all committed time-matching usage.
The third-party population therefore supplied **98.2411%** of the numerator.
The raw header had a useful provider distinction that ingestion did not use;
this was not a universal absence of source evidence. Provider names, keys,
account IDs, source paths and source contents were not retained in output.

On the owner's subsequent explicit request, API-key/custom-provider sources
are excluded from product statistics and calculations. The implementation uses
one metadata predicate in the provider tier owner, consumed by the existing
response prepass and independent performance parser. It excludes explicit
`apikey`/`api_key` authentication, `openai_api` billing declarations, and nonempty
custom provider declarations. Missing historical fields retain the existing
subscription model. It neither excludes CLI categorically nor resumes creator
account attribution. Built-in OpenAI plus absent authentication is not a proved
subscription identity; the current config is not used to classify the past.

The index extractor suppresses emitted usage, quota, tools, boundaries and work
while retaining its normal bounded read, validation, cursor and lineage keys.
The provider scanner also retains API-parent replay keys for subscription
children. Extractor provenance is v23; existing present sources use ordinary
atomic parser replay to remove previously miscounted derived facts and update
rollups. Original files/catalogs remain intact. Unavailable historical sources
keep old provenance instead of guessed reclassification. Performance parser
revision 20 uses the existing blocked state and existing staged parser replay.
No persistent schema, migration, cache shape or new account field is introduced.

Synthetic verification passed the response/compatibility tests, worker versus
sequential equality, old-parser correction, exact subscription preservation,
append/retry/restart, raw-file preservation, rollup subtraction and API-parent
fork replay. The broader focused invocation completed with **206 passed,
0 failed and 1 existing Windows replacement-contract skip**. The subsequent
response/source-consistency/privacy invocation, after preserving API-parent
scanner keys, completed with **43 passed and the same existing skip**.
Timing/recovery/response verification completed with **88 passed, 0 failed**.
The local surface suite completed with **300 passed, 0 failed**. Architecture,
documentation and preflight passed. These are synthetic source/surface gates;
the earlier broad root-gate failures remain an independent unresolved gate.

A separate read-only operational replay used the new extractor on all ten
authenticated real source prefixes selected from generation 25458, bounded
to each stored source extent and compared at the original quota endpoints.
Native handle state stayed unchanged through every read. The six API CLI
sources emitted zero usage, quota, tool or work facts. The four retained
sources emitted the same **295 usage rows**, of which **147** had positive
priced usage, totaling **5.1049454 API-equivalent USD**. With the unchanged
historical denominator, the diagnostic expected subtotal is
**7.864743029059375 pp**, versus the retained actual **8 pp**. No fit, cap or
rounding adjustment was made to force agreement. This verifies the actual
filter on real evidence; it is not a fresh fit, live UI result, full copied
index refresh or frozen performance benchmark. The 207 inspected sources in
the selected historical calibration fragments all declared built-in OpenAI;
the complete eligible calibration population was not recomputed in this replay.

No source, live profile, accounting cache, index or candidate was written by
the operational replay. No new package was built or activated. Rendered
candidate and normal live-refresh qualification remain separate gates.

An isolated hidden Electron harness also rendered the existing workload
component with content-free synthetic inputs at 1200 and 430 CSS pixels. The
known expected value rendered as 7.86 pp beside 8 pp actual; a missing expected
value remained a dash. No horizontal overflow was detected. The harness bound
only to loopback, blocked external requests and used a separate disposable
synthetic profile. This is component rendering evidence, not a packaged product
or current real-profile observation.
