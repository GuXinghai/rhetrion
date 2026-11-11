---
title: Local refresh performance repair and verification
date: 2026-11-07
type: plan
status: in-progress
---

# Scope and acceptance boundary

Starting revision: `9b0b5fa1`. The owner authorized sequential repair and
verification, including eventual production/live validation. No source result
proves the running candidate has loaded a repair. On 2026-11-07 the owner
explicitly authorized building a new unsigned candidate, normally exiting and
switching the current candidate, and observing its automatic refresh. Schema,
durable cache formats, account attribution and release state are outside these
repairs. No manual live refresh is authorized by this switch.

# Sequence

1. Reduce work-origin plain rollout header reads to an initial 4 KiB, retaining
   the existing 64 KiB line bound, native leases and post-read validation.
   Verify byte counts, long/invalid/truncated/UTF-8 headers, refusal and cancel.
2. Reuse verified work-origin relations only after a fresh native authenticated
   open and identity-bound nanosecond state checks. Bound the process-local
   cache; preserve cold reads, mutation/refusal fallback and cancellation.
3. Remove discarded work construction from dashboard snapshot publication.
   Keep the independent work query, preparing/retained state, lease and
   cancellation. Verify a blocked work build cannot block full or overview
   publication through a real isolated loopback server.
4. Run affected isolated suites, architecture and preflight. Record measured
   synthetic results without treating them as live speed evidence.
5. Identify the exact live candidate and approved way to load the repair, then
   compare natural or explicitly authorized live refreshes. Keep phase times,
   freshness, fallback, generation and resource evidence distinct.

# Measurement

Use one fixed corpus and generation per comparison, fixed clocks, at least
three measured repetitions, and separate fresh-process from warm-process runs.
Report individual samples, median and range. Preserve only aggregate counts,
phase timings and semantic equality; no source records or private paths enter
receipts. Record origin read bytes/calls and discovery cutoff bytes separately
from wall time. Live phase comparisons require matched workload evidence;
unmatched refreshes remain observations, not an A/B performance claim.

The owner's acceptance target is elapsed time until both the current overview
and the requested work view are ready. Snapshot publication alone does not
close that target. In the second `2026110802` observation, snapshot publication
took 278.160 seconds, while work was first confirmed ready 415.677 seconds
after refresh started; that later check is an upper bound, not its exact
completion time. Report-worker isolation increased reader wall time in the
controlled matrix and did not prove total refresh acceleration. Do not promote
another response-isolation slice as a throughput fix. Prioritize removing
actual repeated reads/scans, and show same-input cold/warm samples, semantic
equality and a median improvement beyond observed variation before claiming
acceleration. Keep source evidence distinct from loading and natural live runs.

# Progress

- The baseline checkout was clean at the starting revision. The accepted source
  repairs are committed as `6263d0a79601e56e0e5427589fbd4a0247d0599e`.
- The plain header reader and process-local relation cache are implemented.
- Dashboard publication now requests only companion figures. Work query
  lifecycle and complete-result freshness checks remain independent.
- A discovery cutoff-batching experiment was removed: the live index had 99
  history bases and 99 distinct parents, with no repeated parent cutoffs.
- Scoped tests cover exact line limits, UTF-8 boundaries, native refusal,
  unknown identity, coarse timestamp collisions, mutation and failed close.
- Three unrelated failures were reproduced with both changed modules loaded
  from HEAD: impact reason validation in the deep-fork test, the legacy-family
  fixture, and the compressed symlink refusal code. Assertions were preserved.
- Before the authorized switch, the running stable package was build
  `2026110704`, manifest revision
  `96045152d39b5a1c19d4f71d2964f537daf1bb92`, ASAR SHA-256
  `18d2e1bf36d7cfe8f32e20d703660bd4c2c396489ec2a956d1deab44c5f43325`.
  Its original thread-store and log-source modules matched the starting
  revision byte-for-byte.
  Its embedded Node runtime is `24.22.1`.
- Initial full-live comparisons were refused when one source grew or the
  generation changed. These are not accepted performance evidence. Index
  metadata can lag an open writer's actual file size even when mtime is old.
- Accepted cold/warm live origin and snapshot comparisons and validation
  results are in the [slice receipt](../receipts/2026-11-07-local-refresh-performance-slices.md).
  The source repair, unsigned package and startup automatic live-refresh gates
  are now recorded separately in the
  [candidate receipt](../receipts/2026-11-07-local-refresh-live-candidate.md).
- Build `2026110705`, source `6263d0a7`, is running after the owner normally
  exited the previous candidate. Its startup automatic refresh succeeded in
  192542.340 ms: snapshot build 31212.098 ms, index projection 11717.135 ms,
  report 11011.125 ms and no `projection_work` stage. Accounting stayed
  `fast_path`, with generation matched, fallback zero and full rebuilds zero.
  This one app-driven observation closes the loading/publication gate; it is
  not a controlled whole-refresh comparison or sustained timeout proof.

# Remaining measured slices

No discovery production change is retained. Follow-up on build `2026110705`
found continuing background preload timeouts (`request`, HTTP status null,
10000 ms limit), and a 12145 ms health response during one natural refresh.
The graph stage reached 95259.510 ms in that pass, but this does not establish
graph as the timeout cause: cutoff reads yield asynchronously.

The next bounded repair removes the reverse discarded projection: independent
work queries formerly built the complete companion report before selecting
only work. A work-only backend read now captures `commit_seq` before all
metadata/usage reads and checks it after completion. It retains explicit
unavailable/capacity, cancellation, native origin guards and the existing
query/lease/anchor lifecycle; it adds no completed work cache. Acceptance:
exact work equality across periods, no report stage, refusal on publication
change, route publication independent of a pending work build, and source then
read-only live verification. The running candidate does not load source edits.

This slice is committed as `8f2307ed` and loaded in unsigned build
`2026110801`. Its startup automatic refresh and next natural pass succeeded,
with matched accounting generations and no fallback/full rebuild. Live reader
comparison preserved exact work output but did not establish a total speedup;
origin-open variation and paired cold-cache ordering dominate that claim.
The [work-only receipt](../receipts/2026-11-08-work-only-projection.md) records
the samples and limitations. Health still reached 14.440 seconds and snapshot
report 12.522 seconds, so the next independent slice moves companion-only
projection to a cancellable read-only worker, with report and generation
descriptor computed inside one SQLite snapshot. Work/discovery/accounting
semantics and production timeout values stay unchanged.

The worker slice is committed as `2bc631d3`; unsigned candidate `2026110802`
passed exact 762-file package verification and isolated packaged rendering.
Three-run synthetic and live reader matrices preserved complete companion
figures and reduced parent heartbeat stalls, with explicit worker startup and
transfer overhead. Local suite 300, backend 13 and worker/loopback 21 tests
passed. The [worker receipt](../receipts/2026-11-08-companion-projection-worker.md)
records the measured response/wall-time tradeoff. After the owner's normal
exit, build `2026110802` loaded the repair and its startup automatic refresh
succeeded in 196353.256 ms, with matched generation `25144`, zero fallback
and no full rebuild. Snapshot build was 25164.765 ms; worker report was
8967.697 ms. Startup health had 84 samples, median 6 ms and maximum 7926 ms.
The independent work view became ready after refresh. No new startup timeout
was recorded, but remaining stalls and sustained timeout absence are separate
gates. No forced termination, profile edit or manual live refresh was used.
The next natural pass also succeeded in 278160.027 ms with matched generation
`25160`, zero fallback/full rebuild and three recomputed windows. Its health
observation still reached 13169 ms, before the later worker report, so the
control-plane stall problem is not closed. No new timeout diagnostic was
recorded through the roughly 13-minute observation. Work had become ready,
then honestly showed retained figures updating after the next publication.
The second work build subsequently became ready as well.
These changing-generation observations are not controlled speed comparisons.

Continue the other costs as separate slices:

1. Measure graph cutoff reads across unchanged automatic passes. The startup
   graph cost was 23766.850 ms; the removed within-pass batching experiment
   cannot reduce a workload with distinct parent cutoffs. Any future reuse must
   bind all dependency state and preserve native guards, refusal and fallback.
2. Explain the two snapshot accounting-cache reads (14463.952 ms in aggregate)
   before changing them. The second read binds the cache to the immutable
   generation returned by projection; removing that fence is not an optimization.
3. Separate window shadow (45747.300 ms) and quota fast-path work
   (20177.610 ms) from origin proof. They are independent residual costs; the
   existing proof cache has not been regressed merely because its first read in
   a new process is cold.
4. Measure control-route latency and independent work-query request/lease
   phases during natural refreshes. A ready post-refresh view does not prove
   that the recurring `work_usage_timeout` has been eliminated. Do not alter
   timeout limits or hide stale/unknown output to close this gate.
   The second `2026110802` pass exposed a 12330.372 ms index descriptor and
   a 13169 ms health response before its snapshot report. Measure this
   synchronous descriptor and later snapshot composition independently;
   report isolation alone cannot account for either remaining stall.
5. Separately reproduce related-period generation comparison when a work
   result lacks a primitive fingerprint. The service's current fallback
   compares generation objects by reference; equivalent fresh descriptors
   must not be accepted or rejected solely on object allocation. A repair
   needs a validated identity token and mismatch tests, without serializing
   arbitrary descriptor fields or relaxing the publication fence. This has
   not been established as the cause of production preload timeouts.

Additional graph timing can separate actual duplicate hashing, each
uncached history-cutoff verification, pure cycle/quarantine propagation and
final selection/fingerprinting. The reviewed source boundaries are
`digestSource`, `historyCutoffValid` and their enclosing graph pass in
`src/providers/codex/log-sources.js`. Keep the existing closed three-field
timing frame and extend only its fixed stage vocabulary, with tests proving
identical source selection, quarantine and receipt fingerprints when timing
is enabled. Emit one whole-operation span per actual hash/cutoff; aggregated
chunk spans do not make `stages[].calls` a filesystem-read count. Count bytes
and physical read calls through synthetic adapters first. Adding live byte
counters needs a separately closed diagnostic contract, not extra arbitrary
fields, overloaded milliseconds or accounting-origin diagnostic codes. This
is a proposed measurement slice, not an implemented discovery optimization.

## Active throughput slice: history-cutoff proof reuse

A read-only inventory at `2026-11-07T21:47:58.053Z`, generation `25172`, found
99 distinct history-base cutoffs with 99 distinct parents: 91 compressed and
8 plain. Their indexed logical prefix lengths total 3258270751 bytes, with a
largest prefix of 297103436 bytes. These are retained-reference sizes, not
measured I/O or proof that every reference is validated in every pass.
Plain-only optimization would miss most parent representations.

The active bounded slice retains successful cutoff proofs in the existing
scanner instance. Every prospective reuse still opens the parent and performs
the original source guards, plus exact held-handle/named-path bigint identity
and nanosecond state checks before and after the operation and successful
close. A changed, unidentifiable, unsafe or unsupported state must not serve a
cached success. The key binds compression, physical/logical size, parent start
ordinal and both cutoff coordinates. A compressed proof can be seeded only
after the existing decoder is fully consumed and validates its end state;
reuse does not shorten that initial validation. Failed and unknown proofs
are never cached. Bound the in-process retained set and keep native adapters
without exact state on the existing read path. No schema or durable format
change is authorized by this slice.

Acceptance requires identical selected sources/quarantine/receipt fingerprints,
fresh guards on a hit, zero repeated cutoff bytes for unchanged inputs, and
refusal/fallback for append, same-size mutation, replacement, unsafe links,
coarse timestamps, cancellation, decoder failure, failed close and eviction.
First establish this on synthetic plain/compressed histories, then compare
read-only stable live inputs before preparing another candidate. No
whole-refresh acceleration or production loading is yet claimed for this slice.

The implemented slice passed focused and ingestion tests. A same-generation
live read-only matrix now proves reduced repeated work: warm reader median
18876.116 to 4271.887 ms, graph median 15137.512 to 572.854 ms, with zero warm
candidate physical reads/decodes and exact source/receipt equality. Baseline
performed 7008 reads (1822070465 bytes) and 91 cutoff decodes per operation.
Cold validation still reads the entire prefix; no cold speedup is claimed.
The [cutoff receipt](../receipts/2026-11-08-history-cutoff-proof-reuse.md)
records all samples and the admitted-inventory/runtime limits. Candidate
loading and complete overview-plus-work readiness remain unverified.
Source is committed as `868ec69a`. Unsigned candidate `2026110803` passed
exact 762-file package verification and isolated native rendering with plain
and compressed history-base fixtures, five sources and no quarantines.
The complete local suite passed all 300 tests. After the owner's normal quit,
`2026110803` loaded the repair. Startup snapshot publication succeeded in
192064.365 ms, generation `25199` matched and fallback/full rebuilds stayed
zero. Passive fresh work availability was first observed after 311420 ms and
the rendered work view was subsequently ready. Health still reached 14849 ms;
the complete waiting target is not closed. No forced exit, direct profile edit
or manual production refresh was used. The next natural pass succeeded in
563906.025 ms to snapshot publication, but first fresh work was observed only
after 734482 ms. One background work timeout occurred. The complete waiting
target failed despite functional success. Graph was 9646.700 ms while
walk/stat reached 56416.109/46353.563 ms, descriptor 62779.967 ms, proof
102101.336 ms and window shadow 106927.865 ms. These changing-input natural
passes do not establish a causal total speedup or regression. Keep the direct
reader byte-reduction evidence separate from this failed end-to-end gate.

## Next throughput slice: descriptor without discarded report

`createLocalIndexBackend.describeCurrentGeneration` still calls the full
companion projection and discards all but its descriptor. Replace that with
the existing metadata reader and original descriptor builder, inside one read
snapshot. Preserve rollup-basis admission, committed cursor/future cutoff,
coverage/tool/issue semantics, calculation revision, null refusal and abort.
The process-local descriptor cache must also compare calculation revision,
which can change without advancing commit sequence. Require exact descriptor
equality against full reports across partial/provisional/future/empty inputs,
a concurrent-publication fence and same-commit revision changes. This slice
must show reduced discarded SQL/projection work before another candidate;
it does not by itself fix work-query or origin-proof costs.

The metadata-only descriptor slice is implemented. Exact synthetic and live
read-only comparisons, cold/warm samples and validation boundaries are in the
[descriptor receipt](../receipts/2026-11-08-generation-descriptor-read.md).
The complete local suite passed 300 tests. Two extra accounting/API-reference
assertions also fail on the unchanged `870e8634` baseline and remain explicit;
they are not weakened. Candidate packaging and live loading remain separate
from the reader's measured improvement.

Candidate `2026110804` was packaged and rendered in isolation but held before
live loading: passive background period requests repeatedly failed with
`work_usage_snapshot_changed`. A real work-backend regression reproduced
reference comparison of freshly allocated equal generation objects. The next
slice compares validated publication values, preserves changed/unknown refusal
and must show all four packaged background periods settling without a restart
loop. See the [related-period receipt](../receipts/2026-11-08-work-period-generation-equality.md).

Successor `2026110805` is also held before live loading. Its service generation
comparison passes, but an empty 24h response lacks required observation metadata
and stops browser preloading. A real-backend/browser-validator regression
reproduced that independent failure. The empty branch now reuses the same
pass's common metadata and preserves partial coverage; no validator is relaxed.
The successor must complete the full four-period packaged gate before loading.

Candidate `2026110806`, source `95cec576`, passed exact 762-file packaging,
passive four-period warming at one generation/end, actual Usage & costs
rendering and normal isolated quit. Its receipt retains the two held candidates
and all claim limits. Live loading and the complete natural-refresh waiting
measurement remain pending; the running `2026110803` does not contain these
repairs. No whole-refresh improvement is inferred from reader or fixture gates.

After the owner's normal quit, `2026110806` loaded. Startup and the next
automatic pass succeeded with matched accounting generations and no fallback
or full rebuild. Those functional facts remain separate from performance.
The owner identified host resource contention, excluded that session from
performance use, then requested deleting its measurement records and starting
fresh. Old live timing tables, work-gap figures and timing-based conclusions
have been cleared from this plan, the receipt and ignored observer output.
Package, isolated tests, rendered proof and launch identity remain; application
profile/diagnostics and Git history are untouched.

New recording starts after a fresh UTC cutoff and follows natural automatic
refreshes in the existing process, without manual refresh or restart. Record
at least three completed warm-process observations and individual stages,
publication-to-fresh-work time, generation/fallback and host CPU/memory when
available. Report median and range, with missing samples explicit. Different
natural generations/corpora are not controlled A/B inputs; cold-start and
fixed-input proof remain separate. No old-session value enters the new series.

The fresh series completed three natural automatic runs at generations 25249,
25250 and 25251, ending `2026-11-08T08:58:44.278Z`. Snapshot median was
172144.857 ms (170911.191–184456.643); first observed matching fresh work median
was 261827 ms (259783–283401). All succeeded with fast path, matched generations
and zero fallback/full rebuild. No old samples were included. The
[receipt](../receipts/2026-11-08-work-period-generation-equality.md#fresh-natural-refresh-recording-completed)
contains individual runs, nested phase times, host load and observation limits.
The recorder stopped after three runs. This is a warm-process natural-input
series, not a controlled before/after or cold-start claim. Total host CPU
remained around 52% median and does not attribute competing load.

A guardian parent-header cache experiment was not retained. Synthetic evidence
proved one fewer warm header read under the existing fresh-open/exact-state
guards, but did not establish a
material total gain. The experimental diff and aggregate test evidence remain
ignored locally; running and committed source do not contain it. Native open,
realpath and database proof would still run. Async wall spans may include
contention, so treating the whole span as physical file I/O is unjustified.

The publication-to-work boundary remains an investigation candidate because
source still repeats complete all-period work reads. The discarded contended
session does not establish its priority or intrinsic cost. The current production
work composition does not pass its existing
`onTiming` observer, so the refresh receipt cannot attribute that gap to
`work_origins`, Git, SQL, aggregation or response validation. Use the existing
read-only diagnostic/adapters on a fixed synthetic or protected-copy corpus,
three fresh and three warm samples, to separate these costs before selecting
another implementation. Related periods still perform new complete all-period
reads; safely avoiding them must preserve immutable anchor, changed-publication
refusal, external-metadata freshness and bounded leases. Do not turn off the
work-cache freshness exclusion or merely cache by index generation.

`scripts/benchmark-codex-history-cutoff.mjs` compares baseline `a911573f` with
the current reader. Use `--synthetic --phase cold --run 1|2|3` in three fresh
processes, then `--synthetic --phase warm --run 1` in a separate process; warm
emits an excluded warm-up and three measured pairs. Default input is 12
parents, 11 compressed, about 108 MiB logical prefixes. Both readers receive
the same validated inspection inventory, so this measures cutoff/graph
validation rather than cold compressed inspection. The source and receipt
objects must match exactly, and samples include actual physical reads,
compressed cutoff decoder calls, yielded logical bytes and fresh opens/closes.
Process uptime is recorded separately; fresh process does not mean cold OS
cache. Live mode replaces `--synthetic` with `--allow-live-read` and requires
the in-memory-only comparison key, fixed anchor and expected generation named
below. It excludes recently written or catalog-mismatched sources, freezes
only an in-memory source inventory and rechecks exact file/directory identity
and index publication around each pair. A changed input refuses the sample.
This qualifies the admitted reader inventory, not whole-refresh or private
work enrichment. It never writes source or profile state.

# Read-only live diagnostic

## Protected-copy marginal refresh experiment (2026-11-08)

The owner requested a cached-baseline comparison rather than a session-count
scale curve. Reparse one protected copy of the existing, closed real sources,
then build the normal index, accounting/window caches and dashboard snapshot.
Exclude this initial preparation from the incremental results. From an identical
cached baseline, measure three unchanged refreshes, three additions of one
held-out real short session, and three appends of an actual withheld complete-line
tail to an existing real session. Preserve original identities and bytes; do not
fabricate sessions or edit live sources, settings, caches or the running app.

Restore only the experiment's baseline state between measured runs, retaining
the index file identity required by its proof receipt. Check the same starting
generation, event/source/session counts and fixed calculation anchor each time.
Record fresh-process startup separately from cached refresh, discovery, index,
origin proof, window shadow, snapshot projection/publication and first work
projection. Three cached fresh-process samples do not establish warm-process
or cold operating-system-cache latency. Keep the external metadata snapshot and
pricing options fixed; quota network observation is excluded, explicitly
unavailable rather than a measured zero. Git enrichment remains a local external
read and is not claimed frozen. Report medians and ranges, inserted/changed
source counts, bytes read by ingestion, fallback/rebuild and generation checks.
Only aggregate content-free measurements may leave the protected copy. No
product source, schema, durable cache format or release change is part of this
experiment.

The [completed protected-copy comparison](../receipts/2026-11-08-cached-refresh-marginal-comparison.md)
retains nine primary passes and three additional unchanged controls, all with
successful replay checks. One short session touched only its 174,844-byte file;
a 517,356-byte modern-response tail required the existing atomic full-source
reconciliation of that one 2,478,398-byte file. Accounting stayed fast path with
zero full rebuilds, and changed cases rebuilt one window day. Host CPU/memory
conditions and work-origin timings varied too much to establish a causal
per-session latency. Keep the original and confirmation groups separate; no
product or live candidate was changed by this experiment.

## Computation reductions without another cache layer (2026-11-08)

Source inspection at `71f1a2cb` and two read-only protected-copy probes identify
the following bounded candidates. These are investigation results, not product
changes or demonstrated whole-refresh savings. Reuse existing functions and
request-local values; do not introduce a service, persistent format, worker,
cross-generation cache or invalidation policy to pursue them.

1. **Remove work-origin path-query amplification first.**
   `src/local-index-work-usage.js` runs a `SELECT DISTINCT src.path` join once
   per requested/discovered session. `EXPLAIN QUERY PLAN` on the frozen copy
   reports `SCAN src`, a primary-key session lookup and a temporary DISTINCT
   tree for every invocation. A read-only three-run probe looked up the same
   4,064 initial usage sessions against generation 4368. Per-session queries
   took 8,423.231, 13,839.622 and 10,384.404 ms; one source/session scan with
   request-local grouping took 69.771, 53.149 and 55.494 ms. All three ordered
   path-list comparisons were exact across the admitted corpus (4,368 rows).
   The 10,328.910 ms difference of medians qualifies this SQL slice only.
   The probe's all-history grouping is not a production implementation: a
   production slice must batch only requested sessions, retain lazy admission
   of verified parents, preserve case-insensitive UUID lookup, DISTINCT, the
   33-path refusal sentinel, memory/cancellation bounds and publication fences.
   In particular, unrelated old sources must not make a small window fail.
   Keep fresh native origin opens and every guard. Start with
   `test/local-index-work-usage.test.js`, origin/provider negative cases and
   generation/cancellation regressions; then repeat exact work output and
   phase timings on the protected corpus. No new SQLite index/schema is needed.

   Implementation authorized after the probe: keep this slice in
   `src/local-index-work-usage.js`, batch at most 256 initial requested UUIDs,
   discard consumed path lists, and retain the existing per-parent lookup
   outside that initial set. At most 33 distinct paths per UUID are retained;
   the existing ancestry reader still refuses the sentinel before opening
   any of those files. Validate case-insensitive matching, filtered sources,
   duplicate paths, 32/33 boundary, lazy out-of-window parents, unrelated old
   overflow, cancellation and publication changes. Then compare full work
   results against `71f1a2cb` on the existing protected copy with unchanged
   generation/anchor, fresh-process and warm-process samples separately. No
   running-candidate switch or live-profile change is part of this slice.

   The [implemented batching receipt](../receipts/2026-11-08-work-source-path-batching.md)
   records 6/6 exact full-work comparisons plus an excluded warmup. Queries
   fell from 4,066 to 18 on generation 4368; source-path SQL medians fell from
   15,530.825 to 136.493 ms in fresh processes and from 16,907.188 to 52.468 ms
   when warm. Severe host-memory pressure and native-read variability prevent
   a stable whole-work or live-refresh speedup claim. No schema/cache-format
   change, new cache layer or running-candidate switch was made.

2. **Reuse verified day accumulators within one window-refresh call.**
   `verifyAccountingWindowDays` constructs `dayMap` and throws its result
   away; the changed-day/anchor fold later imports, finalizes and verifies
   the cache's days again. Preserve every keyed receipt/day verification,
   but arrange the existing window-cache owner to retain its verified local
   accumulators through that same update. Drop removed days and replace dirty
   days with newly built verified accumulators before folding. Do not memoize
   by mutable object identity across calls or accept a caller's bare
   `verified: true` as proof. A 256-day read-only probe measured full day
   verification at 279.191–1,670.729 ms and import/finalize alone at
   123.774–1,094.877 ms. These are overlapping operations, not additive savings.
   Its rolling fold still performed four distinct edge-range scans and took
   1,090.500–3,296.003 ms. This does not attribute the entire 8.5–11.4-second
   changed-day shadow cost to redundant validation. Validate tampered days,
   receipt/key/basis/revision changes, removed days, manual repair, cancellation,
   and exact periods/history with existing window-cache/fold/parity tests.

3. **Avoid the second full snapshot accounting-cache decode on an exact hit.**
   `buildLocalCompanionSnapshot` first loads the complete accounting cache in
   parallel with the report, then reads it again after obtaining the report's
   generation. That second call also prepares state, reads/parses and validates
   the complete cache. A narrow optimization can bind the already validated,
   private first value to the exact report generation using the existing
   generation/context/clock rules, with the original fresh read when it does
   not match. Keep stale-channel behavior and changed-publication handling.
   Share the existing pure classification logic rather than implementing a
   second matcher. Evidence proves the duplicated reads; net latency savings
   remain unmeasured and the first read overlaps the report. This is a smaller
   priority than the proven path-query amplification. No cache format changes.

4. **Consolidate repeated boundary-scan setup only if later profiles justify it.**
   `buildAccountingRollingPeriods` already memoizes identical fragments. The
   four scans observed above are distinct ranges, so claiming four duplicate
   scans would be wrong. Each currently opens a fresh accounting read and
   computes global report metadata/tool counts. The same-corpus metadata
   probes were 34.431–219.500 ms per call. A function-local, pinned-snapshot
   scan session could share setup, but connection/snapshot lifetime and WAL
   pressure add complexity. Defer this until the simpler slices are measured.

The all-period work reconstruction for each related-period request is also
confirmed in `apps/local/server.js`, `src/application/work-usage.js` and the
browser preloader. It has a higher possible ceiling but crosses existing
snapshot/lease/freshness boundaries. Do not add a second completed-work cache
or cache by generation alone. Narrowing the requested interval alone can
change family aliases/collision sets and still leaves all-directory Git
resolution. Defer that change rather than disguising a new snapshot lifecycle
as a small optimization.

Retain full-source `response_reconciliation` for modern appended sessions,
per-event window building at declared-speed edges (`grouped: false`), native
ACL/link/path checks and all origin fallback paths. Do not hoist path guards
or merge accounting-origin and work-origin reads with different evidence
options merely because their timings share a prefix. Recovery-index ordering
from the interrupted cold build is a separate recovery issue, not proof of a
normal cached-refresh bottleneck. Work aggregation/finalize were subsecond in
the confirmation controls and are lower priority than origins and repeated SQL.

The ignored probe code and aggregate outputs are
`.release-build/session-growth-20261108/computation-probe.mjs` / `.json` and
`window-computation-probe.mjs` / `.json`. The probes used Node.js 26.2.0 on
Windows x64 and read only the existing operational copy. They made no product,
schema, durable-cache-format, live-profile or running-candidate changes. Their
three repetitions used a warmed OS cache and do not establish a fresh-process,
live or balanced whole-refresh performance result.

`scripts/benchmark-work-origin-reads.mjs` requires `--allow-live-read`,
`--phase cold|warm` and `--run 1|2|3`. It reads the default stable index and
Codex home only; it never triggers a refresh or writes profile/source state.
It compares the pinned starting revision `9b0b5fa1` with the current source
through the same native reader.

Use the verified running candidate executable with `ELECTRON_RUN_AS_NODE=1`
in a separate hidden process, not the app entrypoint. Keep one random 32-byte
hex `RHETRION_PERF_COMPARISON_KEY` only in the parent/child environment across
the comparison matrix; never print or persist it. It keys the content-free
corpus fingerprint. Run three fresh processes in `cold` mode and one process
in `warm` mode, which discards one warm-up and measures three pairs. Alternate
reader order. Cold means fresh process/cache, not cold OS file cache.

Closed-source selection excludes recently written sessions and files whose
physical size differs from the indexed inspection. Report the exclusion count.
Every accepted pair must have equal relations, stable input state, unchanged
generation and unchanged candidate bytes. Compare only receipts with the same
generation, keyed corpus fingerprint and candidate hash. Source mutation or
index publication refuses the comparison rather than suppressing the change.
This diagnostic qualifies only the origin-reader slice. The separate candidate
receipt records whole-refresh observation, snapshot publication and loading the
repair; none is inferred from the reader diagnostic.

The optional `--target snapshot` compares the former combined read with the
companion-only read directly on the live index, without publishing either.
Set one fixed integer-millisecond `RHETRION_PERF_ANCHOR_MS` for all processes.
It uses the same empty declared-baseline option on both sides, so it qualifies
the projection/composition boundary, not the live selected-price policy. Exact
companion equality excludes only the explicitly measured `readWallMs` field.
The live index generation, anchor and candidate module hash must match across
accepted samples. This target does not need the private corpus comparison key.

The optional `--target work` compares the former combined read with the
work-only backend on live inputs. It additionally requires the fixed expected
`RHETRION_PERF_GENERATION`; a changed publication refuses the matrix. The anchor
is required, source hashes cover the projection owners, and exact work equality
excludes only metadata's observation-clock field. External thread/repository
inputs remain live, so equal outputs at one fixed publication do not establish
a frozen external corpus. Record this narrower scope explicitly rather than
claiming a controlled full-refresh benchmark. Never publish either result.

The optional `--target descriptor` compares a full companion report's generation
with the metadata-only descriptor facade. It requires the same fixed anchor
and expected generation as the work target, additionally checks unchanged
calculation revision, and compares the complete descriptor exactly. Three
fresh processes and a separate warmed process use the existing bounded phase/run
arguments. Its source matrix covers descriptor/backend/report/rollup/store
owners. It reads only the local index, emits no report rows and publishes no
result; timings qualify this discarded-report boundary, not work or the complete
refresh. No native source-reader or account metadata cache hit is implied.
