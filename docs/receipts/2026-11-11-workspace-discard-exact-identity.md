---
title: Workspace discard exact identity repair
date: 2026-11-11
type: receipt
status: source-and-isolated-windows-validated
---

Scope: Windows x64, Node.js 26.2.0, base `71f1a2cb` plus preserved authorized
workspace changes. The owner approved implementation after the repair plan.
This follows the [compatibility review](../reviews/2026-11-11-workspace-discard-identity-compatibility.md).
No live profile, private source, real credentials, candidate build/switch,
installation, native rebuild, signing or remote action was involved.

## Defect and repair

Previous large-identity tests qualified collector state, source plans and
completed-export deletion. The separate incomplete-workspace discard path still
used ordinary Node stats and Number conversions for identity commitments and
comparisons. Its existing 43-test baseline passed. A new deterministic injection
then reproduced equal confirmation tokens for adjacent synthetic IDs
9007199254740992 and 9007199254740993. This is not an observed real-data deletion
incident; replacement-preservation tests provide the repair's behavioral proof.

Both platform owners now reuse `exactLstat`/`exactOpen`, which read BigInt stats
and retain U64 `dev`/`ino` as canonical decimal strings. Those strings remain
exact through plan/confirmation, file and parent evidence, recovery, paired
canonical/quarantine checks and final control cleanup. Invalid, unsafe Number,
noncanonical and overflowing values are refused. The existing native Windows
U64/U128 representation is not truncated or claimed as covered.

The preflight, plan, journal, marker and receipt move to explicit v0.2 and the
commitment domains to v2. Closed fields, token lengths, bounded counts, fixed
sidecars-before-database order and receipt claims stay unchanged. No raw IDs,
paths or new stores enter persisted artifacts. Original v0.1 schema bytes are
frozen and checked by literal hashes. Old readers reject v0.2, while current
readers preserve and refuse v0.1/unknown controls. No automatic migration,
rounded fallback, dual writer or control deletion is introduced.

## Recovery and rollback boundary

Prior uncommitted confirmations cannot authorize v0.2. Old prepared, committed,
quarantined, marker/receipt and receipt-only transactions remain preserved and
refused. Recovering an old interrupted transaction requires separate review on
a protected copy; no current-runtime token can supply its lost exact identity.
Source rollback cannot authorize downgrade or cleanup of v0.2 controls. Missing
proof never means a file is safe to remove. Existing owner, link, reparse,
resource, no-clobber, failure provenance and recoverable ordering boundaries
remain in force; this precision repair is not a new native qualification.

## Validation

Commands used the pinned
`.release-build/toolchains/node-v26.2.0-win-x64/node.exe` with
`scripts/run-isolated-tests.mjs --test-reporter=spec --` followed by these exact
files. All fixtures are disposable and synthetic. Chosen adjacent IDs use a
test-only stat injection; the ordinary lifecycle tests separately exercise
actual Windows workspace admission, replacement, links, locks, WAL state,
process termination and repeated recovery.

| Invocation / ignored log | Exact files under `test/` | Result |
| --- | --- | --- |
| `workspace-discard-baseline.log` | `export-workspace-discard.test.js`, `export-workspace-discard-schema.test.js`, `export-workspace-discard-owner-boundary.test.js`, `exact-filesystem-identity.test.js` | 43 passed before the repair; no failure or skip |
| `workspace-discard-red.log` | New `export-workspace-discard-identity.test.js` initial reproduction | Equal confirmation tokens reproduced. The initial replacement test also exposed a test-injection mismatch across real hardlinks; injection was corrected to retain one chosen identity for every name of the same object. No actual mistaken-deletion claim is based on that intermediate test. |
| `workspace-discard-core-final.log` | `export-workspace-discard.test.js`, `export-workspace-discard-identity.test.js`, `export-workspace-discard-schema.test.js`, `export-workspace-discard-owner-boundary.test.js`, `exact-filesystem-identity.test.js`, `export-workspace-lock.test.js` | 70 passed; no failure or skip |
| `workspace-discard-neighbor-final.log` | `export-workspace-discard-identity.test.js`, `export-deletion-schema.test.js`, `export-contract.test.js`, `api-surface-reference.test.js`, `cli-reference.test.js`, `local-collector-large-identity.test.js`, `export-storage.test.js` | 50 passed; no failure; two existing POSIX-only skips |
| `workspace-discard-schema-final.log` | `export-workspace-discard-schema.test.js`, after normalizing new schema file line endings | 4 passed; original v0.1 literal hashes unchanged |

The core and neighbor groups overlap on 14 identity tests and are not summed as
independent coverage. The two skips concern POSIX mode bits and UID behavior;
they do not qualify Windows DACL/owner enforcement. Existing actual Windows
protected-workspace refusal remains covered by the core lease tests.

New cases distinguish adjacent file/device, workspace and parent identities;
verify the safe-integer edge and U64 maximum; reject numeric, malformed and
overflow evidence; detect pathname-to-handle substitution; preserve database,
sidecar and control/quarantine replacements; and reject an actual reconstructed
v0.1 confirmation. Eight real synthetic lifecycle states preserve/refuse v0.1
controls, including preparation, commit, quarantine and terminal cleanup. Old
schemas reject v0.2 while the current validators reject v0.1 and future versions.

Architecture passed: 414 production files, 1476 imports, zero approved debt
edges. Documentation governance, root workspace hygiene, whitespace and
`scripts/test-lanes.mjs preflight` (20/20) passed. Local ignored logs are beneath
`.release-build/`. The completed plan was replaced by this receipt and its
separate compatibility review. No full-root, installed, live or release gate is
claimed.
