---
title: Live partial-refresh and unavailable workload diagnosis
date: 2026-11-10
type: receipt
status: diagnosed-with-original-rejection-unresolved
---

# Scope and identity

Read-only diagnosis on 2026-11-10 Japan time, observed from approximately
`2026-11-09T16:44Z` onward. The running unsigned, uninstalled candidate is
**2026110806**, source **95cec57668d80d5bf9775cb0f61801cee12a20df**,
launched at `2026-11-08T07:34:08Z`. Its ASAR SHA-256 remains
`15df1b606006b0a5bef54dd4570e3702a38e66414e14faea9821e87257869cea`.
The pending work-source-path batching change is not in that candidate.

The packaged refresh, discovery, source classification, store, workload reader,
snapshot composition and quota-analysis workload implementation were read back
and matched the relevant checkout files. The checkout is `71f1a2cb` plus the
previously reported uncommitted batching/docs changes; those changes were
preserved. No product source, live settings, source bytes, cache, schema or
release state was edited. No refresh, restart or quota collection was manually
triggered. Natural automatic refreshes continued during inspection, so this
is not a frozen-generation benchmark or an unchanged-live-file assertion.

Only content-free status/count/timing information is retained. Source headers
and the required parent prefix were inspected in memory through the existing
native source-read capability, with held/named identity and timestamp checks;
no source bytes, paths, identifiers, commands or private work rows are retained.

# Observations

At the first overview/status read, generation **25426** matched the accounting
cache. The automatic refresh from `2026-11-09T16:42:43.806Z` to
`16:43:43.316Z` finished **degraded**, with failed step `unified_index` and
failure code `codex_rollout_lineage_invalid`. Quota publication and usage
processing succeeded; accounting used `fast_path`. The next observed natural
refresh, `16:48:43.526Z` to `16:49:35.477Z`, retained the same failure code.
These were terminal partial results, not still-running refreshes or main
refresh timeouts.

The index contained 4,379 sources; one source in one session was quarantined,
leaving 4,378 admitted sources. The affected 86,832-byte source was initially
ingested at `2026-11-08T11:24:20.136Z` with two usage records. At
`13:10:06.149Z` its source-change record reports `quarantine_gap`, the lineage
failure, removal of those two records and a zero committed cursor. One open
integrity gap has the recorded event bounds
`2026-11-08T10:59:03.365Z`–`10:59:03.383Z`. These are the retained removed-fact
bounds, not proof about every possible unrecorded event. Fourteen retained
rate-limited degraded diagnostics for this candidate, starting at
`2026-11-08T13:13:38.157Z`, all identify this same step/code; their count is
not the count of refresh passes.

The workload projection was `partial`, with `integrity_gap`,
`workload_history_incomplete` and `work_boundary_incomplete`. All four
remaining-hour estimates and all classification centers were null;
`estimationWorkMs` and `estimationPp` were zero. Pricing diagnostics contained
zero unpriced records, accounting's selected period was fully priced, and
fresh quota evidence was available. The startup comparison retained **8 actual
percentage points**, while `capacityUsd` and `expectedPp` were null.

# Confirmed causes

## Accepted lineage sources remain quarantined

`classifyFromStat` in `src/local-index-source-digest.js` keeps an unchanged
quarantined source in `mode: quarantined`. The readmission override in
`src/local-index-refresh.js` applies only to `DISCOVERY_QUARANTINE_CODES`.
`src/local-index-store.js` lists `codex_rollout_lineage_invalid` only among
extraction codes, although discovery can emit it too. Consequently a source
whose discovery lineage now passes can remain skipped when its own stat tuple
does not change. The dependency retry path is narrower and does not guarantee
recovery for this case.

The source's current native-authenticated header is valid JSON and matches
its canonical filename. Its paginated history base names an existing parent.
The referenced 148,863-byte prefix contains exactly 20 complete lines, ending
on a newline, matching ordinals 0 through 19. Those source/header checks passed
without changing either file.

Two fresh-process read-only discovery probes using the normal source scanner
and the existing catalog accepted **all 4,379 sources**, rejected none and
accepted this target. The second probe also rechecked **2,968** catalog hits
whose walked inode required exact-identity confirmation. Passing that target
to the actual `classifyFromStat` still returned:

```json
{"mode":"quarantined","reason":"codex_rollout_lineage_invalid"}
```

Its eligibility for the existing discovery-readmission override was false.
This reproduces the persistent recovery defect independently of a live write.
The ignored diagnostic harness under
`.release-build/refresh-investigation-20261110/` instruments only fixed branch
numbers in an in-memory discovery module, uses existing ports, emits aggregate
counts and does not invoke the index writer. It does not share the running
process's proof cache or establish that the whole live corpus stayed frozen.

**Unresolved:** the exact branch that rejected the source on November 8.
The retained diagnostic records only the common lineage code. A transient
dependency/file-state failure or another past graph condition is possible,
but not proven. Current checks do not establish historical source corruption,
and the persistent problem must not be described as a corrupt-file diagnosis.

## One intersecting gap invalidates the full workload analysis range

`readLocalIndexWorkload` in `src/local-index-workload.js` queries whether any
open/queued gap intersects its evidence range, then passes
`usageCoverageFromMs: nowMs` to `analyzeWorkload`. It discards the selected
gap's actual bounds at this boundary. The analyzer consequently treats all
earlier bins/pairs as incomplete, including otherwise independent historical
and recent windows. This removes classification training rows and actual
covered work denominators, causing unclassified consumption and null remaining
hours. A bounded gap from November 8 therefore still affects later windows.
The separate incomplete lifecycle-boundary diagnostic may remain after that
gap is repaired; it is not proven to originate from the quarantined source.

A minimal in-memory synthetic control, with the same events, usage and quota,
produced three classification centers, 4,500,000 ms of estimation work and
usable hour estimates. Changing only `usageCoverageFromMs` to `nowMs` made
all centers and hour estimates null and estimation work zero. Actual startup
quota remained available. This is a computation characterization, not a live
profile experiment or authorization to weaken missing-evidence handling.

## The current workload cannot consume the historical capacity estimate

The snapshot's `timeline.allowanceCapacity` was available for Plus, with a
selected historical median of **64.909246 API-price-equivalent USD per full
allowance**. Its provenance is `historical_unattributed`, potentially spanning
accounts. `projectAllowanceCapacity` in `src/local-companion-data.js` supplies
no private `accountScopeToken`. The same composition root passes this value
to an account-scoped `readLocalIndexWorkload`, whose selection guard requires
`capacity.accountScopeToken === accountScopeToken` for an available current
account. Thus the current capacity is rejected, `capacityHistory` is empty,
and comparison capacity/expected consumption remain null.

This is distinct from missing prices and the integrity-gap classification
problem. In the synthetic control, removing only capacity kept actual quota
and classification available but made `expectedPp` null. It is a producer/
consumer provenance limitation, not permission to attach the present account
to unattributed historical fits. Account attribution remains paused; neither
creator identity fields nor implicit historical assignment are proposed.

# Repair boundaries and remaining gates

1. Add narrowly scoped recovery after fresh successful discovery plus full
   extraction/dependency validation for this overlapping lineage code. Do not
   relabel every lineage failure as safe. Test retry/restart, duplicate replay,
   extraction-only rejection, parent changes, cancellation and atomic cursor/
   fact publication. An unchanged valid source must recover without editing it.
2. Close/supersede an integrity gap only when a committed verified replay proves
   its exact recovery. A source search found gap creation but no product update
   that changes its repair status. Merely retrying ingestion must not be assumed
   to remove an existing gap. Preserve unrepaired/unknown evidence.
3. Carry bounded gap influence into the existing workload owner so independent
   complete ranges can remain usable; unknown bounds retain conservative
   invalidation. Test boundary intersections, cross-day quota allocation,
   classification training, independent recent windows and unknown extents.
4. Keep historical capacity and current-account estimates distinct. Resolve the
   workload capacity contract through reviewed evidence/presentation semantics;
   do not bypass the scope guard, fabricate zero, or reintroduce attribution.
   Until that contract is resolved, repairing quarantine alone does not prove
   expected consumption will become available. Surface the exact refusal reason.

This diagnosis implements none of those repairs. A future fix needs synthetic
replay/negative tests, protected-copy equivalence, exact package validation,
and separately authorized live candidate qualification. No timeout increase,
profile wipe, source touch, quarantine deletion or gap-flag edit is justified.

One `work_usage_timeout` was retained at `2026-11-09T15:24:07.141Z`, reported
in preload/validation after HTTP 200, with elapsed 130,154 ms against a
10,000-ms validation timeout. That is additional unresolved work-view latency;
it does not explain the explicit lineage failure in the recent completed
refreshes or the null workload capacity contract.

# Follow-up investigation, through 2026-11-09T17:58Z

The owner requested a deeper cause investigation. This section adds later
evidence; it does not retroactively establish the missing original branch.
The running process group and archive hash still matched 2026110806.
Only ignored diagnostic harnesses and this receipt were added/updated.

## Initial trigger narrowed to discovery, with a reproduced append race

The quarantined source has no stored `lineage_json`. The discovery-rejection
writer omits that field and `commitSourceState` stores null; extractor-level
quarantine uses `quarantineState`/`cursorState` and retains the inspection.
Together with its unchanged own size, zero cursor and early source-change
publication, this identifies discovery as the rejection stage.

The parent's source-change history records a replacement due to response
reconciliation at `2026-11-08T13:10:21.424Z`, **15.275 seconds after** the child
quarantine. Parent size advanced from **19,772,723 to 20,463,590 bytes**,
and its usage rows advanced from 149 to 168. This is the same nearby indexing
sequence, not proof of the exact instant the physical append occurred.
The child remains under the ordinary Codex source home, outside the workspace
and performance-copy root, with one physical link. Its current change time
predates quarantine. A private-copy path accidentally entering the live index
was not observed.

`historyCutoffValid` in `src/providers/codex/log-sources.js` has two relevant
paths:

1. If the parent's held size differs from the earlier walked size, it returns
   false even when the required prefix is still valid.
2. A state change during prefix verification also makes the result false.
   Its catch rethrows cancellation/resource limits but absorbs the scanner's
   retryable `codex_log_source_changed` as false.

The caller converts all of those false results into the durable
`codex_rollout_lineage_invalid` quarantine. It does not distinguish a stable
invalid prefix from a changing source that should refuse/retry this pass.
Thus a fail-closed read refusal incorrectly becomes persistent invalidity.

An isolated, content-free two-source reproduction exercised the actual scanner
and `refreshLocalIndex`, with an injected legal parent append after directory
inspection and before cutoff stat. The existing prefix bytes and line/ordinal
boundary were untouched. Its exact progression was:

| Step | Discovery | Committed usage rows | Child quarantine | Open gaps |
| --- | --- | ---: | --- | ---: |
| Initial ingest | Complete, 2 accepted | 2 | None | 0 |
| Parent appends between walk and cutoff stat | Partial, 1 rejected | 1 | Lineage invalid | 1 |
| Ordinary retry with stable files | Complete, 2 accepted | 1 | Still retained | 1 |
| Synthetic-only child append triggers full reparse | Complete, 2 accepted | 2 | Cleared | 1 |

The last row is a characterization, not a proposed live workaround: even a
successful fact replay leaves the gap open, so source readmission alone is
insufficient to restore workload completeness.

Four scanner variants reproduced the same initial false quarantine: cold
proof state, warmed proof state, legal append during prefix read, and a
retryable source-change error. A fifth variant loaded the pre-proof-cache
scanner at **a911573f** from Git and reproduced the pre-stat append failure.
Each subsequent stable discovery was complete. The core size-mismatch/catch
behavior predates the 868ec69a proof-cache optimization; reverting that cache
does not fix the demonstrated failure.

The harness is
`.release-build/refresh-investigation-20261110/reproduce.mjs`, run using
Node.js 26.2.0 through `runIsolatedProcess` from the existing isolated runner.
It asserts each transition, creates only minimal synthetic files/state and
removes its verified synthetic workspace afterward. Assertions passed on
repeat runs. It does not load or edit live account/source/profile state.

**Confidence boundary:** the parent append race is a concrete reproduced
defect and fits the retained November 8 chronology. The original runtime did
not record the failure subreason, so the historical trigger remains an
inference; transient source access or another past graph condition cannot be
excluded. Do not report a proven source corruption or a proven exact branch
for that historical pass.

## The gap's recorded usage bounds omit other removed fact ranges

The quarantine's impact manifest confirms removal of **two usage facts, two
quota occurrences and three work lifecycle facts**. Work-fact time bounds span
`2026-11-08T10:58:15.557Z`–`10:59:03.439Z`, wider than the usage bounds
`10:59:03.365Z`–`10:59:03.383Z`. `quarantineGaps` derives its event bounds
only from `oldImpact.usage`. Its 18-ms event range is therefore not a complete
bound on the source's missing lifecycle or potentially unobserved evidence.

Any later refinement of gap influence must honor the affected fact domains,
the complete verified source range and unknown extents. It cannot merely use
the current 18-ms usage range as proof that everything outside it is complete.
The safest first slice remains verified re-ingestion plus atomic gap closure
based on that proof, with retry/restart and no-double-counting checks.

## Work-boundary incompleteness has additional sources

A read-only invocation of the existing workload reader at snapshot anchor
`2026-11-09T17:53:33.565Z`, using current index generation **25442**, inspected
4,047 lifecycle events and 34,094 projected usage receipts in memory. The task
analyzer produced 1,766 complete intervals, zero conflicts and **141** visible
incomplete ranges. Eleven task-key groups contained starts without terminal
records; eight started before the November 8 quarantine. Thirty-four
incomplete ranges start after the recorded gap's usage upper bound. These
counts are for admitted index facts, not proof that upstream never recorded
those terminal events.

This probe used an in-memory hook at the existing analyzer call and returned
only counts/time bounds. It used no private account token and did not replay
collector quota history; its result is a lifecycle characterization, not an
alternate authoritative overview. The independently missing work boundaries
must remain explicit after the quarantine is repaired. Do not promise that
all workload windows become complete merely by closing this one gap.

## Capacity rejection is a deterministic composition mismatch

Git history identifies **68f329398245434189e0a058fbca8198641dbeb2** on
2026-10-31 as introducing the current workload account-token guard and the
composition root's account-scoped invocation. `projectAllowanceCapacity`
still emits `historical_unattributed` capacity without `accountScopeToken`;
no producer in this path supplies the token the reader now requires. This
is not intermittent calibration, model-price absence or an insufficient
number of new quota observations.

The synthetic reproduction passed the same available Plus capacity through
three invocations: the unscoped call admitted one version, the normal scoped
call admitted zero, and a synthetic capacity explicitly carrying the matching
synthetic token admitted one. The resulting DTO contained no token. This
control demonstrates the contract mismatch, not authorization to attach a
current token to real unattributed history.

Protected read-only state inspection found the intentionally retained old
unscoped workload file with 31 Pro capacity versions and an available
comparison capacity. The new account-keyed container has two account entries,
both with empty capacity histories and null comparison capacity. No raw
account handles or saved private values were emitted. The old Pro history
cannot be assigned to the current Plus/account context, and the existing
account-state owner deliberately does not import that unscoped file.

The correct repair must supply actually scoped evidence, or introduce an
explicitly reviewed historical-reference calculation/presentation contract.
Removing the account guard, restoring old Pro values into Plus, assigning
the historical fit to the present account or changing null to zero would
misrepresent the evidence. The account-attribution experiment remains paused.

The narrowed repair order is: distinguish retryable discovery state changes
from invalid lineage; recover an unchanged source after complete renewed proof;
close the corresponding gap only with verified committed replay; then assess
remaining workload coverage and resolve the independent capacity contract.
No such source or live-state repair was implemented during investigation.
