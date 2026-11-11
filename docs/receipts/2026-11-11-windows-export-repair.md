---
title: Windows local export admission and recovery repair
date: 2026-11-11
type: receipt
status: verified-source
---

Source scope: Windows x64, Node.js 26.2.0, base `71f1a2cb` with the existing
uncommitted workspace preserved. This follows the
[read-only diagnosis](./2026-11-11-windows-export-admission-diagnosis.md).
No live profile, credential qualification, candidate build/switch, installation,
signing, publication or remote operation was performed.

## Implemented boundary

- Export-set directory inspection and both artifact read ports reuse the bundle
  reader's native DACL, owner, single-link, reparse, bounded positional-read,
  held-file identity and parent revalidation logic. Broad Windows ACLs are now
  tested rather than silently bypassed by a POSIX-only permission test.
- The disposable uniqueness SQLite database and rollback journal are created
  protected and held by the reviewed native guards through connection close.
  Cleanup records identities while guarded, then deletes only those files.
  Unknown/replaced objects are preserved rather than recursively removed.
- Windows destination locks use the same basename and a bounded closed regular
  control record, `export-destination-lock-v1`, with PID and random token. Native
  no-clobber creation returns ownership before an awaited inspection can fail.
  Stale removal uses exact native identity instead of renaming an earlier
  pathname observation over a possibly new active lock. Existing protected
  stale-claim recovery remains; normal Windows acquisition needs no new claim.
- Manifestless cleanup proves the exact two-link protected destination
  counterpart before removing a stage. It does not publish, infer a digest,
  follow an outside link or discard evidence without that proof.
- Adjacent deletion recovery exposed a version-selection defect: journal v0.4
  incorrectly selected the legacy numeric-identity commit marker. The writer now
  selects the existing v0.2 marker, as v0.3 journals already do. No schema changed;
  current string identities remain exact. A regression asserts both versions.
- Old identity tests now inject a test-only memory capability. Migration,
  retirement-before-cleanup, replacement/conflict races, backend rotation,
  failure checkpoints and export leases remain exercised. Unreachable POSIX
  file-rotation success expectations were replaced with Windows refusal and
  unchanged-identity checks. Current local-only/Codex-only and explicit
  compression-limit fixture contracts replace obsolete expectations.
  Materializer fixtures that invoke the real verifier now create genuinely
  protected initial state, even when their policy/counters are simulated.

## Compatibility and rollback

Export schemas, pair transaction schema, accounting caches and identity
derivation are unchanged. The destination control record replaces the unusable
Windows symlink mechanism; it is not a cache migration. Old symlink locks/claims,
malformed/future records and unsafe ACLs fail closed without deletion or repair.
Reverting source does not authorize deleting a control file or rolling state
back. Any stranded record requires inspection against a protected copy before
owner-authorized recovery. General `productionSafe`/`pathWalkRaceSafe` policy,
production participant selection and unavailable file rotation remain closed.

## Verification

All tests used `scripts/run-isolated-tests.mjs --test-reporter=spec --` followed
by the exact files below, executed with
`.release-build/toolchains/node-v26.2.0-win-x64/node.exe` on Windows x64.
Only disposable content-free synthetic fixtures were used. Native file/ACL
checks used the existing verified Windows binding; memory adapter results are
logical contract evidence only. No native credential operation was qualified.

| Group | Test files under `test/` | Result |
| --- | --- | --- |
| Artifact/reader/recovery | `export-set-verifier`, `export-set-storage-windows`, `export-storage`, `storage-pair-recovery`, `export-artifact-storage-owner-boundary`, `export-set-verification-owner-boundary`, `local-metadata-bundle-files` (all `.test.js`) | 115/115 |
| Identity and bundle contracts | `export-identity`, `export-identity-production`, `windows-filesystem-native-contract`, `bundle-verifier`, `bundle-verification-owner-boundary`, `application-participant-identity`, `participant-identity-owner-boundary`, `identity-core-package-boundary`, `windows-production-readiness` (all `.test.js`) | 66/66 |
| Controller/deletion contracts | `export-set-controller`, `export-deletion-schema`, `export-deletion-owner-boundary` (all `.test.js`) | 35 passed, 1 existing production-policy skip |
| Public composition contracts | `export-set-materialization-owner-boundary`, `export-workspace-lock`, `export-workspace-discard-owner-boundary`, `export-contract` (all `.test.js`) | 42/42 |
| Adjacent executable flows | `export-deletion-executor`, `export-set-materializer`, `metadata-exporter`, `export-artifact-storage-owner-boundary` (all `.test.js`) | 76/76 |

The groups overlap on the 25 artifact-owner tests: 309 distinct tests passed and
one remained skipped. The skipped CLI creation test honestly reports that the
local production filesystem policy is unavailable; it does not enable a backend.
After the final canonical-serializer error normalization, the native set-storage
and verifier-owner files passed again (13/13). The materializer also passed
independently (19/19). Earlier failing intermediate runs are not passing gates.

Final architecture check passed with 414 production files, 1474 imports and zero
approved debt edges. Root workspace hygiene, documentation governance,
`scripts/test-lanes.mjs preflight` (20/20) and whitespace checks passed.
Local ignored logs use the `.release-build/windows-export-repair-` prefix.
No complete root-suite or installed/release qualification claim is made.
