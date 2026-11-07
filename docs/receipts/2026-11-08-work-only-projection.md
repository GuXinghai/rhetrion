---
title: Work-only projection repair and production verification
date: 2026-11-08
type: receipt
status: partial
source_commit: 8f2307edc41606ccd8b7dbd307a12765cb0e49be
---

# Scope and result boundary

This follow-up repairs the independent work-query direction of the discarded
projection problem. Build `2026110705` had already removed work construction
from dashboard publication, but work queries still built a companion report
that their selector discarded. Source `8f2307edc41606ccd8b7dbd307a12765cb0e49be`
adds a work-only backend read and routes independent work builds through it.
The same work core, scope/window selector, source guards and query lifecycle
remain. No schema, durable cache format, account attribution or timeout changed.

The work-only reader captures `commit_seq` before asynchronous metadata access
and refuses publication changes after completion. It also retains the former
report's current-rollup-basis admission: the raw fallback still uses stored
context classes and cannot authorize stale pricing thresholds. Unknown/partial
metadata remains explicit. No completed work projection or name cache was added.

This record distinguishes source tests, live read-only comparisons and loading
the package. It does not establish that all recurring timeouts are fixed.

# Production diagnosis before this repair

Read-only observations on build `2026110705` at `2026-11-07T14:43–14:44Z`
confirmed continuing `work_usage_timeout` diagnostics. The latest 24 records
were background `preload`, stage `request`, HTTP status null, around 10000 ms.
Their spacing varied; the evidence does not support an exact ten-minute period.

The natural refresh from `14:40:05.047Z` to `14:44:12.580Z` succeeded in
247533.656 ms. Its graph stage was 95259.510 ms, discovery 120052.830 ms,
accounting proof origins 25385.118 ms, window shadow 42805.643 ms and snapshot
build 25463.879 ms. There was no snapshot `projection_work`. Thirteen health
samples taken during the final part of that pass had median 150 ms and maximum
12145 ms. This shows a control route can exceed the preload deadline, but does
not locate the exact blocking operation or prove graph caused a timeout.

Inspection-cache hits skip lineage/header and compression inspection, not
graph validation. Each discovery recreates its cutoff Map and rereads each
unique history prefix; duplicate representations may require full hashes.
The graph timer includes these reads, cycle/quarantine propagation and sorting.
Plain cutoff reads yield at each asynchronous 256 KiB read. The existing
discovery Node no-follow ports are distinct from native authenticated work
origin reads; the native-origin proof cannot be claimed for graph access.
No discovery optimization is included in this source repair.

Separately, completed work queries still synchronously aggregate and sort
their bounded cells before fresh display enrichment. Their page size does not
bound total aggregation time. These operations and other same-process SQLite
projections remain candidates for further measurement. The request/null
diagnostic alone cannot distinguish them.

# Source and package checks

- Local companion suite: 300 passed.
- Backend/publication and server tests: 63 passed after repairing the test
  composition's missing backend timeout port; assertions were preserved.
- Work core/service, routes and snapshot tests: 48 passed.
- Benchmark admission and tool inventory: 6 passed.
- Final backend tests: 12 passed, including current-basis admission,
  publication mutation, cancellation, missing state, exact work equality and
  invalid timing-option admission.
- Architecture and preflight: passed. These do not assert the complete root
  suite passes; previously reproduced unrelated failures remain separate.

Unsigned candidate `2026110801`, product `0.1.27`, source `8f2307ed`, was
staged using Node `26.2.0` and packaged as a Windows x64 directory, with signing
disabled and publish never. Exact staged/archive union and byte verification
passed for 760 files. ASAR SHA-256:
`2874da87a0bee8ef4646b86a0c7c366365285835c866f9a3491051d1ba8feb05`.
The prior candidate and prior staging were preserved.

The actual package rendered in a disposable synthetic profile: health/snapshot
ready, overview visible, no alert dialog. The work route returned preparing
then available, with one synthetic row and honestly partial metadata. The
reviewed quit protocol exited it normally. Quota was unavailable with
`app_server_unavailable` without real credentials, so the normal hosted smoke
remains an environment gap. This does not qualify credentials, native general
path policy, an installer, signing, publication or updater behavior.

# Live reader comparison and candidate loading

The explicit `--target work` reader comparison used the prior package's
embedded Node `24.22.1` in separate hidden reader processes, not its app
entrypoint. Generation `25120` and anchor `1794064342013` were fixed, with
default empty declared-speed baselines on both sides. Exact work equality
excluded only metadata's observation timestamp. All seven accepted pairs
(including the excluded warm-up) had equal work output, stable publication and
unchanged source hashes. A prior attempt whose source changed was refused and
excluded. No result was published and no manual refresh was sent.

| Process phase | Combined samples, ms | Work-only samples, ms | Median before / after, ms | Range before / after, ms |
|---|---|---|---|---|
| Fresh process, paired reads | 33598.616, 16017.822, 21703.256 | 22946.880, 20380.950, 14718.144 | 21703.256 / 20380.950 | 16017.822–33598.616 / 14718.144–22946.880 |
| Warm process, warm-up excluded | 16785.792, 13718.212, 13945.363 | 15795.478, 13259.424, 26508.628 | 13945.363 / 15795.478 | 13718.212–16785.792 / 13259.424–26508.628 |

These are paired live observations, not controlled independent cold-cache
measurements. Reader order alternated, but the second reader in a fresh
process can reuse authenticated origin relations seeded by the first reader.
External metadata was not frozen. The owner normally exited the old candidate
during the second fresh-process pair; later reads therefore ran without its
automatic refresh/background work. The publication remained fixed, but this
change in competing activity and origin-open variation prevents attributing a
total-time percentage to this repair. Warm median was 13.3% higher for the new
reader, and its last sample spent 24.121 seconds in origins versus the
baseline's 9.997 seconds. No total work-speed improvement is claimed.

The narrower proven change is removal of `projection_report`: baseline report
stages were 1607.954, 1671.020, 1759.873 ms in fresh processes and 1829.724,
1639.270, 1597.035 ms warm; every work-only sample omitted that stage. Exact
work equality and the source tests establish that its figures and guards were
preserved. A frozen synthetic matrix with independently cold reader processes
is still needed for a causal cold-start claim.

The owner confirmed normal exit of build `2026110705`; its process tree and
listeners were absent. After the reader matrix completed, build `2026110801`
was launched normally at `2026-11-07T15:18:47.3715822Z`, without Node evaluation
environment overrides. Its automatic startup refresh began at
`15:18:54.328Z` and succeeded at `15:20:53.229Z` in 118899.830 ms. No settings
or live profile were edited directly. Loopback debug inspection is read-only.

| Startup pass stage | Wall time, ms |
|---|---:|
| Refresh runner | 100452.633 |
| Quota collection | 11627.392 |
| Index refresh | 49651.132 |
| Index discovery | 40981.535 |
| Discovery graph | 37897.945 |
| Accounting proof origins | 15369.240 |
| Accounting window shadow | 18777.818 |
| Accounting fast path | 3396.080 |
| Snapshot reload | 18445.291 |
| Snapshot build | 18386.673 |
| Snapshot accounting reads, two calls | 13711.310 |
| Snapshot index projection | 11343.513 |
| Report projection | 10728.425 |
| Snapshot clone | 58.244 |
| Snapshot persist hook | 0.024 |

These are inclusive/overlapping spans, not additive costs. There was no
snapshot work projection and no quota fast-path scan stage in this pass.
The persist hook does not prove a disk write. Work-only affects independent
queries, so the shorter total cannot be attributed to this repair.

Accounting reported replay safe, fast path, complete accounting coverage,
generation `25122` matched, fallback zero, dirty/recomputed windows 1,
unavailable/mismatch windows zero and full rebuilds zero. Quota published and
usage succeeded. There were no new timeout diagnostics at watcher completion.
Forty-seven health samples had median 7 ms and maximum 10388 ms: responsiveness
is not closed merely because this short window had no timeout note. Snapshot
report projection itself remained a synchronous 10.728-second operation.

The first polled ready snapshot was at `15:18:57.341Z`, about 9.970 seconds
after launch; this can be retained state and is not fresh-publication latency.
Read-only inspection at `15:27:03.135Z` found health/snapshot ready, overview
live, quota available, matched accounting generation with no fallback, and the
renderer ready without an alert dialog. The next natural automatic refresh
was already running. The independent work view honestly showed saved/updating
with a hidden error element, rather than a false fresh completion. Accounting
windows/timeline were exact; quota/calibration/weekly/plan evidence retained
their own timestamps. Tool history stayed explicitly partial/unavailable.

A second natural automatic pass (`15:25:54.826Z–15:32:15.207Z`) also succeeded,
in 380382.921 ms: discovery graph 148227.922 ms, index refresh 212536.035 ms,
snapshot build 36292.299 ms and report 12521.884 ms. Accounting generation
`25125` matched, fallback/full rebuilds were zero and two dirty windows were
recomputed. Thirty-seven health samples from the last part of this pass had
median 89 ms and maximum 14440 ms. No timeout note had been recorded since
launch, but this small observation does not establish absence under all
preload timings. The large difference from the startup pass reinforces the
need to keep workload/cache/competition separate from source speed claims.

# Remaining work

Measure independent request aggregation/enrichment and same-process projection
stalls, then graph cutoff I/O separately. Any future graph reuse needs a fresh
open, precise before/after identity/state, successful close and bounded narrow
proof; the existing inspection tuple does not supply that proof. Do not cache
its boolean across refreshes or weaken fallback to avoid the cost.

Rollback is a normal quit and launch of the preserved previous candidate after
identity verification. No profile/schema/data rollback is required or performed.
