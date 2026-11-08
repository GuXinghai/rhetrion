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
