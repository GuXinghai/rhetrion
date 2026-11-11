---
title: Workspace discard exact identity compatibility review
date: 2026-11-11
type: review
status: implementation-boundary
---

This is the compatibility/recovery review for the owner-authorized
[repair](../receipts/2026-11-11-workspace-discard-exact-identity.md), at base
`71f1a2cb` plus preserved work. It precedes schema and writer changes; it is not
runtime or release evidence. Live state and existing owner transactions remain
untouched.

## Selected contract

- Use existing `exactLstat`/`exactOpen` for Node filesystem identities. Their
  authority is exact unsigned 64-bit `dev`/`ino`, serialized as canonical decimal
  strings. Negative, unsafe Number, overflow and malformed values refuse.
  Native Windows volume/file U64/U128 identity is a separate representation;
  do not truncate it, claim U128 coverage or change native qualification.
- The preflight, journal, marker, receipt and plan move to explicit v0.2.
  Their closed field shapes and token lengths stay unchanged. Evidence remains
  token-only, with no raw identities, paths, content or new retained fields.
- Commitment domains move from v1 to v2 for the plan, artifact evidence,
  directory identity, confirmation and journal commitment. The canonical
  identity strings enter each relevant commitment. Counts and sizes remain
  bounded numeric values. Equality uses exact strings through quarantine and
  control cleanup; there is no Number fallback.
- Keep all original v0.1 schema bytes immutable. Current readers and validators
  admit v0.2 only. Old or unknown controls/receipts are rejected and preserved,
  including prepared journal-only, committed, quarantined and terminal states.
  No dual writer, automatic migration or reinterpretation of old tokens.
- A prior uncommitted confirmation token cannot authorize the new plan. New
  confirmation is checked again under the existing workspace lease before
  journal publication. A mismatch leaves workspace facts unchanged.
- Existing v0.1 interrupted transactions require a separately reviewed protected
  copy recovery operation; the new runtime does not attempt to complete them.
  An old reader rejects v0.2 schema identities, preventing a source rollback from
  mutating new transactions. Never relabel, delete controls or downgrade state.

## Validation boundary

Baseline: 43/43 existing discard/identity tests passed on Windows x64 with Node
26.2.0. A new synthetic identity injection reproduces identical confirmation
tokens for adjacent IDs 9007199254740992 and 9007199254740993. This establishes
the missing distinction, not an observed real-data deletion incident.

Validate exact token distinctions, same-byte replacement preservation, safe
edge/maximum/overflow, all recovery states, immutable v0.1 schemas and refusal of
old controls before cleanup. Rerun actual Windows synthetic lifecycle tests,
including process death, plus privacy, owner boundaries, source-plan identity,
export/storage compatibility, schema inventory, architecture and documentation.
This change adds no filesystem capability and does not qualify existing ACL,
same-user race, native U128, installed or release behavior beyond its tests.

## Owner follow-up: one-time conversion and retirement

After the precision repair, the owner requested a standalone one-time conversion
and removal of the old implementation after acceptance. Ordinary runtime must
continue to accept v0.2 only; no startup conversion, old writer or recovery
fallback is to be added.

Cutover must first identify the exact existing transaction targets. No old
transaction directory or completed conversion receipt has been supplied for
this follow-up. Source tests, old schema files and historical build copies are
not evidence that an owner transaction exists or was converted. This record
does not claim a complete filesystem inventory or a successful conversion.

Before retiring anything still needed for recovery, require a bounded target
inventory and a per-target result: verified conversion, verified absence, or an
explicit unresolved state. Missing/partial identity evidence cannot be declared
converted. Preserve originals and content-free conversion receipts. Rehearse
interruption and exact retry against disposable protected fixtures before any
authorized real conversion or activation.

Once every admitted target is accepted, remove the one-time conversion entrypoint
and old-version implementation from the maintained source and shipping closure.
Remove the v0.1 schema directory when it no longer has an identified recovery or
audit consumer, together with dedicated old-reader construction and obsolete
documentation links. Keep current-version tests, malformed/old-version refusal
and replacement-preservation tests; refusal is a security boundary, not a
compatibility layer. Do not remove unrelated legacy facades or user backups.

The current source already has no v0.1 runtime dispatch or writer. Its remaining
v0.1 schemas support the frozen-schema/old-reader regression test. Removing
these files before target reconciliation would not demonstrate that one-time
conversion was completed. No conversion tool or real-data operation was executed
by this follow-up inspection.

### Bounded follow-up inventory

On 2026-11-11, at `71f1a2cb` plus preserved work, a read-only filename inventory
checked seven repository-local scopes: `exports/`, `staging/`, `quarantine/`,
`imports/`, `.usage-monitor/`, `.app-usagemonitor/`, and the existing isolated
Windows export diagnosis directory. Two scopes existed, containing 48
directories and 189 files in total. No `workspace.sqlite3`, discard journal,
commit marker or receipt was found. There were no read errors, skipped reparse
points or reached traversal limits (2,000 directories, 20,000 files and eight
descendant levels per scope). No file contents were read by this inventory.

This establishes absence only in those scopes, not across the machine. Source
inspection confirms that export workspace creation, inspection and discard
require an explicit `--workspace` target; there is no default workspace root
from which all owner transactions can be enumerated. No existing transaction
has therefore been admitted for conversion. The outstanding input is the
owner's workspace directory, or confirmation that this CLI workflow has never
been used. Do not scan unrelated profiles to fill that gap.

After target reconciliation, the bounded retirement change is the four v0.1
schema files and their dedicated frozen-hash/old-reader construction in
`test/export-workspace-discard-schema.test.js`. Replace that construction with
direct v0.1 and unknown-version rejection checks against the current validators;
retain interrupted-state refusal and exact-identity preservation coverage.
Update the maintained schema inventory in the same change. No current-runtime
compatibility branch needs removal, and no migration entrypoint should be added
unless an actual old target is identified.

The owner subsequently requested an agent-led broader search. The resulting
[five-volume read-only inventory](../receipts/2026-11-11-workspace-discard-target-inventory.md)
supersedes the need for the owner to supply a directory before discovery work.
It found no matching transaction files, with explicit access gaps; it does not
establish a completed migration or authorize treating those gaps as absence.
