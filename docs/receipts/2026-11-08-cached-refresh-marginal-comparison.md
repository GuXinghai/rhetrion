---
title: Cached refresh marginal comparison on a protected real-data copy
date: 2026-11-08
type: receipt
status: completed-with-latency-limit
---

# Boundary

The owner requested a direct cached-baseline experiment: unchanged sources,
addition of one real short session, and an actual complete-line tail appended
to an existing real session. This supersedes the proposed session-count scale
curve for this experiment. Product source remains `71f1a2cb`; only experiment
tooling and documentation changed. The Windows x64 operational experiment uses
Node.js `26.2.0`, not the running candidate's embedded Node.js runtime. It is
not a live refresh, candidate qualification, or production latency claim.

Source data stays in a separate owner-only operational copy outside the
repository. No real source bytes, names, paths, raw identities, credentials,
or private work rows enter fixtures, logs or this receipt. No live refresh,
restart, profile/settings edit or remote operation is part of the experiment.

# Frozen input and cases

An online SQLite backup captured selection generation `25265`. Every copied
source was closed/older than five minutes and matched its recorded physical
size and timestamps. Native authenticated source leases, exact state checks,
no-clobber private destinations and full copied-byte readback were used.
Nine sessions were excluded for missing or unfreezable sources. The retained
copy contains 4,369 sources and approximately 15.172 GB of physical source
bytes. One held-out real session leaves a planned baseline of 4,263 sessions
and 4,368 source files. These were selection counts before completed ingestion.

| Case | Change from the same cached baseline |
| --- | --- |
| Unchanged | No source change |
| Add short session | Reveal one held-out real 174,844-byte source, preserving its identity and complete bytes |
| Append existing session | Append 517,356 actual withheld bytes after a complete usage-record line; preserve the existing source and session identities |

The existing metadata snapshot is reused across cases. The short-session case
also restores that thread's original metadata row after withholding it from the
other cases; it therefore includes the presence of the associated metadata
write. Metadata rollout paths belonging to the copied source root are remapped
only in the private metadata copy. Out-of-root metadata keeps the ordinary
guarded unavailable behavior. Pricing options are fixed and no declared-speed
history is fabricated. Quota network observation is excluded, and missing quota
evidence remains explicit. Git enrichment still reads existing local projects;
those external project directories are not claimed frozen.

# Procedure and acceptance

1. Reparse the copy from an empty index through the product's normal reader,
   backend and refresh runner; generate accounting/window caches and the
   dashboard snapshot. Preparation is not an incremental sample.
2. Take coherent baseline index and collector-cache checkpoints. Between trials,
   restore only these experimental files, preserve the original experiment-index
   file identity, verify byte readback, and refuse nonempty live sidecars.
3. Run three separate cached fresh processes per case, all from the exact same
   starting generation, counts and calculation anchor. Keep unchanged, added-file
   and appended-file groups separate; blocked order is a timing limitation.
4. Record process startup, ingestion/discovery, accounting proof/window shadow,
   snapshot projection/publication and first all-period work projection
   separately. Inclusive spans are not added. These processes have existing
   durable caches; they do not measure cold operating-system caches or a fully
   warmed long-running companion.
5. Verify generation matching, correct session-count deltas, changed sources,
   inserted events and consumed bytes. Record fallback/rescan behavior rather
   than suppressing a slower legitimate result. A following index replay must
   consume no additional source bytes or usage events and retain the generation.
6. Report three-run medians and ranges with aggregate host CPU/available memory.
   Do not equate a sub-noise timing difference with a per-session cost or
   extrapolate the fixed-baseline experiment to unmeasured history sizes.

The ignored local harness is under
`.release-build/session-growth-20261108/`. Product entrypoints used are
`refreshLocalIndex`, `createLocalIndexBackend`,
`createLocalCollectorRefreshRunner`, `LocalCompanionDataStore` and
`readLocalIndexWorkProjection` through the backend facade. No schema, durable
cache format, accounting attribution or product timeout is changed.

# Preparation state

The first empty-state build stopped after 618,703.978 ms with the refresh
runner reporting an index-stage failure. The original harness recorded the
generic index-unavailable result but did not retain the underlying bounded
index error code; its cause is not established. The partial index had 2,431
committed sources and 321,952 usage events, and SQLite `quick_check` returned
`ok`. No completed baseline or measured comparison is established by this run.
The next attempt spent several minutes recovering provisional rows. Read-only
query-plan inspection showed table scans for canonical quota lookup and usage
references: the interrupted cold build had not reached the normal secondary
index installation at successful completion. Only the verified, experiment-owned
preparation helper was stopped; SQLite discarded its uncommitted recovery
transaction. The existing `createLocalIndexSecondaryIndexes` product entrypoint
was then called on the protected copy through its evidence-store facade. This
prepares the same canonical indexes early, without changing versions, columns,
or product code. `quick_check` again returned `ok`. Resume uses the same normal
reader and safety ceilings. This is preparation, not a measured optimization.

The three-case matrix completed, followed by three additional unchanged controls
because the original unchanged group had large variability. All 12 measured
passes and all 12 subsequent index replays succeeded. Timing attribution remains
limited by changing host conditions; this receipt does not establish a causal
per-session latency or a stable production benchmark.

The successful preparation resumed the retained partial index; its final
580,071.747 ms pass is not an empty-state end-to-end time. Its ignored sample
retains the harness label `fresh-empty-state`, which must not be used as a
cold-build classification. The earlier failed and interrupted attempts remain
separate preparation evidence. The completed baseline has generation 4368,
4,263 sessions, 4,368 sources and 564,116 usage events. All sources completed
and the quarantine count was zero. The preparation accounting pass rebuilt
once, matched its generation with zero fallback, and built 256 window days.

The dashboard was built and published in memory. With provider quota observation
excluded, the normal persistence gate did not create a durable dashboard file.
Its `snapshot_persist` span is therefore an attempted eligibility/persistence
stage, not a durable write or flush measurement. Index and collector/accounting
cache checkpoints were both created and verified for the measured matrix.

# Completed comparison

Every primary trial started from generation 4368, 4,263 sessions, 4,368 sources,
564,116 usage events and the same fixed calculation anchor. Each changed case
ended at generation 4369. The original unchanged group and the confirmation
group are kept separate; no slow sample was deleted or pooled into a different
condition.

Before confirmation, the experiment's appended file was returned to its original
prefix after an exact native-held comparison against the preserved original.
The product's normal full-segment/window verification accepted the changed
physical timestamp as one semantic no-op: zero ingested bytes, zero added facts,
no rescan, and unchanged generation and calculation revision. Only this freshly
attested physical-stat catalog differs in the confirmation checkpoint. The
original collector/cache checkpoint, source bytes, file identities and facts
remain the same. Every confirmation trial restored that checkpoint and proved
the same starting counts again.

Times below are seconds: median (minimum–maximum), three runs per row. Refresh,
snapshot publication in memory, and first all-period work projection are separate
sequential measurements. They do not include source-copy preparation or the
following replay check.

| Case | Index/accounting refresh | Snapshot | Work usage | Total |
| --- | --- | --- | --- | --- |
| Original unchanged | 43.747 (31.083–87.246) | 31.703 (8.901–36.079) | 209.682 (32.647–221.195) | 272.469 (85.296–344.522) |
| Confirmation unchanged | 24.177 (16.761–64.712) | 5.924 (4.893–12.667) | 28.155 (27.368–28.684) | 58.255 (49.023–106.063) |
| Add one real short session | 25.723 (24.374–29.523) | 6.001 (5.196–6.450) | 32.484 (31.137–151.509) | 67.110 (64.207–181.079) |
| Append a real tail | 35.078 (29.739–70.714) | 5.396 (5.136–25.052) | 65.079 (33.902–208.749) | 109.753 (105.552–263.540) |

The parent recorded spawn-to-ready latency separately for the nine primary
processes: median 759.834 ms, range 620.619–16,714.181 ms. It is excluded from
the table. Confirmation self-reported runtime
uptime is separate from parent-measured startup. A fresh process with existing
durable caches is not a warmed long-running companion, and the OS cache was
neither flushed nor held fixed.

| Inclusive substage, seconds | Confirmation unchanged | Add short | Append tail |
| --- | --- | --- | --- |
| Index discovery | 7.046 (6.672–15.944) | 6.208 (6.143–6.296) | 7.011 (5.685–23.693) |
| Discovery graph | 6.088 (5.606–15.299) | 5.356 (5.308–5.421) | 6.287 (4.951–23.000) |
| Index execution | 0.017 (0.006–0.031) | 0.031 (0.020–0.033) | 0.124 (0.099–0.504) |
| Process-first index maintenance | 4.244 (3.349–15.379) | 3.432 (3.298–3.762) | 3.854 (3.519–14.659) |
| Accounting origin proof | 9.878 (4.152–23.240) | 3.961 (3.782–4.694) | 12.107 (3.590–18.062) |
| Accounting window shadow | 0.566 (0.547–1.958) | 10.167 (9.137–11.376) | 9.775 (8.456–10.490) |
| Snapshot index projection | 2.653 (2.569–10.095) | 3.436 (2.653–3.812) | 2.828 (2.624–11.791) |
| Work origins | 24.528 (23.789–24.726) | 29.153 (27.489–141.579) | 61.519 (30.191–198.452) |
| Work project resolution | 2.677 (2.657–3.001) | 2.686 (2.415–5.723) | 2.707 (2.607–5.265) |
| Work aggregation | 0.368 (0.355–0.379) | 0.369 (0.332–2.877) | 0.417 (0.343–2.471) |
| Work finalize | 0.027 (0.024–0.028) | 0.027 (0.023–0.123) | 0.029 (0.024–0.109) |

These nested spans must not be added. Work's origin spans and accounting's
origin-proof spans are collected in separate stage groups. No quota network
observation or durable snapshot flush time is represented as a measured zero.

# Proven operation scope and correctness

| Case | Sources touched / rescanned | Ingestion bytes | Net usage events | Dirty / rebuilt window days |
| --- | --- | --- | --- | --- |
| Unchanged, both groups | 0 / 0 | 0 | 0 | 0 / 0 |
| Add short | 1 / 0 | 174,844 | +2 | 1 / 1 |
| Append tail | 1 / 1 | 2,478,398 | +15 | 1 / 1 |

These counts were identical in every repetition of each case. The added session
increased the session count from 4,263 to 4,264; extending the existing session
kept it at 4,263. All accounting results used `fast_path`, matched their index
generation and had zero accounting fallback, full rebuild, unavailable window
or mismatch window. Every work read returned all four periods with matching
generations and available metadata. Every subsequent index replay retained the
generation and ingested zero further bytes/events.

The appended tail contains 517,356 bytes, but this source is modern response
usage: its baseline prefix contains 48 response-usage events, and the preserved
tail also satisfies `rolloutContainsResponseUsage`. The existing
`response_reconciliation` branch in `src/local-index-refresh.js` therefore
requires atomic full-source reconciliation. The pass replaced the source's
48 events with 63 events; its inserted count of 63 is not a net increase of 63.
Only that source was rescanned. This correctness fallback was preserved.

# Interpretation and remaining gate

The short-session case did not trigger all-history parsing or an accounting
full rebuild. The appended modern session did trigger a full read of that one
session, so its future cost can depend on the whole file's length rather than
only appended bytes. At the measured 2.478 MB size, index execution remained
0.099–0.504 seconds. This single file does not establish a large-file slope.

The day-based accounting work is visible: the changed cases rebuilt one day
and spent approximately 8.5–11.4 seconds in window shadow, versus roughly
0.5–2.0 seconds for confirmation controls with no dirty days. The experiment
does not isolate a universal marginal cost per event or per session.

Full-history work-origin enrichment still dominates many samples. Its wide
variation cannot be explained by adding two events or by the subsecond
single-source index execution alone. The recorded 385 aggregate host samples,
including waiting/replays, had total CPU median 57.07% and maximum 96.09%, and
available memory minimum 623 MiB. Within primary groups, available-memory
medians were 2,302 MiB unchanged, 2,958 MiB short-session and 5,120 MiB appended;
confirmation controls had 5,760 MiB. These are different operating conditions.
No competing process, paging cause, physical disk contention, or idle host is
proven by those counters.

Accordingly, do not subtract the 58.255/67.110/109.753-second medians and label
the differences as session-creation/append costs, and do not claim the added
session made refresh faster than the original 272.469-second median. A stable
performance gate still needs balanced/interleaved comparisons under comparable
resource conditions and separate warmed-process evidence. This experiment
establishes the operation scope, replay correctness and observed stage costs;
it does not guarantee unchanged latency as accumulated history grows.

The aggregate primary records are `summary.json`; the original, confirmation
and changed-case records with separate timing owners are
`qualified-summary.json` under the ignored harness directory. All original
measurements remain retained. Both recorders completed and stopped. Product
source and the running candidate were not changed.
