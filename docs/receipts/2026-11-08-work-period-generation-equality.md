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

Normal live loading and the overview-plus-requested-work natural refresh
measurement are still pending. The running `2026110803` has not loaded these
repairs. No manual live refresh, direct profile edit or forced exit was used.
