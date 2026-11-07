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

No discovery production change is retained. Continue with separate, bounded
investigation rather than broadening this accepted repair:

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

# Read-only live diagnostic

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
