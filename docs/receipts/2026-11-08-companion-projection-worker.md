---
title: Companion projection isolation and response-time verification
date: 2026-11-08
type: receipt
status: partial
source_commit: 2bc631d36e2954df60d9b0061aa8f29b477973d6
---

# Change and claim boundary

Source `2bc631d36e2954df60d9b0061aa8f29b477973d6` moves the backend's full
companion-only projection into a read-only worker. The preceding
[work-only repair](2026-11-08-work-only-projection.md) preserved figures but
left synchronous snapshot report SQL/aggregation on the control-plane event
loop. Production observations on build `2026110801` included a 12.522-second
report stage and a 14.440-second health response. The new slice targets that
blocking boundary, not graph, work metadata, accounting or a timeout increase.

The report and its complete generation descriptor now share one SQLite read
snapshot. Returning only report rows to the parent and describing generation
later would mix publications; that shortcut is excluded. The worker closes
its read-only database before sending the closed companion DTO. The parent
waits for exit zero before delivering success. Abort, protocol error, nonzero
exit or failure to exit preserve fixed, content-free outcomes. Terminal
settlement is bounded at 500 ms; this is worker cleanup, not an enlarged
analysis/request timeout. Backend close aborts and joins its active reads;
at most two workers are active per backend. Existing exact-key sharing and
generation/time-membership cache proofs remain in place.

The worker receives only index location, anchor time, validated declared-speed
windows and full/deferred mode. It receives no Codex home, salt, credentials,
source rows or work display metadata. Callbacks stay in the parent. Enclosing
spans use the orchestration clock; worker stages use the worker's own monotonic
clock. Deferred reads do not start a worker. Schema and durable formats are
unchanged. This is response isolation with a measured startup/transfer cost;
it is not a total refresh acceleration claim.

# Validation

- Focused worker and real loopback backend tests: 21 passed.
- Backend/publication tests: 13 passed, including a publication immediately
  after report completion that cannot replace its generation metadata.
- Local companion suite: 300 passed.
- Architecture and preflight passed. Static import-closure tests include both
  new worker files; no manifest was hand-edited.

An integration test first exposed rejection of the production controller's
clock function. The wrapper now validates that function but keeps it local;
the worker clock is independent. A polling test was also changed to join the
actual refresh lifecycle, then assert successful publication and exact store
identity. No product timeout or result assertion was weakened. The successful
local suite was run after these corrections. Complete-root-suite and earlier
unrelated discovery failures are not claimed as passing here.

# Synthetic and live reader matrix

The fixed synthetic corpus had 12 files, 12,000 events, 30 days, seed 71,
generation 12 and anchor `1788224400000`. Three fresh coordinator processes
and a separate warmed coordinator with three measured pairs were compared.
Each off-main call starts a fresh worker; warm refers to the coordinator and
OS cache, not a persistent worker. Reader order alternated, and one warm-up
was excluded. Complete companion equality excluded only `readWallMs`.

Live read-only comparisons used build `2026110801`'s embedded Node `24.22.1`,
generation `25127`, anchor `1794066146420`, default empty speed windows and
the same three-fresh/three-warm matrix. Every pair had exact companion equality,
stable generation and unchanged projection source hashes. These source reads
did not publish results or trigger refresh. The source matrix hash was
`7bb605acfba921816715341a2838e12a328f59051e6c783547536205ac0b580b`.

For each operation a 10 ms parent timer measured heartbeat gaps. Wall time
includes worker creation, import, SQL, serialization and exit, plus a fixed
20 ms post-operation observation. It excludes coordinator process startup.
Cold means a fresh process, not cold OS filesystem cache. Competing machine
activity was not frozen; no high-percentile claim is made from three samples.

| Corpus / phase | Direct wall samples, ms | Worker wall samples, ms | Wall median before / after, ms |
|---|---|---|---|
| Synthetic fresh | 1341.408, 2032.811, 1732.904 | 4615.117, 3242.734, 5688.071 | 1732.904 / 4615.117 |
| Synthetic warm | 3316.764, 3374.891, 1505.824 | 5995.357, 5940.975, 6247.309 | 3316.764 / 5995.357 |
| Live fresh | 2168.712, 6529.970, 2622.159 | 8184.791, 4450.590, 8504.844 | 2622.159 / 8184.791 |
| Live warm | 2125.568, 1752.789, 1655.438 | 8157.250, 2189.044, 2314.374 | 1752.789 / 2314.374 |

| Corpus / phase | Median maximum parent gap, direct / worker, ms | Observed maximum gap, direct / worker, ms |
|---|---|---|
| Synthetic fresh | 1717.471 / 67.472 | 2016.849 / 78.685 |
| Synthetic warm | 3303.542 / 92.918 | 3356.882 / 93.470 |
| Live fresh | 2605.131 / 91.831 | 6514.824 / 96.945 |
| Live warm | 1739.870 / 36.352 | 2109.945 / 41.343 |

The proven improvement is parent event-loop availability during the projection.
Operation wall time increased materially in these samples; new worker imports
and transfer/exit are real costs. The one-shot bounded worker is retained as a
small responsiveness repair rather than adding a persistent pool in this slice.
Parent cloning, work-query aggregation, accounting reads and other synchronous
operations remain separate potential stalls. These reader experiments do not
prove production HTTP latency or sustained absence of preload timeouts.

# Candidate gate

Unsigned Windows x64 candidate `2026110802`, version `0.1.27`, source
`2bc631d3`, was staged with Node `26.2.0` and packaged as a directory, with
signing disabled and publish never. Exact staged/archive set and byte
verification passed for 762 files, including both worker files. ASAR SHA-256:
`f9f87a83f7193b98ae0783ad738103ad2194a67fa7196561a81440c48e988fbc`.
The prior candidate and staging were preserved.

The actual package's disposable synthetic profile completed snapshot
construction through the backend worker and rendered ready. Independent work
returned preparing then available, one synthetic row, with partial metadata
kept explicit. Clean quit succeeded. Quota remained unavailable without real
app-server credentials, so the normal hosted smoke is still an environment
gap. Native general path/credential, installer, signing and publication gates
are not implied.

# Production observation

After the owner normally exited build `2026110801`, no `usage-monitor.exe`
process remained. The verified `2026110802` package was launched normally
at `2026-11-07T21:08:48.1697139Z`; no direct profile edit, forced termination,
setting change or manual refresh was used. The artifact remains unsigned, uninstalled
and unpublished. Its startup automatic refresh ran from
`2026-11-07T21:08:54.718Z` to `21:12:11.070Z` and succeeded.

| Startup phase | Wall time, ms | Calls |
|---|---:|---:|
| Complete refresh | 196353.256 | 1 |
| Index refresh | 104417.769 | 1 |
| Index discovery | 67415.412 | 1 |
| Discovery graph | 53483.957 | 1 |
| Accounting origin proof | 18461.099 | 1 |
| Accounting window shadow | 32608.926 | 1 |
| Accounting fast path | 2570.082 | 1 |
| Snapshot reload | 25350.238 | 1 |
| Snapshot build | 25164.765 | 1 |
| Snapshot index projection | 10355.720 | 1 |
| Companion report inside worker | 8967.697 | 1 |
| Snapshot accounting reads | 1550.871 | 2 |
| Snapshot collector projection | 2767.566 | 1 |
| Snapshot clone | 185.020 | 1 |
| Snapshot persist timing | 0.076 | 1 |

Spans are inclusive and may overlap; the table is not an additive breakdown.
The initial ready snapshot was observed before this refresh completed and is
not evidence that the new generation was already published. After completion,
the overview was live/available with accounting generation `25144`, matched
generation, zero fallback and no stale serve. Accounting remained `fast_path`,
one dirty/recomputed window, no unavailable/mismatch windows and no full
rebuild. Quota publication succeeded. Tools retained the explicit
`typed_tool_history_partial` unavailable state.

Across 84 startup health samples, median response was 6 ms and maximum was
7926 ms. Slow samples still occurred outside and after report work; the source
worker and reader matrix isolate report execution, but these HTTP samples do
not attribute every stall to a particular stage. They do not establish a
controlled latency improvement over the prior candidate. No new
`work_usage_timeout` was recorded in the startup observation. At `21:12:31Z`
the rendered overview was ready without an error dialog while independent
work remained honestly loading. At `21:14:13.795Z` work was ready, not busy,
and its issue element was hidden. No work query or refresh was manually
triggered by the observation.

Live inspection used only loopback GETs and read-only renderer expressions;
receipts retain aggregate timings and allowlisted status fields. The complete
startup result and rendered checks are retained in the ignored candidate
evidence directory. This closes the exact-artifact loading and startup
publication gate. Sustained timeout absence, graph acceleration and overall
refresh acceleration remain unproven.

The next automatic refresh ran from `2026-11-07T21:17:13.603Z` to
`21:21:51.762Z` and also succeeded. This is a second observation on changing
live inputs, not a same-generation A/B comparison or a three-run benchmark.

| Next automatic phase | Wall time, ms |
|---|---:|
| Complete refresh | 278160.027 |
| Index refresh | 132679.540 |
| Index discovery / graph | 88722.126 / 72533.674 |
| Index descriptor | 12330.372 |
| Accounting origin proof | 37737.522 |
| Accounting window shadow | 38076.836 |
| Accounting fast path / quota inside it | 20480.073 / 15268.103 |
| Snapshot reload / build | 28315.958 / 28120.683 |
| Snapshot index projection / worker report | 13095.166 / 11461.144 |
| Snapshot accounting reads, two calls | 1820.208 |
| Snapshot collector projection | 2417.506 |
| Snapshot clone / persist timing | 194.135 / 0.309 |

Generation `25160` matched, fallback and full rebuilds remained zero, and
three dirty windows were recomputed without unavailable/mismatch windows.
Quota publication succeeded. A warm process does not prove an origin-proof
cache hit; the 37737.522 ms proof is not equivalent to the earlier millisecond
hit sample. These observations do not isolate the cache miss reason.

The second health series includes the wait for the next pass:
`21:13:44.925Z` through `21:21:54.866Z`, 217 samples, median 6 ms, maximum
13169 ms. That slow response ended at `21:19:44.065Z`, before the later
snapshot report; another response reached 8615 ms at refresh completion.
Report isolation therefore does not close the remaining control-plane stall
gate. The expensive index descriptor and later snapshot composition need
their own causal measurements. No new `work_usage_timeout` was present in
the bounded diagnostics read through `21:21:54.880Z`, about 13 minutes after
launch; this is a finite observation, not a sustained absence claim.

At `21:22:19.911Z`, overview and snapshot were ready, generation `25160` was
current and the error dialog was absent. Work showed `savedUpdating` with
its issue element hidden: previously available figures were retained while
the next independent build was busy. At `21:24:09.280Z` that work view was
ready, not busy, with its issue element hidden. The companion listener was
independently observed on `127.0.0.1`.
Timing diagnostics also include unsuccessful candidate/origin probes; the
terminal success and zero accounting fallback do not assert every probe
succeeded. No diagnostic or result was rewritten to suppress those states.

Rollback is normal quit and relaunch of the preserved prior candidate after
identity verification. No profile deletion, migration or schema downgrade is
needed. No rollback or manual production refresh was performed.
