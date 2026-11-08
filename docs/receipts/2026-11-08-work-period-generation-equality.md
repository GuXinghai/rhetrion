---
title: Related work period generation equality
date: 2026-11-08
type: receipt
status: partial
---

# Problem and boundary

The isolated `2026110804` candidate from `8f65baa0` passively returned fresh
work, then repeated `work_usage_snapshot_changed` during related-period
preloads. Its [descriptor receipt](2026-11-08-generation-descriptor-read.md)
retains the exact package identity and failed probe details. It was not loaded
live. The real work reader returns a new generation object per read, with
matching id/commit sequence and explicit provenance but no fingerprint.
The service's object-reference comparison therefore rejects equal
publications. Background preload can invalidate its anchor and start again.

The repair compares bounded publication values: existing primitive/fingerprint
identities, or a reviewed local-index tuple with positive safe matching id and
commit sequence, complete status and explicit boolean usage provenance. When
present, calculation revision must be a safe nonnegative integer and match.
Missing/malformed evidence cannot anchor a related read. Changed publication,
provenance or revision is still refused. The same comparison governs active
build matching, retained-result admission and completed related results.

No generation fields, public schema, durable cache format, migration,
accounting figures, periods, identity attribution, cancellation, lease or
timeout limits change. This fixes a repeated-work trigger; it does not prove
that one origin scan, accounting pass or snapshot finishes faster.

# Source verification

A disposable synthetic real-index/backend regression failed before the repair
with `work_usage_snapshot_changed` on its first related period. After the
repair, the same test obtains all four periods at the same anchor/publication
with four builds, explicitly proves distinct object references and rejects a
later synthetic commit. The regression uses two sources, 60 events, eight days
and seed 71; it does not read private sessions.

The focused isolated selection passed 44 tests, no failures/skips, including
the real backend, service and actual loopback route. Twelve value-comparison
subcases cover equal/different fingerprints, revision/provenance changes,
mismatched/coerced/unsafe commits and missing evidence. Unknown anchors are
refused. Existing cancellation, eviction, pagination, retained/restart,
query/Origin/Host and exact reporting-end tests remain in that selection.

The first complete local run passed 298 and failed two old shared-reader
fixtures that omitted generation entirely. Those fixtures now carry the real
backend's complete id/commit/provenance shape; unknown evidence stays refused.
The 13 shared-reader cases and real-backend regression then all passed (14).
Architecture and the 20 preflight tests passed; the final complete local run
passed all 300 tests, no failures/skips. An intermediate run passed 297 and
failed three server cases with `fetch failed`; the unchanged server file
then passed all 51 tests before that final complete rerun. No assertion,
network guard or timeout was relaxed. The two unrelated baseline failures
listed in the descriptor receipt remain outside the local suite.

# Remaining gates and rollback

A successor package and passive isolated rendering must finish before live
loading. The live overview-plus-
requested-work timing target remains failed on `2026110803`; source equality
is not a whole-refresh speed claim. Retain previous failed observations.
Rollback is a normal source revert and, after normal quit, loading a preserved
candidate; no data conversion is needed. No manual live refresh, direct profile
edit, force kill, settings change, installation, signing, publication or push
is authorized by this slice.

# Candidate 2026110805: held at the complete-period gate

Source `b68ab159289de1fb97d65faa4e8b32cf7e6d781e`, Node `26.2.0`, all 762
staged/archive files exactly verified, ASAR SHA-256:
`5c9d6f9b8c4508c730efc924ccb4b7652ee60a65aae9b2e46e6f33347eb94d75`.
It remains unsigned, uninstalled, unpublished and not loaded live. Passive
isolated observations confirmed matching-generation 7d and empty 24h service
responses but did not complete all four periods. A visible-window diagnostic
confirmed unchanged reporting end and ready overview; no live state was used.
One probe also observed a startup work refusal before a later successful read;
that is retained as an observation, not suppressed or attributed to this fix.

The complete-period gate exposed another existing contract failure: the empty
interval branch constructs separate metadata without `observedAt`, which the
existing browser validator requires. The real-backend regression was extended
to pass its actual responses through that validator; it failed with
`invalid_response` on the empty 24h interval. Renderer breakpoint diagnostics
were restricted to the synthetic process and boolean branch conditions; they
do not qualify timing. The candidate stays held rather than weakening the gate.

# Empty interval metadata repair

Empty intervals now reuse the same pass's common pricing and metadata, including
its observation time, method, coverage and partial/unknown status. No fresh
identity, usage row or inferred continuity is manufactured. No facts in an
interval also means no excluded allowance-update facts there; that existing
metadata count is explicitly zero. Unknown usage or metadata coverage remains
explicit in its original generation/status evidence. This fills the existing
transient response contract; it does not change a schema, cache format or ledger.

The real-backend/browser regression then passed for all periods while retaining
changed-commit refusal. The focused service/shared-reader/rollup selection
passed 53 tests with no failures/skips. The empty period has no rows, validates
against the unchanged browser validator and retains the same metadata status
as the populated period. Wider gates and a new package are recorded separately.

The complete local suite then passed all 300 tests, the browser work-view file
passed all 107 tests, architecture passed with zero debt and preflight passed
all 20 tests. No test timeout, response validator or privacy gate was changed.

# Candidate 2026110806: packaged period and rendered gates passed

Source `95cec57668d80d5bf9775cb0f61801cee12a20df`, Node `26.2.0`, all 762
staged/archive files exactly verified, ASAR SHA-256:
`15df1b606006b0a5bef54dd4570e3702a38e66414e14faea9821e87257869cea`.
The unsigned directory artifact remains uninstalled and unpublished.

A new disposable profile with the same structural fixture completed passive
7d, empty 24h, 30d and all-history warming at generation 5 and one common
reporting end. All were fresh, not retained/refreshing; no transitional work
refusal was recorded in this finite probe. The overview was ready. The owning
test harness then opened the actual packaged Usage & costs page: visible,
ready, not busy and without a work issue. Both screenshots were inspected.
Two complete warming sequences were observed across startup and activation;
this does not prove all redundant work removed or measure their cost. No
debugger breakpoints were used in this acceptance run.

After normal synthetic quit, the read-only inventory confirmed five sources,
two history bases, zero quarantine and generation 5. Quota stayed explicitly
unavailable without synthetic credentials (`app_server_unavailable`); work
metadata stayed partial, including the empty period. This does not pass the
credential or general native-security gates and does not qualify live latency.
The previous failed probes remain recorded above and in ignored local evidence.

At this package observation, normal live loading and the complete natural
refresh measurement were still pending; `2026110803` had not loaded the repairs.
No manual live refresh, direct profile edit or forced exit was used.

# Owner qualification added after the live observations

On 2026-11-08, after the observations below, the owner reported that other
programs were consuming host resources and instructed that this test must not
serve as a performance baseline for now. Both `2026110806` live runs, their
phase timings, response latency and publication-to-work gaps are retained only
as observations under uncontrolled resource contention. Do not use them to
claim improvement/regression, rank intrinsic bottlenecks, estimate optimization
benefits or pass/fail the performance target. Earlier timing-based acceptance
judgments for these runs are superseded by this qualification.

Package identity, successful publication, matched-generation/fallback facts,
rendered states and isolated correctness tests remain separate functional
evidence. Performance acceptance is pending a repeat with comparable resource
conditions and fixed-input repeated measurements. This qualification does not
claim that earlier matrices had controlled host load or invalidate their
independently checked semantic equality. No new live benchmark is triggered.

# Live startup: functional success, timings excluded from baseline

After the owner's normal quit, the previous process group drained and no
`usage-monitor.exe` remained. The archive hash was rechecked and `2026110806`
normally launched at `2026-11-08T07:34:08.1632328Z`. No forced termination,
manual refresh, settings change or direct profile edit was used. Natural startup
refresh ran `07:34:32.739Z`–`07:41:18.024Z`: 405287.899 ms (6m45.288s) to
snapshot publication. The first passively observed fresh work matching
generation `25236` arrived at `07:42:48.286Z`: 495547 ms (8m15.547s) from
refresh start. This is an observation bound, not the exact internal completion
time. Under the later owner qualification above, this run provides no
performance acceptance verdict.

| Startup stage | Wall time, ms |
|---|---:|
| Index refresh | 206254.443 |
| Discovery / graph | 140616.786 / 111102.463 |
| Discovery walk / stat | 26652.616 / 23157.967 |
| Index execute / maintenance | 19866.312 / 22843.673 |
| Index descriptor | 595.733 |
| Accounting origin proof | 33384.675 |
| Accounting window shadow | 60879.946 |
| Accounting fast path / quota within it | 35339.115 / 30615.187 |
| Snapshot reload / build | 38639.099 / 38412.646 |
| Snapshot index projection / report | 20057.201 / 17968.918 |
| Snapshot clone / persist timing | 224.833 / 0.596 |

Spans are inclusive, not additive. The descriptor now avoids the discarded
report, but this does not remove cold graph, accounting or work costs. Inputs
and timing conditions differ from earlier natural passes; no causal total
speedup is established. No heavy benchmark or test ran during observation.
Accounting stayed `fast_path`, generation matched, fallback/full rebuild zero,
one dirty/recomputed window and no unavailable/mismatch windows. Quota published.

The 201 completed health reads had median 10 ms and maximum 12646 ms, with zero
failed observer reads recorded. At `07:43:47.632Z`, read-only status/DOM inspection
confirmed live available overview, no stale serve, ready/nonbusy work and hidden
work issue. Tool history remained explicitly partial. Diagnostics through
`07:43:47.768Z` recorded no new work timeout since launch; this finite interval
does not establish sustained timeout absence. A later passive work response
belongs to the same startup publication and is not a second refresh result.
The next automatic pass remains a separate warm-process gate.

# Next natural pass: warm process, timings excluded from baseline

Automatic refresh ran `2026-11-08T07:46:19.018Z`–`07:50:27.472Z`, succeeded
in 248454.580 ms to snapshot publication. Generation `25240` matched, accounting
stayed fast path, fallback/full rebuild zero, two dirty/recomputed windows and
no unavailable/mismatch windows. Quota published. First passive fresh work for
that generation was observed at `07:52:04.084Z`: 345066 ms (5m45.066s) from
refresh start, 96.612 seconds after snapshot publication. The result was not
retained/refreshing and metadata was available. These elapsed times do not
establish normal performance or a target failure under the owner's later
resource-contention qualification. Performance acceptance remains pending.

| Warm automatic stage | Wall time, ms |
|---|---:|
| Index refresh | 80361.354 |
| Discovery / graph | 32230.395 / 2197.530 |
| Discovery walk / stat | 27665.147 / 22363.624 |
| Index execute / descriptor | 33045.285 / 895.170 |
| Accounting origin proof | 50791.558 |
| Accounting window shadow | 56847.499 |
| Accounting fast path, quota retained this pass | 3064.690 |
| Snapshot reload / build | 42215.343 / 41950.248 |
| Snapshot index projection / report | 19752.513 / 17600.631 |
| Snapshot clone / persist timing | 263.083 / 1.007 |

The 161 completed health reads had median 10 ms and maximum 13432 ms; failed
observer-read count was zero. Read-only inspection at `07:50:45.581Z` still
showed savedUpdating/busy work after the overview had published; it was not
reported as fresh. At `07:52:26.385Z`, work was ready with a hidden issue.
Diagnostics through `07:52:26.210Z` had no new work timeout since launch. This
does not establish sustained absence, a controlled total A/B or release safety.
Natural inputs and quota retention differ from startup. No heavy test or
benchmark ran during either observation, and no manual refresh was triggered.

# Follow-up experiment not retained

A mode-separated guardian-parent header-cache experiment reused the work
reader's fresh native authentication, exact named/held nanosecond state checks
and successful-close requirement. Its synthetic regression first failed with
one repeated header read, then passed with zero; mode separation, mutation,
denial and failed close remained covered. The combined selection passed 61,
failed zero and skipped one compressed case because the Node 22 runner lacks
that zstd capability. This was synthetic orchestration evidence, not physical
native qualification or a live performance matrix.

No material end-to-end gain was established. The experiment still requires
native open, path resolution and metadata-database proof, and async wall spans
can include competing synchronous work. Both source edits and the experimental
test were removed; their diff and content-free test output are retained only
as ignored local evidence. No candidate was prepared or loaded for it. This
avoids presenting a one-read reduction as a fix for the live 50.8-second span.
The accepted production source remains exactly `95cec576`.
