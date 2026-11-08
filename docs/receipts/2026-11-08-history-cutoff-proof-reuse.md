---
title: History-cutoff proof reuse and throughput verification
date: 2026-11-08
type: receipt
status: partial
baseline_commit: a911573fd324baf534f72bf143999d794c0aec6e
source_commit: 868ec69ad4b3b79e8dddb59b613d146679f4f27a
---

# Scope and acceptance

The owner's target is elapsed time until the current overview and requested
work view are ready. The earlier report-worker slice improved a measured
response-isolation boundary but increased reader wall time and did not prove
whole-refresh acceleration. This slice instead removes repeated history-cutoff
prefix reads and compressed decoding during unchanged discovery passes.
It does not alter work enrichment, accounting, schemas, durable formats,
timeouts or attribution. Source/reader evidence does not prove that the
running package has loaded the change or that whole-refresh time improved.

At generation `25172`, a read-only index inventory contained 99 history-base
references, each with a distinct cutoff and parent: 91 compressed and 8 plain.
Their retained logical prefix lengths totaled 3258270751 bytes. These were
reference sizes, not measured I/O. Within-pass parent batching could not
remove that work. The existing inspection cache skipped header/cold inspection
but did not retain successful cutoff proofs across discovery calls.

# Implementation and correctness

The existing scanner instance retains at most 2048 successful proofs, with a
bounded key. Every hit freshly opens the source, keeps the original source
guards, checks exact held/named bigint identity and nanosecond state before
and after, and requires successful close. The key binds home/path privately
in memory, compression, logical/physical size, parent start ordinal and cutoff
byte/ordinal coordinates. Entries retain file state and validated byte/line
counts, never raw bytes, decoded content or handles. A changed or unsupported
state takes the existing validation path; unsafe/failed/unknown evidence cannot
authorize cached success. No append-aware shortcut is inferred from size growth.

Compressed seeds fully consume the existing decoder iterator, including its
tail/frame and physical-state checks, even after it has yielded the requested
prefix. The decoder is not stopped early. Native adapters without exact
nanosecond state remain uncached. This preserves the local index scanner's
existing filesystem boundary and does not qualify native ACL behavior. A
separate negative-only set preserves failed-cutoff deduplication within one
pass, then disappears so the next pass retries. It cannot authorize success.

# Validation

Focused cache and benchmark tests: 37 passed. Cache cases include precise
mutation, append, replacement, missing/coarse metadata, unsafe links, failed
close, cancellation, limits, short read, eviction, shared failure bounds,
real Node handles, real compressed decoding and failure after the final yielded
prefix. Nearby discovery/consistency tests: 27 passed, one existing Windows
replacement skip. Refresh/source-digest/rotation tests: 18 passed.
The complete local suite passed all 300 tests. Architecture, tool inventory
and preflight passed; no complete-root-suite claim is made. Two nearby port-fixture failures
were also reproduced against the baseline: their expected line-needle list
omits existing `token_usage_record` and `turn_aborted` entries. Those assertions
were not weakened or included in a passing claim.

# Synthetic reader matrix

Windows x64, Node `22.21.1`, fixed synthetic anchor `1785423600000`, 24 sources,
12 distinct parent cutoffs, 11 compressed, 113225712 logical prefix bytes.
Both readers received the same validated inspection inventory. Three fresh
process pairs were followed by a separate process with one excluded warm-up
and three measured warm pairs; order alternated. Fresh means scanner/process
cache, not cold OS cache. Exact source-selection and receipt equality, stable
file state and unchanged projection source hashes held for every pair.

| Phase | Baseline samples, ms | Candidate samples, ms | Median before / after, ms | Range before / after, ms |
|---|---|---|---|---|
| Fresh process | 103.786, 110.633, 95.976 | 124.380, 135.457, 115.789 | 103.786 / 124.380 | 95.976–110.633 / 115.789–135.457 |
| Warm, warm-up excluded | 91.685, 97.966, 89.921 | 13.078, 13.434, 13.439 | 91.685 / 13.434 | 89.921–97.966 / 13.078–13.439 |

Warm median fell 85.3%; fresh median rose 19.8% (20.594 ms) while establishing
proofs. Each baseline pass read 9446196 physical bytes in 47 reads, decoded
11 cutoffs and yielded 103790236 compressed logical prefix bytes. Every warm
candidate did zero physical reads and zero cutoff decodes/yielded bytes while
preserving all 12 fresh opens/closes and 24 named-state checks. Cold candidate
read/decoder counts matched baseline. These timings exclude preparation,
corpus generation, imports and process start; process uptime at each measured
operation is retained separately. This is a discovery-reader improvement on
the synthetic shape, not a whole-refresh or cold-start acceleration claim.

# Live read-only reader matrix

The same Windows x64 Node `22.21.1` reader comparison admitted 4368 indexed,
stable sources, excluding 10 recently changed/catalog-mismatched sources.
It selected 4366 sources identically on both sides. There were 99 retained
cutoffs; the inventory had 4208 compressed sources, while actual cutoff decoder
calls were 91 per baseline operation. Generation `25181`, anchor
`1794088964247`, keyed corpus fingerprint and reader source hash stayed equal
across all three fresh-process pairs and warm-up/three warm pairs. File state
and directory identity were rechecked around each pair. Live writers were not
frozen; a change would have refused the comparison. The source matrix hash was
`5729718d72e765f7eacf1297bcf1cc22f14afeb89a2752700b3b997f767d1493`.

| Phase | Baseline samples, ms | Candidate samples, ms | Median before / after, ms | Range before / after, ms |
|---|---|---|---|---|
| Fresh process | 25917.906, 22993.782, 24019.768 | 21049.994, 23685.182, 18854.167 | 24019.768 / 21049.994 | 22993.782–25917.906 / 18854.167–23685.182 |
| Warm, warm-up excluded | 18876.116, 18612.910, 19769.857 | 3877.875, 4271.887, 4719.461 | 18876.116 / 4271.887 | 18612.910–19769.857 / 3877.875–4719.461 |

Warm reader median fell 77.4%, a 14604.229 ms difference. Baseline graph
samples were 15137.512, 15035.085, 16086.669 ms; candidate graph samples were
504.089, 585.042, 572.854 ms (medians 15137.512 / 572.854 ms). Remaining
candidate wall time was largely stat/walk over the admitted inventory.
Each baseline pass performed 7008 physical reads totaling 1822070465 bytes
and 91 cutoff decodes yielding 3202707633 logical prefix bytes. Every warm
candidate did zero physical reads and zero cutoff decodes/yielded bytes,
retaining 99 fresh opens/closes and 198 named-state checks. Cold candidate
read/decoder counts matched baseline; its variable wall times do not establish
a cold acceleration claim. The source/receipt objects matched exactly.

The common inspection and frozen in-memory directory inventory deliberately
isolate the indexed discovery reader; these are not complete filesystem-walk,
indexing, accounting or work-enrichment benchmarks. The 91 decoder calls, not
the 4208 compressed inventory sources, describe the removed decode work.
The reader runtime also differs from the candidate's embedded Node `24.22.1`.
Exact package loading and app-driven refresh remain separate gates. The live
matrix did not publish a result, trigger refresh or mutate profile/source
state. The keyed corpus proof's random key existed only in parent/child
environment and was never printed or persisted.

Evidence is retained in the ignored local candidate evidence directory. No
live profile, source, setting or refresh was mutated by these measurements.

# Remaining gates and rollback

Unsigned candidate `2026110803`, version `0.1.27`, source `868ec69a`, was staged
with exactly Node `26.2.0`. Exact staged/archive file-set and byte verification
passed for 762 files. ASAR SHA-256:
`c8ba8a6ca8992654a520ee39ee5e2351a38fd154ca36448e60fb2eeb431b32ce`.
The prior artifact and staging were preserved; this candidate was not signed,
installed or published.

Its disposable profile included two extra history-base parents (one compressed)
beside the ordinary synthetic usage fixture. The actual packaged app built a
ready snapshot and rendered its overview without an error dialog; work moved
from preparing to available. The isolated index contained five sources, two
history bases and no quarantined sources. Normal quit succeeded. The synthetic
quota collector remained `app_server_unavailable` without credentials, so this
does not pass the normal hosted/credential smoke or native general-security
qualification. The screenshot was inspected; unavailable quota/forecast values
remained explicit. No real profile was used for the synthetic run.

# Production loading and startup

After the owner normally exited `2026110802`, no `usage-monitor.exe` process
remained. The `2026110803` ASAR hash was checked again before normal launch at
`2026-11-08T05:22:10.4109485Z`. No forced exit, direct profile edit, setting
change or manual refresh was used. The artifact remains unsigned, uninstalled
and unpublished.

The startup automatic refresh ran from `05:22:22.812Z` to `05:25:34.875Z` and
succeeded in 192064.365 ms. Accounting stayed `fast_path`, generation `25199`
matched, fallback/full rebuilds were zero, and one dirty window was recomputed
without unavailable/mismatch windows. Quota publication succeeded. The
overview was subsequently live/available without stale serve; tools retained
the explicit `typed_tool_history_partial` state.

| Startup phase | Wall time, ms |
|---|---:|
| Index refresh | 39180.392 |
| Discovery / graph | 24011.583 / 18583.565 |
| Origin proof | 12231.336 |
| Accounting window shadow | 54096.726 |
| Accounting fast path / quota within it | 37262.261 / 31623.739 |
| Snapshot reload / build | 39847.053 / 39495.666 |
| Snapshot index projection / report | 16426.774 / 13916.924 |
| Snapshot accounting reads, two calls | 2968.969 |
| Snapshot collector projection | 3152.534 |
| Snapshot clone / persist timing | 350.791 / 0.077 |

These spans are inclusive and not additive. Startup establishes proofs; this
first graph span is not the warm-reuse result. No heavy benchmark or test was
run concurrently with the production observation.

Passive observation of the renderer's existing work-query responses first
recorded a fresh available work result for generation `25199` at
`05:27:34.232Z`, with available metadata and neither retained nor refreshing
flags. That is 311420 ms after refresh began, versus 192064.365 ms to snapshot
publication. Read-only DOM inspection confirmed ready/not busy and a hidden
issue element at `05:27:40.719Z`. The passive response time is an observation
bound, not a claim about the exact instant the internal build completed.
The user-facing waiting target therefore remains materially longer than
snapshot publication. This startup does not establish overall acceleration.

The startup health series had 130 samples, median 8 ms, maximum 14849 ms;
that slow response ended at snapshot completion. Remaining synchronous work
is not fixed by cutoff reuse. Diagnostics read at `05:28:00.637Z` contained
no new `work_usage_timeout` since launch, a finite observation only. Inspection
retained allowlisted status/timing fields, not private work rows or labels.

# Next natural pass: end-to-end target not met

The next automatic refresh ran from `05:30:35.552Z` to `05:39:59.454Z` and
succeeded in 563906.025 ms. Accounting generation `25203` matched, with zero
fallback/full rebuilds, two dirty/recomputed windows and no unavailable or
mismatch windows. Quota publication succeeded. This functional success is not
a performance acceptance pass.

| Next automatic phase | Wall time, ms |
|---|---:|
| Index refresh | 215407.424 |
| Discovery / graph | 67409.120 / 9646.700 |
| Discovery walk / stat within it | 56416.109 / 46353.563 |
| Index execute / descriptor | 54834.183 / 62779.967 |
| Origin proof | 102101.336 |
| Accounting window shadow | 106927.865 |
| Accounting fast path / quota within it | 49760.030 / 41875.165 |
| Snapshot reload / build | 73390.873 / 72984.457 |
| Snapshot index projection / report | 31907.130 / 28769.494 |
| Snapshot accounting reads, two calls | 3497.772 |
| Snapshot collector projection | 4322.626 |
| Snapshot clone / persist timing | 401.682 / 1.937 |

Passive work-response observation first confirmed generation `25203` fresh,
available, not retained/refreshing, with available metadata at
`05:42:50.034Z`: 734482 ms (12 minutes 14.482 seconds) after refresh began.
Read-only DOM inspection at `05:43:25.066Z` confirmed ready/not busy and no
visible work issue. The intended overview-plus-work waiting target failed.
This pass had different inputs and timing conditions from earlier passes;
neither its regression nor a whole-refresh improvement can be causally
assigned to one code change from these natural observations.

The second health series includes the wait for the natural pass: 332 completed
reads, median 15 ms, maximum 14067 ms. Several observer reads failed under
their deadlines, including an additional refresh-status GET that timed out at
20 seconds. Those failed reads are excluded from the completed-read summary;
its maximum is not an upper bound on server stalls. Diagnostics read through
`05:43:25.206Z` recorded one new `work_usage_timeout`, at `05:34:19.646Z`,
background phase `preload`, stage `validation`, elapsed 70057 ms, configured
timeout 10000 ms, HTTP status 200. No timeout or stale state was suppressed.

Warm graph was lower than the startup graph, while traversal/stat, origin
proof, accounting and descriptor work grew. Production timing lacks cutoff
hit/byte counters, so it does not itself prove every cutoff hit; the controlled
reader matrix remains the direct repeated-byte evidence. Cold startup took
311420 ms to first observed fresh work and the next pass 734482 ms. The new
candidate therefore closes loading and functional publication, **not** the
end-to-end acceleration or timeout gates.

Source review identified an independent avoidable cost: the backend's
`describeCurrentGeneration` builds a full companion report and discards all
but its generation descriptor. The existing `readLocalIndexReportMetadata`
already computes the descriptor's required evidence without presentation
pricing/quota/impact projections. A separate descriptor-only repair is being
prepared and has not been loaded by this artifact. Work still builds default
four-period/all-history summaries per request; its optimization and related
generation-identity correctness need their own synthetic gates. No concurrent
heavy test or benchmark was used to assess this live pass.

# Rollback and remaining boundary

Rollback is a source revert
and, after normal quit, loading the preserved previous candidate. There is no
schema migration or durable cache conversion to reverse. No rollback,
manual live refresh, signing, installation, publication or push was performed.
