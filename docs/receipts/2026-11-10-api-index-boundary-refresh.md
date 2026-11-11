---
title: API exclusion before index admission and cached refresh comparison
date: 2026-11-10
type: receipt
status: measured-protected-copy-source-qualified
---

# Scope and prior result

Owner direction: omit API-key/custom-provider sessions from the index instead
of adding a more complex cross-generation report cache. This follows the
[prior marginal comparison](2026-11-10-api-session-marginal-refresh.md), whose
warm-refresh threshold was not met because API-only catalog changes published
a new generation and rebuilt the report projection.

Windows x64, Node.js 26.2.0, HEAD `71f1a2cb` plus the existing uncommitted
recovery/API-exclusion work and this discovery-admission change. No new UI
declaration, dependency, schema, persistent cache, cache field or migration.
No live profile, settings, source, candidate, installed state or release changed.
This is offline operational qualification on protected copies; ordinary tests
use synthetic, content-free records. No credentials or provider requests were
used. Optional independent model-performance ingestion remains a separate gate.

Measured source digest:
`ee580c56db54a472b384cfd6f65fc92fb8fafc7335e6508ae2ab8199508b5135`.
SHA-256 input is each relative path, NUL, file bytes, NUL, in order:
`src/providers/codex/log-sources.js`, `src/local-index-refresh.js`,
`src/local-index-extract.js`, `src/providers/codex/tier-normalization.js`,
`src/local-index-accounting-windows.js`.

# Implementation boundary

`src/providers/codex/log-sources.js` applies the existing explicit API predicate
while inspecting session metadata. The unified refresh requests subscription
admission; independent API histories are removed before graph hashing/cutoff
validation and indexing. A non-API source retains the complete ambiguity and
physical/logical ancestry closure, including any API dependency. A conflicting
representation or damaged dependency cannot disappear behind the filter.

`src/local-index-refresh.js` does not register the retained API dependencies.
When subscription work needs them, the existing guarded extractor supplies
bounded model/counter state and replay keys in memory. Full source guards,
history-cutoff checks, validation, cancellation and lineage fallback remain.
No API source, session, cursor, work or statistical fact is created. An unchanged
subscription component does not repeatedly parse its transient API ancestry.

The existing persisted inspection cache can skip a header only when exact
physical state matches and retained statistical facts under the current v23
parser establish subscription admission. Empty/older sources still receive
bounded header classification. This proof uses existing rows and indexes; no
classification value is added to the persisted cache or parser stamp relabeled.

Existing cataloged API sources receive one correction transaction after a
guarded header recheck. Derived facts/rollups and diagnostics are cleared,
cursor is retired, and an absent catalog tombstone plus the ordinary impact
receipt preserve ordinal/provenance history. Unavailable evidence is not
reclassified. Later source growth does not update the tombstone. A changed
subscription declaration gets ordinary readmission/replay. Cancellation or
source change preserves prior facts. Same-session subscription continuations
replay as needed after correction.

The earlier empty-source exception in `local-index-accounting-windows.js` and
its dedicated tests were removed. Window-receipt conservative fallback logic
is unchanged from HEAD; source admission now prevents the unnecessary change
instead of teaching accounting to ignore it. Publication identity and completed
report-cache validity rules are unchanged.

# Protected corpus and baseline

Reuse the authenticated **15,472,612,460-byte** operational corpus from the prior
receipt. New owner-only index/collector files were copied with native guarded
reads, no-clobber creation, fsync, source-state revalidation and hash readback.
Raw source files remain outside the repository. The previous operational
baseline/evidence is retained. No real source data is added to ordinary tests.

An unmeasured normal preparation pass retired **15** existing API catalog
entries and maintained the accounting/window caches. It produced generation
**4371**, calculation revision **2390648**, **4355** present sources,
**15** absent tombstones, **4265** retained session rows and zero quarantines.
All five statistical fact tables stayed exact: **563959** usage,
**488361** quota occurrences, **387834** tool facts, **43088** lifecycle facts,
**33595** boundaries. Existing orphaned session/provenance rows are preserved;
future API-only sessions are never interned.

Each trial restores that exact index/collector baseline while preserving
database physical identity. Fixed clock is `2026-11-09T18:11:38.273Z`.
The unchanged corpus, a restored real **144952-byte** API session, and an actual
**112550084-byte** tail appended to an existing **267697608-byte** API source
use the same protocol, order rotation and process separation as the prior
comparison. Final long-source size is **380247692 bytes**. Preparation and
warm-up are excluded. No OS-cold disk-cache claim is made.

The ignored harness is `.release-build/api-index-boundary-20261110/`:
`prepare-state.mjs --prepare` creates the new state copy, `pipeline-full.mjs
--seed` performs normal correction/cache preparation, `matrix-full.mjs --run`
runs the restored/interleaved comparison, and `summarize.mjs` reports medians
and full ranges. Raw operational corpus locations/identities are not output.

Acceptance remains median incremental pipeline cost <= max(1 second, 10% of
the corresponding unchanged median), three samples per scenario in each
process mode. Every pass must also prove the baseline generation/revision,
source/session/event counts unchanged; exact five-table statistical equality;
zero new API catalog/facts; zero ingestion bytes and touched sources; current
work snapshot generation; and an idempotent zero-byte follow-up refresh.
Header/discovery filesystem I/O is real and is not claimed as zero ingestion
time or zero physical reads. Adding arbitrarily many files still costs directory
walk/stat/header work.

# Validation

Focused source/history/refresh/window verification passed **110 tests**, zero
failures, with one existing Windows replacement-contract skip. The final
provider-response invocation passed **30 tests**, zero failures/skips, including
API-only publication invariance, long append/removal, legacy correction,
cancellation/readmission, inline API parents, paginated API bases and restart.
The invocations overlap and are not summed as unique coverage.

Extended hardening/compression verification found three failures: compressed
symlink error-code expectation, deep-fork impact reason, and legacy-family
upgrade admission. All three were independently reproduced in the existing
detached checkout at unchanged HEAD `71f1a2cb` with the same pinned Node and
isolated runner. No assertion, timeout, native boundary or platform gate was
weakened. Broad-root qualification remains open as recorded in the
[recovery receipt](2026-11-10-refresh-workload-recovery.md).

The final local surface invocation (`pnpm run product:local:test`, pinned
Node.js 26.2.0) passed **300 tests**, zero failures/skips. An earlier invocation
failed with `fetch failed` / `bad port` in loopback tests. The relevant server
and test files are unchanged from HEAD; a separate unchanged-HEAD server-test
invocation passed 51 tests and did not reproduce the failure. Read-only host
inspection found the TCP dynamic-port range starts at 1024 and includes ports
blocked by Fetch, consistent with an intermittent port-zero allocation issue;
the original allocated ports were not captured, so that cause is not proven.
The complete local suite then passed without source/test/system changes or
relaxed checks. Interrupted verification attempts are not counted as passes.

# Repeated results

All **18** measured trials and their follow-up replay checks completed. Every
trial retained generation **4371**, calculation revision **2390648**, catalog,
session and event counts, and exact equality of the five statistical fact
tables. All report zero touched/resumed/rescanned sources, zero ingestion bytes
and zero new usage. Accounting remains `fast_path`, with zero fallback,
dirty/recomputed/unavailable/mismatch windows and full rebuilds. Work usage is
executed in every trial and its four-period snapshots match the current
generation. Every API-add trial has no catalog entry for the added source.

The nine warm trials contain **no `projection_report` build span**. They reuse
the existing completed projection without modifying the publication fence or
cache key. Independent fresh processes still build their in-memory report
once, as expected. The previous implementation's approximately 2.5-second
warm-report rebuild after API changes no longer occurs.

Pipeline wall times below are **seconds**, median [minimum, maximum], three
samples per cell. Pipeline means collector/index/accounting refresh, snapshot
reload, and separate full work-usage read; it excludes startup, corpus restore,
verification and warm-up. It is not a live desktop refresh measurement.

| Process mode | Unchanged | Add short API session | Append existing API session |
| --- | ---: | ---: | ---: |
| Fresh process, durable caches | 53.405 [46.524, 56.493] | 51.706 [48.369, 52.945] | 49.598 [45.632, 70.431] |
| Warm process | 27.183 [19.081, 42.351] | 26.361 [19.036, 31.555] | 24.945 [18.675, 33.798] |

Both API deltas meet the predeclared median-increase threshold in both process
modes. Fresh-process median changes are -1.699 and -3.808 seconds against a
5.341-second limit; warm changes are -0.822 and -2.238 seconds against a
2.718-second limit. Negative differences are **not evidence of an API-induced
speedup**. No sample was removed, and the threshold was not changed.

There is substantial wall-clock variation. Across 335 host samples total CPU
was median 25.73%, range 17.33–68.61%; reported available memory was median
13377 MiB, range 18–16210 MiB. This is a shared-host engineering comparison,
not statistical equivalence, an OS-cold benchmark, a production latency
guarantee or proof of constant work for arbitrary numbers of files. Version
invariance, zero ingestion and the absence of warm report builds provide the
stronger deterministic evidence for this slice.

## Stage breakdown

Values below are **milliseconds**, median [minimum, maximum], three samples
per cell. Stages nest: discovery is inside index refresh, shadow is inside
accounting fast path, report is inside snapshot projection, and work origins
is inside work projection. Do not add these rows. `processStartMs` measures
spawn to the first process-entry event; initial inventory checks and composition
are outside pipeline timing and are not represented by that single span.

Fresh process, using the same durable baseline:

| Stage | Unchanged | Add short | Append existing |
| --- | ---: | ---: | ---: |
| Process start | 847.0 [547.0, 912.0] | 712.0 [672.0, 841.0] | 798.0 [762.0, 814.0] |
| Index discovery | 8464.7 [5709.4, 8785.1] | 7919.8 [6848.2, 8579.2] | 7866.9 [6903.0, 8134.6] |
| Discovery graph | 6997.3 [4798.4, 7098.0] | 6818.9 [5884.6, 7512.9] | 6769.8 [5816.8, 7134.7] |
| Index refresh | 13509.1 [9230.3, 14057.8] | 13064.5 [11498.5, 13852.1] | 13033.6 [11906.5, 14048.1] |
| Index execution | 6.6 [4.6, 6.7] | 6.3 [5.8, 6.6] | 6.8 [6.2, 7.0] |
| Accounting origin proof | 4533.8 [3322.0, 4886.1] | 3768.5 [3621.4, 3955.7] | 3846.7 [3416.7, 4582.9] |
| Accounting window shadow | 632.0 [477.0, 639.3] | 590.9 [569.9, 645.6] | 588.9 [481.4, 682.0] |
| Accounting fast path | 1028.3 [718.9, 1133.1] | 924.4 [889.4, 1104.4] | 910.5 [749.6, 1069.9] |
| Snapshot index projection | 3301.7 [2528.2, 3421.9] | 3444.8 [3303.2, 3603.1] | 3416.5 [2766.8, 4877.7] |
| Report build | 2411.2 [1866.0, 2483.7] | 2536.9 [2420.9, 2730.2] | 2526.3 [2057.8, 3917.2] |
| Work projection | 27527.5 [26825.5, 28661.9] | 26026.7 [25066.8, 26127.8] | 25319.7 [22024.1, 40943.7] |
| Work origins | 22359.4 [21062.0, 23613.1] | 20677.0 [20175.5, 21292.1] | 20375.9 [17676.5, 35233.2] |
| Optional snapshot persistence call | 0.3 [0.2, 0.3] | 0.3 [0.3, 0.4] | 0.3 [0.3, 0.3] |

Warm process, after a complete baseline pass in the same runtime:

| Stage | Unchanged | Add short | Append existing |
| --- | ---: | ---: | ---: |
| Process start, before warm-up | 870.0 [562.0, 894.0] | 577.0 [513.0, 745.0] | 694.0 [689.0, 754.0] |
| Index discovery | 1116.8 [922.1, 2784.8] | 1297.4 [872.5, 1541.6] | 1064.2 [950.8, 1808.8] |
| Discovery graph | 120.0 [85.9, 298.4] | 111.3 [86.9, 148.2] | 111.7 [86.0, 172.7] |
| Index refresh | 1714.5 [1399.7, 3710.8] | 1944.6 [1352.5, 2341.5] | 1602.2 [1424.6, 2747.9] |
| Index execution | 6.2 [5.8, 8.4] | 6.4 [5.4, 6.8] | 7.4 [5.4, 11.1] |
| Accounting origin proof | 0.9 [0.8, 1.2] | 1.1 [0.7, 1.4] | 0.9 [0.8, 1.7] |
| Accounting window shadow | 542.7 [451.2, 790.3] | 624.5 [426.7, 949.9] | 584.3 [467.4, 949.8] |
| Accounting fast path | 919.3 [750.6, 1763.3] | 903.9 [698.6, 1070.2] | 981.9 [678.0, 1431.7] |
| Snapshot index projection | 75.9 [59.9, 131.9] | 74.0 [57.9, 84.3] | 78.3 [56.5, 90.4] |
| Report build | No build span | No build span | No build span |
| Work projection | 20075.4 [13571.7, 27059.7] | 18474.4 [13755.4, 22486.5] | 17912.9 [13280.9, 23660.0] |
| Work origins | 15265.3 [10882.4, 21324.1] | 14548.5 [11107.7, 17611.2] | 14337.2 [10767.4, 17500.4] |
| Optional snapshot persistence call | 0.2 [0.1, 0.8] | 0.2 [0.0, 0.3] | 0.3 [0.2, 0.4] |

Snapshot persistence includes eligibility/throttle and does **not** prove a
durable disk write or production publish latency. The harness's supplemental
`work.metadataAvailable` boolean probes a field not projected by the public
work snapshot; its recorded false values are not evidence of unavailable
metadata. Metadata completeness is not qualified by that probe. Work execution,
available snapshot status and generation equality are separately asserted.
Copied metadata databases remain unchanged across the API source deltas.

Architecture boundaries passed for 413 production files and 1464 imports with
zero approved debt edges. No candidate was built or activated; packaged/native
rendering, live refresh and independent model-performance-page latency remain
separate gates. `docs:check`, `test:preflight` and `git diff --check` passed.
The final measured-source digest still matches the digest recorded above.
