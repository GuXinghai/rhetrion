---
title: Excluded API-session marginal refresh qualification
date: 2026-11-10
type: receipt
status: measured-warm-threshold-not-met
---

# Scope and evidence boundary

This records the earlier implementation that still indexed excluded API
sources. The owner subsequently directed exclusion before index admission;
the [follow-up receipt](2026-11-10-api-index-boundary-refresh.md) qualifies that
separate implementation. The measurements and failed threshold below remain
point-in-time evidence; its window-planner exception was later removed.

Windows x64, Node.js 26.2.0, checkout `71f1a2cb` plus the owner-approved
uncommitted recovery/API-exclusion changes and the window-receipt repair
described below. This is an offline operational rehearsal on an owner-only
copy of real source data. Ordinary regression tests use synthetic records.
No live profile, source, setting, candidate or release was changed. No HTTP
service, quota-provider request or credential loader was used. There is no
new interface declaration, dependency, persistent cache, schema or migration.

The owner requested measured evidence for unchanged history, a new short API
session, and extension of an existing API session. This receipt qualifies
those specific deltas; it cannot establish constant-time handling of arbitrary
numbers/sizes of changes, file replacements, damaged evidence or every live
workload. Independent lazy model-performance-page refresh and actual packaged
runtime qualification are separate gates.

The measured implementation digest is
`08c69d444d665d861355591303e8940db7812393b36eb9bca8d26411e47c6eca`:
SHA-256 over each relative path, NUL, file bytes, NUL, in this order:
`src/local-index-accounting-windows.js`, `src/local-index-extract.js`,
`src/local-index-store.js`, `src/codex-usage-vocabulary.js`,
`src/providers/codex/response-usage.js`, `src/providers/codex/log-parser.js`,
`src/providers/codex/inference-timing.js`,
`src/providers/codex/tier-normalization.js`.

# Corpus and preparation

The existing protected historical corpus was copied, with authenticated newer
independent source prefixes selected from the generation-25458 investigation.
Copies used native owner/single-link/reparse checks, source-state revalidation,
no-clobber creation, fsync and byte-hash readback. Only protected local copies
were altered. Raw contents, names, private paths and provider/account identifiers
are absent from this receipt and measured output.

Baseline physical source bytes are **15,472,612,460**. The current v23 parser
actually built fresh index/accounting/window caches; old parser stamps were
never relabeled. One preparation attempt stopped at the existing resource guard
after about 355 seconds. Its committed cursors were resumed with the same
limits. The successful continuation took 611.536 seconds including accounting,
snapshot and work preparation. Both are excluded from incremental samples.

The final baseline is generation **4370**, calculation revision **2389178**,
with **4370** complete sources, **4265** sessions, **563959** usage rows,
**488361** quota occurrences, **387834** tool facts, **43088** lifecycle facts
and **33595** usage boundaries. Pending and quarantined sources are both zero.

| Scenario | Change from the identical cached baseline |
| --- | --- |
| Unchanged | No source change |
| Add short | Restore a withheld real 144952-byte API session; one new session |
| Append existing | Append the actual withheld 112550084-byte tail to a 267697608-byte API source; final size 380247692 bytes; same session count |

All trials start from the same baseline index and collector bytes, fixed clock
`2026-11-09T18:11:38.273Z`, parser and source corpus. Delta trials naturally
publish a later generation; they are not mislabeled as unchanged. Database
restoration preserves physical file identity and verifies readback. Source
reset preparation uses the normal content-proof path to refresh physical stat
metadata without changing the baseline generation or calculation revision.

# Defect found and minimal repair

The initial diagnostic triplet failed the intended performance boundary:

| Scenario, one diagnostic run | Window shadow | Whole pipeline |
| --- | ---: | ---: |
| Unchanged | 0.600 s | 58.654 s |
| Add short | 11.920 s | 73.129 s |
| Append existing | 12.072 s | 73.750 s |

All three had zero dirty/recomputed windows. The window-receipt planner treated
new-source coverage and response-reconciliation replay as requiring a full
usage/quota receipt scan even when the source had no old or new accounting
inputs. The initial matrix was stopped and preserved; these single runs are
diagnostic evidence, not three-run comparative results.

`src/local-index-accounting-windows.js` now admits the existing zero-dirty-day
update only when complete durable impact records and the current verified,
complete, current-parser source prove no old/new usage or quota facts/bounds,
no current usage/quota rows and no unresolved gap. The narrow additional modes
are new empty sources and same-file, complete-prefix response append replay.
Unknown coverage, lineage partitions, actual fact removal, partial/quarantined
state, changed identity, missing/pruned manifests and basis changes retain the
conservative path. Origin proof, ingestion validation, diagnostics and lineage
keys remain active. Receipt bytes/digests and cache formats do not change.

After repair, separate operational probes for both deltas compared the resulting
window receipts with an independent full scan of the protected index. Every
window input digest matched, all subscription facts matched exactly, and both
passes stayed fast-path with zero dirty windows and zero full rebuilds.
The single probe shadow times were 1.204 and 1.358 seconds, respectively; these
are correctness probes, not the final repeated timing result.

# Repeated measurement protocol

The retained local harness is under `.release-build/api-marginal-20261110/`;
raw operational copies remain outside the repository. Preparation, pipeline,
baseline restore, trial, matrix, fixed/full-scan probe and summary scripts are
separate. No real source becomes an ordinary test fixture.

Use the pinned Node executable to run `matrix-full.mjs --run`, then
`summarize.mjs`. Each scenario has three trials in each of two process modes.
Orders rotate unchanged/add/append, append/unchanged/add, add/append/unchanged.
Each fresh-process trial starts a new Node process with durable caches. Each
warm-process trial first performs a complete baseline pass in that same runtime,
then applies the delta. This does not claim an OS-cold disk cache.

The final composition uses the production completed companion-projection cache
and unchanged-generation reuse handoff. Snapshot excludes work as production
does; work is measured separately through the work-only backend. An earlier
uncached-projection triplet is retained only as a diagnostic and excluded from
the final comparison. Initial startup is measured to process entry separately
from corpus assertions, copy/reset operations, pipeline timing and warm-up.

Record refresh setup, discovery/graph, index classify/execute/refresh, accounting
proof, window shadow, fast path, report/snapshot projection, work and snapshot
persistence independently. Timings are nested; do not add their span totals.
Missing instrumentation is not silently converted to zero. The quota collector
is an explicit offline no-op, so this experiment makes no quota latency claim.

Every measured pass asserts exact equality of all five statistical fact tables,
zero usage/quota/tool/work facts for the changed API sources, current-generation
work snapshots, and a repeated refresh with zero scanned bytes, no inserted
usage and unchanged generation. Calculation revision changes remain visible;
the repair does not fake an unchanged database or suppress publication.

The predeclared practical threshold is median incremental pipeline cost no
greater than max(1 second, 10% of the corresponding unchanged median). Report
median and full minimum/maximum range, plus paired deltas and host CPU/memory
samples. Three trials provide bounded engineering evidence, not a statistical
guarantee or universal upper bound.

# Validation and remaining gates

The focused window-receipt, shadow, provider-response and refresh-controller
invocation passed **191 tests**, zero failures/skips. It includes full-scan
equality, no-dirty-day reuse, API-parent lineage state, subscription
reclassification, replacement-file fallback, unknown coverage, partial cursors,
removed usage/quota, gaps, basis/pruned manifests and cancellation. Architecture
and preflight also passed. The earlier broad-root failures recorded in the
[recovery receipt](2026-11-10-refresh-workload-recovery.md) remain separate;
no whole-repository, packaged, installed or live passing claim is made here.

The local companion surface gate subsequently passed **300 tests**, zero
failures/skips. These counts are separate invocations with overlapping coverage,
not a claim of 491 unique tests. Source code stayed fixed throughout the final
18-sample matrix.

# Final repeated results

Each cell below is median **[minimum, maximum]**, in seconds, from three runs.
The pipeline is refresh, snapshot reload/publication, then a separate work-only
read. Startup, assertions, copy/reset and warm-up are excluded from pipeline
time. The new-process phase uses durable caches and warm OS data; it is not an
OS-cold disk test.

| Phase | Unchanged | Add short API session | Append existing API session |
| --- | ---: | ---: | ---: |
| New process | 50.554 [48.780, 54.560] | 45.367 [44.883, 49.861] | 49.940 [49.745, 50.985] |
| Warm process | 20.913 [20.032, 24.333] | 23.908 [22.774, 32.622] | 24.226 [22.563, 32.522] |

The new-process medians show no increase. The shorter API-add median must not
be described as an API-induced speedup: discovery/work timings also vary.
In the warm phase, median increases are **2.995 seconds (14.32%)** and
**3.313 seconds (15.84%)**. The unchanged median sets a **2.091-second**
acceptance limit. Both warm scenarios **fail the predeclared threshold**.
Paired per-round median increases are 3.876 seconds for addition and 3.313
seconds for append; their full ranges are 1.861–8.289 and 2.531–8.189 seconds.
No samples were removed or the threshold changed.

All 18 samples preserved the five fact tables exactly, emitted zero statistical
facts from the changed API sources, stayed accounting `fast_path`, and reported
zero dirty/recomputed windows and zero full rebuilds. All 18 replay checks read
zero bytes and inserted no usage. Changes still advance generation/revision;
they are not hidden from publication or freshness.

## Stage evidence

Stage cells are median **[minimum, maximum]**, in **milliseconds**. Nested spans
are not additive. `index_refresh` includes discovery/maintenance;
`snapshot_index_projection` includes report work; `projection_work` includes
origin and project resolution. Full stage records remain in `full/summary.json`.

| New process stage | Unchanged | Add short | Append existing |
| --- | ---: | ---: | ---: |
| Process startup to entry | 707 [685, 728] | 697 [510, 763] | 662 [649, 698] |
| Index discovery | 7257 [7172, 7395] | 7120 [5526, 7406] | 7000 [6416, 7053] |
| Discovery graph | 6450 [6377, 6465] | 6283 [4861, 6644] | 6039 [5675, 6244] |
| Index execute | 7.4 [5.8, 7.8] | 21.0 [17.3, 28.6] | 906.8 [838.5, 936.0] |
| Index refresh | 12105 [11744, 12255] | 11884 [9219, 12239] | 12718 [12299, 12748] |
| Accounting origin proof | 3773 [3757, 3955] | 3688 [3577, 3742] | 3881 [3880, 3956] |
| Accounting window shadow | 585 [569, 588] | 1036 [1017, 1150] | 1009 [999, 1020] |
| Accounting fast path | 950 [883, 1036] | 1025 [935, 1043] | 895 [880, 919] |
| Snapshot index projection | 3445 [3324, 3616] | 3365 [2996, 3387] | 3448 [3205, 3564] |
| Report projection | 2513 [2406, 2700] | 2490 [2198, 2500] | 2536 [2296, 2602] |
| Work usage | 24859 [24769, 30142] | 23799 [20670, 24836] | 24738 [24438, 25576] |
| Retained-snapshot persistence call | 0.284 [0.283, 0.372] | 0.293 [0.285, 0.321] | 0.309 [0.266, 0.309] |

| Warm process stage | Unchanged | Add short | Append existing |
| --- | ---: | ---: | ---: |
| Process startup to entry, before warm-up | 553 [533, 677] | 610 [566, 718] | 766 [529, 875] |
| Index discovery | 829 [823, 958] | 872 [812, 1135] | 938 [750, 990] |
| Discovery graph | 93 [89, 124] | 97 [90, 145] | 98 [78, 122] |
| Index execute | 3.4 [3.4, 6.4] | 18.9 [16.2, 23.7] | 693.5 [642.0, 1008.6] |
| Index refresh | 1337 [1316, 1619] | 1450 [1352, 1915] | 2296 [1959, 2815] |
| Accounting origin proof | 0.783 [0.735, 0.874] | 8.233 [8.215, 9.938] | 0.838 [0.733, 1.133] |
| Accounting window shadow | 489 [412, 547] | 847 [829, 1242] | 810 [782, 1151] |
| Accounting fast path | 734 [702, 860] | 731 [706, 1045] | 728 [690, 1022] |
| Snapshot index projection | 63.6 [59.0, 72.6] | 2568 [2528, 3547] | 2490 [2440, 3761] |
| Report projection | Cached; no build span | 1887 [1859, 2627] | 1815 [1789, 2659] |
| Work usage | 15311 [14539, 17498] | 15670 [14685, 21226] | 15472 [13643, 20238] |
| Retained-snapshot persistence call | 0.048 [0.047, 0.057] | 0.049 [0.047, 0.245] | 0.204 [0.185, 0.241] |

`snapshot_persist` times the optional retained-receipt call, including its
eligibility/throttle checks; it does not prove a durable disk write. Snapshot
in-memory publication occurs inside the measured reload/build/clone path. No
separate atomic-publication duration was instrumented, so none is invented.
Installed-app retained-snapshot persistence remains a separate gate.

Host sampling recorded 303 observations: total CPU median 25.58%, range
15.82–55.64%; available memory median 9304 MiB, range 8586–11534 MiB. These
are whole-host observations across preparation/assertions as well as measured
passes. They do not attribute work-stage variance to a particular process or
establish statistical significance from three runs.

## Proven boundary and remaining calculation point

The window-receipt repair removes the demonstrated all-history scan: API
addition/append now reuse every day, and full-scan receipt equality is proven.
Addition costs only 17–29 ms in new-process index execution. A large modern
API append still replays its entire changed 380247692-byte file in about
0.64–1.01 seconds of warm-process index execution, retaining validation and
lineage. Arbitrary file growth therefore has no constant-time guarantee.

The remaining repeatable cost is at
`apps/local/server.js:createCachedLocalUnifiedProjectionReader`,
`src/local-companion-refresh.js:reusableUnifiedProjection`, and
`src/local-index-companion-source.js:readLocalIndexCompanionProjection`.
An unchanged refresh supplies the same generation proof and reuses its completed
report. An API-only catalog/revision change publishes a different generation,
so it correctly rebuilds the report via `src/local-index-report.js`.
The warm snapshot projection increases from 64 ms to about 2.5 seconds even
though statistical facts are equal. Work usage varies and still dominates
overall time; that variation is not evidence of API-induced recomputation.

Do not bypass the generation fence, relabel the database, hide source/diagnostic
changes, broaden the cache key, weaken origin/ACL checks or add another timeout
to manufacture a passing result. The next eligible small investigation is
profiling the existing report calculation and validity checks, preserving exact
output, before considering any cross-generation reuse contract. No new reuse
contract or persistent cache is implemented by this receipt.

The requested blanket claim that excluded API changes do not materially
increase the whole warm refresh is **not qualified**. The narrower claim that
these deltas do not trigger accounting-window recomputation **is qualified on
this protected corpus**. No candidate was built or activated, and the running
live application remains unqualified by this experiment.
