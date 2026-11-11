---
title: Collector U128 source identity repair
date: 2026-11-11
type: receipt
status: source-and-isolated-windows-validated
---

Windows x64, pinned Node.js 26.2.0, starting revision `71f1a2cb` plus preserved
owner changes. The owner authorized implementation after diagnosis and the
[compatibility/recovery review](../reviews/2026-11-11-collector-source-identity-compatibility.md).
This is source and isolated synthetic evidence. No live data, real credentials,
candidate switch, installation, signing, remote action, R7 generation, native
rebuild or policy enablement was involved.

## Defect and diagnosis

The native source port already preserves U64 volume and U128 file identities
as exact decimal strings. Collector source plan v0.2, supplemental plan v2 and
the supplemental workspace codec instead limited both fields to U64. A newly
created protected empty file reproduced `codex_collector_export_source_changed`
before any source read. A synthetic `2^64` file ID independently failed the
supplemental validator. Primary Codex source planning already supported U128.

The initial six-file isolated invocation reported 43 passed and 23 failed out
of 66 tests. Twenty failures encountered collector identity admission before
their intended lifecycle assertions. The other three came from old fixture
setup: publishing obsolete compatibility through a strict current writer,
copying a new column into frozen v4 SQL, and creating an unprotected supposedly
future database whose version 6 was actually older than current 7.

The temporary diagnosis test was removed; its ignored source backup and final
log use `.release-build/collector-native-identity-*`. No real-data failure,
corruption or refresh-latency claim follows from this synthetic reproduction.

## Implemented contract

- Collector source plan v0.3 and supplemental plan v3 use canonical decimal
  strings, with U64 devices and U128 file IDs. The existing primary-source
  normalization moved into its existing export owner and is shared by primary,
  collector and supplemental validation. New collector/supplemental inputs
  refuse Numbers, malformed strings, wrong field widths and overflow.
- Plan and supplemental commitment domains advance with their formats. Private
  frozen source-plan bundles and their domain advance to v0.3. Restart cursor
  shape is unchanged and remains bound to the exact current plan digest. Quota
  occurrence IDs and record shapes, account/session pseudonyms and credentials
  remain unchanged.
- Workspace descriptor v2 and physical schema 8 use the primary source's exact
  canonical TEXT codec for both primary and supplemental bindings. SQL enforces
  the distinct field bounds. The old `u64:` codec, old collector dispatch and
  numeric version inference were removed. Schema hash is
  `e4c2e77c113638d9ab07c87221882c42e2689f40b17e7557888bdd9fa7379bea`.
- Normal runtime accepts current formats only. Old plans/bundles and older or
  future physical workspaces refuse without reinterpretation, source fallback,
  writable configuration or deletion. Existing retired-provider metadata never
  enables collection/resume. No migration entrypoint or compatibility layer was
  added; no existing workspace was converted or relabeled.
- The three independent fixtures now construct the evidence they intend to
  reject. Historical SQL stays unchanged, future-state setup is protected,
  and old-compatibility refusal checks complete database-byte preservation,
  invocation reservation and checkpoint state through a read-only connection.

## Verification

All ordinary commands used `scripts/run-isolated-tests.mjs --test-reporter=spec --`
and disposable content-free synthetic homes/state. Logs use the ignored
`.release-build/collector-identity-` prefix. Groups overlap and must not be added
as unique test coverage.

| Log / exact scope under `test/` | Result |
| --- | --- |
| `core.log`: `exact-filesystem-identity.test.js`, `codex-collector-export-source.test.js` | 24 passed, zero failed/skipped |
| `lifecycle.log`: the six baseline files, named below | 72 passed, zero failed/skipped; six nested assertions became reachable after repair |
| `storage.log`: `export-supplemental-source-plan.test.js`, `export-workspace.test.js`, `export-workspace-owner-boundary.test.js`, `export-source-pipeline-owner-boundary.test.js`, `export-set-materialization-owner-boundary.test.js` | 50 passed, zero failed/skipped, including three new persistence/version tests |
| `contracts.log`: API/CLI references, discard schema/identity/owner boundary and deletion schema | 51 passed, zero failed/skipped |
| `prior-reader.log`: temporary committed schema-7 storage-owner rehearsal | One passed; no database-byte or directory-entry change |
| `adjacent.log`: checkpoint workspace, export contract, deletion executor, paginated ancestry, controller, materializer, frozen source bundle, source plan and discard (nine files) | 129 passed, one stale version-fixture failure, one existing production-policy skip; see correction below |
| `checkpoint-final.log`: `export-checkpoint-workspace.test.js` after that fixture correction | 12 passed, zero failed/skipped |

The six baseline files are `codex-collector-workspace-source.test.js`,
`export-deletion-preflight.test.js`, `export-paginated-reset.test.js`,
`export-source-plan-bundle.test.js`, `export-supplemental-source-plan.test.js`,
and `supplemental-source-lifecycle.test.js`. Later storage/bundle cases are
recorded in their separate groups rather than inflating the earlier 72 result.

The adjacent run's sole failure used version 8 as an incompatible future marker,
which became current in this repair. Its unexpectedly successful open also
escaped the fixture's cleanup reference, masking the assertion with `EBUSY`.
The corrected fixture tests old 4/5/6/7 and future 9, retains an unexpectedly
opened handle for cleanup, and passes all 12 owning-file tests. No production
source changed after the adjacent invocation. The other eight files passed;
the remaining CLI-creation skip still reports unavailable production filesystem
policy. The original nine-file invocation remains recorded as failed, not
rewritten into a passing complete run.

Coverage includes adjacent device/file IDs above Number precision and file IDs
above U64, U64/U128 maxima, invalid/overflow refusal before source access,
exact SQL round-trip and reopen, frozen append prefixes, source replacement,
links/owner checks, bounded batches, process death after a committed collector
batch, monotonic replay and unchanged external sources through deletion/discard.
Old/future bundles refuse before either source verifier is invoked.

The prior-reader rehearsal loaded the unmodified storage-owner source from
`71f1a2cb`, relocating only its static dependency URLs to the current verified
platform closure. Its schema-7 admission refused a synthetic schema-8 workspace;
the current reader then reopened it successfully. This is not a historical
installed-app test. The temporary test was removed, leaving only its ignored
source backup and log; no old runtime reader remains in maintained source.

Architecture passed with 414 production files, 1,476 imports and zero approved
debt edges. The local export contract check reports 156 fields and unchanged
current compatibility; generated export artifacts required no regeneration.
Final documentation governance, root workspace hygiene, whitespace checks and
preflight passed (20/20). The completed plan was removed after its evidence and
selected contract were incorporated here and into the maintained references.

## Recovery, rollback and remaining gates

The earlier access-limited workspace inventory is unchanged. It did not identify
an exact existing conversion target and does not prove inaccessible state absent.
Any later discovered old workspace remains preserved for a separately admitted
protected-copy recovery operation. No guessed identity, in-place relabeling,
automatic migration or destructive downgrade is authorized by this repair.

Rollback must preserve new-format files; older readers refuse rather than
mutate them. Native general production/path-walk approval remains disabled.
No full-root, live, packaged, installed or release qualification is claimed.
