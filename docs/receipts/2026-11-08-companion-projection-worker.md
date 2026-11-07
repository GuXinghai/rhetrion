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
are not implied. The authorized normal switch and production observation are
pending the owner's normal exit of the running candidate.

Rollback is normal quit and relaunch of the preserved prior candidate after
identity verification. No profile deletion, migration or schema downgrade is
needed. No rollback or manual production refresh was performed.
