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

Authorized automatic live refresh observation remains a separate gate, pending
the owner's normal exit of the still-running `2026110802`. Whole-refresh validation must include independent
work readiness, not only snapshot publication. Rollback is a source revert
and, after normal quit, loading the preserved previous candidate. There is no
schema migration or durable cache conversion to reverse. No rollback,
manual live refresh, signing, installation, publication or push was performed.
