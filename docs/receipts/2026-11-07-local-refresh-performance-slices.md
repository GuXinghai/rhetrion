---
title: Live read-only work-origin and snapshot projection comparisons
date: 2026-11-07
type: receipt
status: partial
source_commit: 9b0b5fa1a7b8b504f08f7dd869e87499bbbec301
---

# Result and boundary

Two uncommitted source repairs were compared directly against live production
inputs on Windows x64: bounded plain-header reads with authenticated in-process
relation reuse, and companion-only dashboard projection. No production refresh
was triggered, profile/source state was not written, and the running app was
not restarted or replaced. Schema and durable cache formats are unchanged.

These are reader/projection measurements, not whole-refresh, installed-app,
signed-artifact or release qualification. Process startup, discovery, ingestion,
accounting proof/shadow and snapshot persistence were outside these comparisons.
The original 366-second refresh cannot be compared directly with these runs.

The running stable package was build `2026110704`, manifest revision
`96045152d39b5a1c19d4f71d2964f537daf1bb92`, ASAR SHA-256
`18d2e1bf36d7cfe8f32e20d703660bd4c2c396489ec2a956d1deab44c5f43325`.
Its original thread-store and log-source modules matched the checkout's HEAD
bytes. The comparisons used its executable as a separate hidden Node process
with `ELECTRON_RUN_AS_NODE=1`, embedded Node `24.22.1`; they did not invoke its
application entrypoint. The changed reader module SHA-256 was
`aa06e5fad05d50723b1191e0d7e1f57655330d3c1e74da2a87306c884e28002f`.

# Method

The explicit read-only entrypoint is
`scripts/benchmark-work-origin-reads.mjs`; its admission and invocation contract
is recorded in the [repair plan](../plans/2026-11-07-local-refresh-performance.md).
Each matrix used three fresh processes, then one separate process with an
excluded warm-up and three measured pairs. Reader order alternated. Fresh
process means cold in-process caches, not cold OS file cache. No percentile
claim is made from three runs.

Origin pairs used the same generation, inventory and keyed corpus fingerprint.
Only stable, already indexed source files were selected. Seven mutable sessions
were excluded; required parent sources remained bounded by the original reader.
Each accepted pair had exact relation equality, unchanged file-state evidence,
unchanged generation and unchanged candidate bytes. Earlier comparisons with a
growing source, moving generation or changed candidate were refused and are
excluded below. No private paths, identifiers, header records or raw errors are
retained in this receipt.

Snapshot pairs pinned the same index generation and millisecond anchor and
compared `includeWorkUsage: true` with `false` using the repaired reader on both
sides. Thus the snapshot baseline already benefits from the origin cache in
warm runs. Both sides used empty declared-speed baselines. Companion equality
excluded only `readWallMs`, an execution measurement; all figure, coverage and
generation fields matched. Work output is not a persisted dashboard field.

# Work-origin comparison

Generation `25052`; 4,262 selected sessions and 4,367 opened source files per
read. Baseline is the original HEAD reader; candidate is the repaired reader.
All six measured pairs passed equality and stability checks.

| Phase | Baseline samples, ms | Candidate samples, ms | Median before / after | Range before / after, ms |
|---|---|---|---|---|
| Fresh process | 9527.054, 9883.105, 9835.002 | 10645.384, 11056.877, 10757.571 | 9835.002 / 10757.571 | 9527.054–9883.105 / 10645.384–11056.877 |
| Warm process | 10401.655, 9813.939, 9568.562 | 8048.313, 7531.650, 7414.886 | 9813.939 / 7531.650 | 9568.562–10401.655 / 7414.886–8048.313 |

Warm median improved by 23.3%. Native reads fell from 48,305 to 86 and actual
bytes from 207,778,849 to 345,331 (99.83% fewer). All 4,367 native opens and
owner/link/reparse checks remained. Residual unverified headers were read
again; unknown evidence was not promoted to a cached relation.

Fresh-process median regressed by 9.4%, about 0.92 seconds, from the additional
identity-bound nanosecond state checks needed to seed safe reuse. This tradeoff
is explicit; the repair is not a cold-start acceleration claim. The cache is
bounded to 8,192 entries and stores only narrowed relations. It never retains
handles or raw records and is discarded on process exit. A refused open,
changed/unidentifiable state, cancellation or failed close prevents reuse.

In the middle warm pair, baseline stages were: realpath 1303.667 ms, open
4959.033 ms, read 2822.307 ms, parse 112.203 ms, validate 264.874 ms and close
266.627 ms. Candidate stages were: realpath 1117.925 ms, open 4824.528 ms,
read 6.177 ms, parse 0.157 ms, validate 667.605 ms and close 260.619 ms.
Additional state checks and orchestration are not fully represented by those
subspans. Native security opens remain the largest residual work cost.

# Snapshot projection comparison

Generation `25053`; fixed anchor `1794006546388` ms. All six measured pairs
had exact companion equality and stable generation/candidate checks.

| Phase | Combined samples, ms | Companion-only samples, ms | Median before / after | Range before / after, ms |
|---|---|---|---|---|
| Fresh process | 24989.129, 20514.499, 21235.039 | 2127.534, 1736.297, 2954.886 | 21235.039 / 2127.534 | 20514.499–24989.129 / 1736.297–2954.886 |
| Warm process | 16346.228, 15453.224, 15279.481 | 1854.136, 1577.205, 1458.544 | 15453.224 / 1577.205 | 15279.481–16346.228 / 1458.544–1854.136 |

The projection median improved by about 90% in each phase. Candidate samples
contained `projection_report` and no `projection_work`. This removes discarded
work from the dashboard's critical path; it does not eliminate work reports.
The existing work query service still owns its independent build, honest
preparing/retained state, generation/anchor validation, lease and cancellation.

The middle fresh combined sample spent 1766.162 ms in report and 18728.328 ms
in work: memberships 47.707 ms, origins 15552.464 ms, projects/Git 2305.389 ms,
aggregate 346.319 ms and finalize 19.196 ms. Origins included 2801.110 ms of
path queries. These are nested stages, not additive totals. The middle warm
combined sample spent 2912.417 ms in report and 12519.860 ms in work; its
origin stage was 9690.936 ms despite header-read reuse, with 1884.930 ms path
queries and 4931.265 ms native opens.

# Rejected experiment and remaining gates

Source validation passed:

- local companion suite: 300 passed;
- UI suite: 904 passed;
- scoped origin/metadata/source-adapter tests: 68 passed, 1 skipped;
- Windows metadata parity plus benchmark admission: 10 passed;
- tool inventory and benchmark admission: 6 passed;
- index refresh, refresh timing, accounting origin-cache/reuse tests: 32 passed;
- architecture, tool inventory, syntax checks and preflight: passed.

An earlier broader discovery test run had three failures. Loading the changed
modules directly from HEAD reproduced each: `local_index_impact_reason_invalid`
in the deep-fork case, `local_index_family_mismatch` in a legacy fixture, and
the compressed symlink refusal-code assertion. No assertion was weakened, and
the discovery experiment was removed. This is not a claim that the complete
repository suite passes.

Within-pass discovery cutoff batching was implemented and tested, then removed:
the live inventory had 99 history bases referencing 99 distinct parents, so it
offered no benefit for the observed workload. No discovery production change is
retained. Cross-refresh graph I/O, main-thread responsiveness and quota scan
cost remain separate optimization slices; accounting proof was not changed.

The running candidate has not loaded either repair. A fresh authorized candidate
and an app-driven full refresh are still required to measure snapshot publish,
whole-refresh latency and user-visible timeout frequency. Existing no-restart
and no-manual-refresh restrictions were preserved. Source/loopback/live-reader
evidence does not close that runtime gate.
