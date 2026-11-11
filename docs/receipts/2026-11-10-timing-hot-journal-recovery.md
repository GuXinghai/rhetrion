---
title: Guarded timing hot-journal recovery qualification
date: 2026-11-10
type: receipt
status: source-and-synthetic-windows-validated
---

# Scope and outcome

Starting revision `71f1a2cb` plus preserved authorized uncommitted work.
The owner approved fixing the timing SQLite crash-reopen failure described in
the [debt closeout](2026-11-10-debt-closeout.md). That failure is reproduced and
closed in source and isolated Windows x64 tests. No live profile, real source,
manual refresh, installed candidate, signing or remote action was involved.

Normal admission remains read-only. Only Node SQLite's exact
`ERR_SQLITE_ERROR` / extended error 776 (`SQLITE_READONLY_ROLLBACK`) enters
the new fallback. Other errors do not authorize recovery. Timing schema
versions remain 12/13, measurement methods 2/3; no parser, durable cache format,
identity namespace or state migration changes in this slice.

# Recovery contract

1. Retain both existing audit guards. The optional manifest-bound
   `windows-timing-recovery-v1` capability reopens those exact file objects
   through `ReOpenFile`, denies writer sharing, and takes nonblocking exclusive
   full-file byte locks on the main and journal. Existing writers/readers
   prevent acquisition; new reads/writes cannot enter during recovery. Names,
   file identities, protected owner-only DACLs and ancestor guards remain held.
2. Admit only bounded rollback evidence: main at most 256 MiB, journal at most
   512 MiB, consistent power-of-two sector/page sizes and original page count,
   complete synced record ranges, valid SQLite checksums and unique page numbers.
   SQLite's zero-magic/count unsynced next-segment marker ends the durable
   prefix. Unsupported journal shapes remain explicit refusals; no guessed
   repair, journal deletion or missing-evidence-to-zero conversion occurs.
3. Stream copies through existing native 64 KiB copy/readback primitives into
   a new protected directory. SQLite performs the rollback there. Validate
   application/schema version, required tables/columns, single identity record,
   namespace, optional correlation key and both parser-version fields. Close,
   freeze the recovered image against writes/replacement, revalidate through an
   immutable read-only connection and require `quick_check(1) = ok`.
4. The native restore accepts only issued recovery tokens for the exact
   `timing-experiment.sqlite` / `timing-experiment.sqlite-journal` pair and a
   frozen recovered image. Restore through the same locked original handle,
   flush and compare the entire restored main against the approved image, then
   truncate and flush the original journal. The original journal remains hot
   until the committed image is durable. A partially restored main can be
   rolled back again from that unchanged journal.
5. Release recovery locks, repeat ordinary read-only admission on the original
   under its unchanged audit guards, then enter the existing guarded writable
   lifecycle. Successful and refused attempts remove their own temporary copy.
   Unconfirmed SQLite/handle close retains resources and guards until process
   exit. Process death can leave an owner-only temporary directory; subsequent
   attempts do not discover or activate it. It is not a persistent recovery
   cache or new source of evidence.

Failures expose fixed content-free categories and an optional fixed recovery
stage. Native/path/SQLite payload details are not propagated by the fallback.
General native `productionSafe` and `pathWalkRaceSafe` remain false. Old bindings
without the optional capability retain normal admission and refuse hot recovery.
The binding manifest adds only the separately versioned optional capability;
the loader verifies its complete ABI and exact binary digest.

# Verification

Windows x64, pinned Node.js 26.2.0, local C N-API build and regenerated native
integrity sidecar. Binary SHA-256:
`86f7b5c8e903c00fd9d63cf6b575e0834681b55a9e5dbf2017ff32f1ac5b1035`.
The sidecar is development integrity evidence, not publisher provenance,
installed-app qualification or release approval.

All ordinary tests used `scripts/run-isolated-tests.mjs` with disposable
synthetic state. Ignored outputs are scoped beneath
`.release-build/timing-recovery-20261110/`; overlapping counts are not summed.

| Gate | Result |
| --- | --- |
| Dedicated recovery tests | 16 passed, zero failed/skipped |
| Timing, native filesystem, protected SQLite, source-reader, loader, manifest, compressed recovery and API inventory | 106 passed, zero failed/skipped |
| Complete local companion suite | 301 passed, zero failed/skipped |
| Electron runtime staging and tool-inventory tests | 16 passed, zero failed/skipped; deterministic staging |
| Architecture and executable inventory | Passed; no approved debt edges or new command/service |
| Documentation / preflight / whitespace | Passed; 20 preflight tests, no failures/skips |

The dedicated tests verify primary and supplemental recovery, three normal
reopens, unchanged-source replay, multi-segment rollback with 200 spilled
preimages, exact committed measurements and removal of
uncommitted tables. Future/old schemas, future parsers, foreign namespace,
duplicate metadata, wrong correlation key, checksum corruption and a truncated
journal preserve both original files byte for byte. A separate process proves
actual native read/write exclusion. An existing writer blocks recovery and a
later retry succeeds. A rehearsed durable partial-main prefix with the original
hot journal recovers again. An isolated child with an unconfirmed copy close
keeps the original locks until process death; its subsequent restart succeeds.
No product failpoint, permission fallback, timeout increase or weakened assertion
was introduced.

# Remaining boundaries and rollback

The reproduced crash-reopen defect is fixed; this does not establish whole-root
green, live performance, installed/native rendering, signed provenance or
power-loss qualification. Unsupported, oversized or ambiguous journal evidence
still fails closed and requires separate diagnosis on a protected copy. This
change never wipes a database or falls back to an empty result.

Rollback is a focused revert of the optional recovery branch, private platform
helper, native methods and matching manifest lifecycle. Restored databases keep
the same schema, identity and ordinary SQLite rollback format, so no downgrade,
state deletion or conversion is needed. Preserve earlier terminal-API timing
reuse and all unrelated owner work when reverting this slice.
