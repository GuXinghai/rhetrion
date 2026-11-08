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

# Live functional verification and measurement reset

After the owner's normal quit, the previous process group drained and no
`usage-monitor.exe` remained. The archive hash was rechecked and `2026110806`
normally launched at `2026-11-08T07:34:08.1632328Z`. Startup and the next
natural automatic refresh succeeded. Accounting remained fast path with
matched generations, no fallback/full rebuild and no unavailable/mismatch
windows; quota published. Read-only status/DOM inspection confirmed available
overview, ready/nonbusy work and a hidden work issue. Tool-history uncertainty
remained explicit. No manual refresh, direct profile edit, setting change or
forced termination was used. These are functional observations only.

The owner subsequently identified other programs consuming host resources,
excluded that test from performance use, then explicitly requested clearing
its records and starting fresh. The contended live timing tables, response
latencies, work gaps, quantitative conclusions and ignored observer receipts
were removed. Package/launch identity, isolated correctness/rendering and the
functional facts above remain. Git history is not rewritten, and application
profile/diagnostics are not deleted. No retained performance sample from that
session enters the new recording or an aggregate.

Fresh recording observes natural automatic refreshes in the already running
process after an explicit new UTC cutoff. It does not restart the app or claim
cold-start evidence. Corpus/generation changes remain visible; natural runs do
not become a controlled same-input A/B merely because host contention stopped.
Performance acceptance and cause attribution require their own matched-input
repeat evidence.

# Fresh natural-refresh recording completed

The new session began `2026-11-08T08:31:42.618Z` and finished
`08:58:44.278Z`. It observed three complete natural automatic refreshes of
`2026110806`, source `95cec576`, using the package identity above. An already
running refresh that began before the cutoff was excluded. No old-session
sample, restart, manual refresh, source edit or benchmark was included.
All three are warm-process observations; process start and cold startup were
not measured. The source corpus was live and generations differ, so this is
a new operating-condition series rather than a fixed-input before/after proof.

| Sample / generation | Refresh start UTC | Snapshot publication, ms | First observed fresh work, ms from refresh start | Work observation UTC |
|---|---|---:|---:|---|
| 1 / 25249 | 08:38:17.332 | 170911.191 | 259783 | 08:42:37.115 |
| 2 / 25250 | 08:46:08.907 | 184456.643 | 283401 | 08:50:52.308 |
| 3 / 25251 | 08:54:14.162 | 172144.857 | 261827 | 08:58:35.989 |
| Median | — | 172144.857 | 261827 | — |
| Range | — | 170911.191–184456.643 | 259783–283401 | — |

Snapshot median was 2m52.145s; overview plus first observed matching fresh
work median was 4m21.827s (range 4m19.783s–4m43.401s). The work observation is
a bound, not the exact internal build-completion instant. All matched the
terminal accounting generation, were not retained/refreshing and had available
metadata. Accounting remained fast path; generation matched and fallback,
full rebuild, unavailable windows and mismatch windows were zero. Dirty and
recomputed windows were 6, 7 and 8 respectively. Quota publication succeeded.

| Inclusive stage or observed interval | Median, ms | Range, ms |
|---|---:|---:|
| Index refresh | 27911.124 | 27677.734–29221.958 |
| Index discovery | 22145.149 | 22138.048–23465.547 |
| Discovery graph | 1544.078 | 1502.003–1591.784 |
| Discovery walk | 19873.064 | 19773.931–20878.871 |
| Discovery stat | 15473.074 | 15381.116–16293.501 |
| Index descriptor | 347.558 | 326.415–356.142 |
| Accounting origin proof | 40784.690 | 35495.046–45500.630 |
| Accounting window shadow | 45643.550 | 44445.570–46465.891 |
| Accounting fast path | 3356.278 | 2961.349–27615.196 |
| Snapshot reload/publication | 36130.366 | 33116.923–46667.421 |
| Snapshot build | 35872.669 | 32884.758–46305.039 |
| Snapshot index projection | 15028.233 | 14193.942–24344.320 |
| Projection report | 11933.220 | 11728.096–12979.720 |
| Snapshot publication to first observed fresh work | 89685 | 88874–98946 |

These nested spans must not be added. Fast-path quota recomputation occurred
only in sample 2 (22017.017 ms); absence of that stage in the other samples
means quota retention, not measured zero work. Snapshot persist timing was
0.572–0.642 ms and is not a durable-flush performance claim. Production work
substage timing is not wired into this receipt, so the final work interval
does not isolate origins, SQL, Git, aggregation, scheduling or validation.

The host sampler recorded 324 aggregate CPU/available-memory samples, including
idle waits between refreshes. Total CPU median was 52.36%, maximum 78.95%;
minimum available physical memory was 10574 MiB. During each refresh-to-work
interval, CPU medians were 53.735%, 53.065% and 53.535%. These totals include
Rhetrion and other processes and do not identify the source of load. Disk
contention was not sampled; no idle-host claim is made. All three runs recorded
zero failed observer reads. Completed health-read maxima were 14295, 11587
and 11513 ms, so control-plane stalls remain observable.

A bounded read of the currently retained application diagnostic log at
`10:21:20.322Z` found no `work_usage_timeout` entries timestamped within the
three-run window. This is a finite retained-log observation; historical log
coverage or sustained timeout absence is not established. The recorder stopped
after its requested three samples. The result was not reported promptly at
completion; it was inspected and reported after the owner's follow-up.

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
avoids presenting a one-read reduction as an end-to-end performance fix.
The accepted production source remains exactly `95cec576`.
