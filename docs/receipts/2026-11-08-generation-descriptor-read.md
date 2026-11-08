---
title: Metadata-only generation descriptor verification
date: 2026-11-08
type: receipt
status: partial
---

# Problem and boundary

The live `2026110803` natural pass took 62779.967 ms in `index_descriptor`.
The [cutoff receipt](2026-11-08-history-cutoff-proof-reuse.md) records its
failed end-to-end waiting target and a new work timeout. Source inspection
found that `createLocalIndexBackend.describeCurrentGeneration` built the full
companion report and retained only its generation descriptor. The report's
pricing, quota series, impact and presentation projections were discarded.
This slice removes that work; it is not another worker/isolation change or a
claim to solve origin, accounting-window or work-query latency.

The new facade calls the existing `readLocalIndexReportMetadata` and original
`describeLocalIndexGeneration` inside one SQLite read snapshot. It preserves
rollup-basis admission, committed-cursor membership, inclusive future cutoff,
observed bounds, source coverage, tool evidence, issues and calculation
revision. Missing/unreadable/stale-basis stores return null, cancellation
propagates and the connection closes. The backend's retained descriptor also
requires unchanged calculation revision: that revision can change without
advancing commit sequence or the generation fingerprint. Existing
clock-dependent descriptor-cache semantics are unchanged.

Schema, durable formats, migration behavior, accounting numbers, origin
security, attribution, request/refresh timeouts and reporting periods are
unchanged. The complete report still exists for callers that consume it.
Removing its discarded instance does not qualify another surface or release.

# Validation

The isolated new descriptor tests (5) and existing backend tests (13) passed:
18 passed, no failures/skips. Cases compare every descriptor field with the
full report for complete, future-cutoff, provisional, tool-partial, quarantined
and empty evidence. A report-only quota table removed in a synthetic store
does not prevent descriptor reading, while the full report fails. Missing,
uncommitted and stale-basis refusal and cancellation remain explicit. A second
WAL connection commits after the read snapshot is pinned; all returned fields
still belong to the original publication. The backend revision-cache test
advances only calculation revision and requires a fresh matching descriptor.
Owning broader gates and candidate loading are recorded separately below.

The complete local surface suite passed 300 tests with no failures or skips.
Architecture passed (413 production files, 1462 imports, zero debt), tool
inventory was complete and preflight passed all 20 tests. The separate
benchmark/accounting/API-reference selection passed 8 tests and failed 2.
Both failures were reproduced unchanged in a detached `870e8634` checkout,
with the exact verified native binary and sidecar copied for synthetic tests:
the API route-count assertion expects 18 but source registers 20; the accounting
observer assertion expects the older eight stages, while existing nested
instrumentation emits additional stages. The baseline selection passed 7 and
failed those same 2 tests. Neither assertion nor production instrumentation
was changed. This slice does not claim a green complete root suite.

# Synthetic matrix

Windows x64 Node `22.21.1`, seed 71, 12 sources/12000 events/30 days, variety
enabled, fixed anchor `1788224400000`, generation `12`, calculation revision
`61040`. Corpus digest:
`2be308e50bc3db25dff9fe3a4ee60a4c894031bfa500cfdc5e44915fe931f37d`.
Three fresh reader processes and a separate warmed process with one excluded
warm-up/three measured pairs alternated order. Each compared the former full
report's descriptor with the metadata-only facade exactly. Source hash and
publication/revision stayed fixed. Fresh process does not mean cold OS cache.
Corpus preparation, process start and imports are outside reader wall time.

| Phase | Full report samples, ms | Metadata samples, ms | Median before / after, ms | Range before / after, ms |
|---|---|---|---|---|
| Fresh process | 1588.877, 1358.192, 2252.828 | 31.163, 45.601, 38.932 | 1588.877 / 38.932 | 1358.192–2252.828 / 31.163–45.601 |
| Warm, warm-up excluded | 1034.844, 938.955, 1034.533 | 15.825, 25.559, 25.333 | 1034.533 / 25.333 | 938.955–1034.844 / 15.825–25.559 |

The synthetic medians fell about 97.5% in each phase. This proves removal of
discarded report work on that corpus, not an equivalent reduction in the
complete refresh. The source matrix hash was
`9406cdc572f5182fd83721dc5379473d0e184f69f52717632d42078df8a0397d`.

# Live read-only matrix

Separate hidden Node-reader processes used the running `2026110803` package's
embedded Node `24.22.1`, not its app entrypoint. No refresh or profile write was
triggered. Generation `25208`, calculation revision `23343092` and anchor
`1794117029368` stayed fixed across three fresh-process pairs and a separate
warm-up/three warm pairs. Complete descriptor equality and unchanged source
hash held in every pair. The source matrix hash, ordered by this maintained
diagnostic's source list, was
`e97677ed59abbc99aa56e73b3dc3d37f3d82d21fbf13ebbd4c381d5c961aa3ab`.

| Phase | Full report samples, ms | Metadata samples, ms | Median before / after, ms | Range before / after, ms |
|---|---|---|---|---|
| Fresh process | 23233.582, 6344.884, 2216.922 | 224.683, 68.774, 48.542 | 6344.884 / 68.774 | 2216.922–23233.582 / 48.542–224.683 |
| Warm, warm-up excluded | 3039.796, 2040.404, 2075.551 | 284.835, 51.222, 53.179 | 2075.551 / 53.179 | 2040.404–3039.796 / 51.222–284.835 |

Warm median fell 97.4%; the large cold/full-report variation remains explicit.
Each pair still removed substantial work. These are paired read-only reader
measurements with an active app and shared OS cache, not a controlled whole-
refresh before/after. No accounting proof or work origin data was read by the
comparison. Default empty speed baselines are equivalent for descriptor
fields, which contain no presentation prices. The target's admission pins
publication plus calculation revision and refuses a changed pair. The loop
does not cache completed descriptors itself; both sides execute their read.

# Remaining gates

Exact candidate packaging, isolated native rendering and normal loading are
separate evidence. The running `2026110803` does not load source edits.
The whole-refresh target must continue to include fresh work availability;
snapshot publication alone cannot pass it. No manual live refresh, direct
profile edit, forced termination, installation, signing, publication or push
is performed by this slice. Rollback is the normal source revert and loading
the preserved prior candidate after normal quit; no format conversion is needed.
