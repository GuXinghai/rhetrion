---
title: Windows export and participant identity admission diagnosis
date: 2026-11-11
type: receipt
status: diagnosis-complete-repairs-not-applied
---

# Scope and result

Windows x64, Node.js 26.2.0, branch
`refactor/local-index-v11-impact-projections`, revision `71f1a2cb` plus the
preserved authorized uncommitted work. Owner asked to investigate the remaining
Windows export/identity failures. This is diagnosis only: no production source,
test contract, schema, native manifest, approval flag or live state was changed.
Temporary experiments used disposable content-free synthetic data and real
Windows filesystem checks. No real credentials, sessions or export were read.

There are three distinct causes, not one general native-load failure:

1. **Export-set file readers omit Windows DACL admission.** The canonical JSON
   and byte readers accept a synthetic artifact with a confirmed Everyone-read
   ACL. This is a real missing guard in the platform reader. It is the highest
   priority source repair identified here.
2. **Paired export publication creates a symlink lock that its native inspector
   refuses.** Properly protected destinations still fail with the underlying
   `WINDOWS_FILESYSTEM_REPARSE_POINT`. This is an implementation mismatch, not
   grounds to relax native reparse refusal.
3. **Participant identity production/file operations are intentionally gated.**
   The verified adapter has `productionSafe: false` and `pathWalkRaceSafe: false`;
   production credential readiness is separately disabled. Old file/backend
   tests omit the required adapter and fail before exercising their intended
   behavior. Enabling these gates is a separate qualification decision.

These are retained local CLI export/readback functions, not removed cloud-upload
commands. `src/cli.js` still exposes `inspect-export`, `export-local`,
`export-set`, verification/recovery and export-identity rotation. They are named
in `package.json` and the [CLI reference](../reference/cli-reference.md).
The [cloud retirement decision](../decisions/2026-10-23-local-product-identity-and-cloud-retirement.md)
preserves general local export where used; the
[Codex-only decision](../decisions/2026-10-27-codex-only-product.md)
preserves bounded historical readback without enabling retired providers.

# Impact boundary

Participant secret load/lease/rotation is invoked by the CLI, not the desktop
ordinary refresh path. Some refresh modules import `local-node-runtime.js` for
the Codex scanner, and account-observation/installation modules import the
export state-directory helper. Those imports do not invoke participant secret
storage. No app module was found calling the production participant selector or
participant lease. The export pseudonym secret is distinct from the index salt
and the current account-observation credential broker.

Consequently these findings explain local export/identity failures; they do not
establish a cause of daily refresh latency or a failure in the running candidate.
No runtime/candidate access was needed or performed.

# Reproduction

Ordinary tests ran through `scripts/run-isolated-tests.mjs`, using synthetic
homes and state:

| Exact invocation scope | Result |
| --- | --- |
| `export-identity-production`, `export-identity`, `bundle-verifier`, `export-set-verifier`, `windows-production-readiness` | 74 tests: 16 passed, 57 failed, one existing POSIX-only skip |
| Windows identity contract, bundle file reader, bundle/set verification ownership, artifact storage ownership, application identity, identity-core boundary and participant ownership: eight files | 68 passed, zero failed/skipped |
| Temporary native synthetic experiment | Passed; observations below |

The 57 failures split into 20 participant-identity tests, 16 bundle-verifier
tests and 21 export-set-verifier tests. The bundle tests fail while their
fixtures publish a pair, before most verifier assertions run. Set tests fail
while materializing fixtures, before set verification. These failures cannot be
counted as 57 broken validation algorithms or as 57 tested refusal cases.

The production selection/readiness tests pass because they assert deliberate
refusal. The memory-only identity handle contract also passes and explicitly
requires file-backed rotation to refuse until its atomic replacement boundary
is available. Passing injected/memory contract tests does not qualify native
production identity.

# Controlled experiments and call chains

| Synthetic experiment | Observed result | Owner / boundary |
| --- | --- | --- |
| Production participant selection, no overrides, actual adapter | `EXPORT_IDENTITY_PRODUCTION_BACKEND_UNAVAILABLE`; zero backend constructions | `src/export-identity-production.js`, `selectProductionParticipantIdentity` |
| File-backed participant lease with actual adapter | `EXPORT_IDENTITY_WINDOWS_FILESYSTEM_POLICY_UNAVAILABLE`; zero created identity entries | `src/platform/participant-identity.js`, `resolveWindowsFilesystemAdapter` / `withParticipantSecretLease` |
| Explicit synthetic environment identity | Ready, environment source, no files created | Control proving pure identity input does not require filesystem qualification; not an operational workaround |
| In-memory bundle bytes | Public byte verifier passed | No pair publication involved |
| Default pair publication into a plain test-created directory | `Invalid Windows owner-only export directory` | Expected refusal of inherited/unprotected destination ACLs |
| Default pair publication into a native protected directory, or an absent directory created by the writer | Native inspector rejects the symlink lock with `WINDOWS_FILESYSTEM_REPARSE_POINT` | `src/platform/owner-only-export-artifact-storage.js`, `withExportDestinationLock` / `windowsInspectPath` |
| Existing pair created through the reviewed protected-state store | Public `verifyLocalMetadataBundleFiles` passed, transport disabled, bytes unchanged | `src/platform/local-metadata-bundle-files.js`, native source reader |
| Same synthetic bundle after Everyone-read was explicitly granted | Single-bundle reader rejected `bundle_permissions`; native inspection confirmed `broadAccess: true` | Correct Windows DACL rejection |
| Export-set `readCanonicalArtifact` and `readOwnerOnlyBytes` on that broadened synthetic file | Both returned all 4,154 bytes | `src/platform/export-set-verification-storage.js`, missing Windows DACL admission |

The final experiment proves the two platform ports accept the broad ACL. It
does not claim that the complete set verifier accepted a corrupt set, that
cryptographic/schema checks failed, or that data was uploaded. The default set
verifier calls these ports for manifest/receipt and encoded/decoded chunk reads
(`src/export/set-verification.js`). This missing permission check therefore
remains relevant even while publication currently fails first.

# Why the failures occur

## Export-set readback

`assertArtifactStats()` checks type, link count and size, and checks a UID only
when `process.getuid` exists. It has no Windows native owner/DACL inspection.
`inspectOwnerDirectory()` has the same UID limitation. `O_NOFOLLOW` falls back
to zero, followed by path-based Node open and number-based dev/inode comparison.
Those are not the existing Windows handle/ACL boundary. No race exploit was
attempted; the deterministic broad-ACL acceptance alone establishes the defect.

The test named “compressed verifier enforces owner-only artifact permissions”
returns immediately on Windows. Its reported pass supplies no Windows ACL
evidence. Temporary uniqueness-index storage also uses Node mode/chmod and
SQLite directly; that path needs a Windows protected-storage review during the
reader repair. Its confidentiality/race behavior was not qualified here.

The single-bundle platform reader already uses the narrow native source-reader
contract and rejects the broadened artifact. Reuse that reviewed boundary for
set readers rather than adding another policy or enabling global approval.

## Paired publication

The storage owner uses `.app-usagemonitor-export.lock`, a symbolic link with a
PID/token target. After creating it, `withExportDestinationLock()` invokes
`inspectWindowsFile(..., { allowReparsePoint: true })`. That JavaScript option
cannot grant access that `adapter.inspectPath()` refuses first. Native
`InspectPathCallback` enters `OpenRelativePath`, whose handle-relative walk
rejects reparse points. A diagnostic wrapper around the unchanged actual
adapter recorded only the fixed failure code and that the object was a symlink.

The application facade intentionally converts these internal failures to the
content-free `Local export storage operation failed`; that redaction masks
the specific cause in ordinary test stacks but is not itself a permission bug.
The 16 single-bundle fixture failures encounter unprotected destination
admission first. Correcting only those fixtures exposes the independent lock
failure. No bundle byte-parser regression was established.

## Participant identity

The generator, sidecar policy and loader preserve false general approval flags.
The generator refuses unreviewed true native claims. The production selector
also requires an injected backend factory and qualified readiness; the CLI
provides neither. An explicit `--secret-file` selects development file mode,
but its returned identity options contain no filesystem adapter. The lease
still requires the approved adapter and refuses. This is not evidence of a
Credential Manager prompt, corrupt secret, permissions on the owner's profile,
or broken pseudonym derivation: refusal happens before those operations.

The Windows file-rotation path has an additional explicit
`EXPORT_IDENTITY_WINDOWS_ROTATION_REPLACEMENT_UNAVAILABLE` refusal even when a
test supplies a memory adapter with true flags. Removing only the earlier
policy check would therefore not implement a qualified identity lifecycle.

# Recommended repair slices, not applied

1. **Export-set native read admission.** Reuse the narrow source reader for
   protected root/manifest/receipt/chunk access; keep handles and exact identities
   across reads. Review temporary uniqueness-index directory/database admission
   through existing protected storage. Preserve size, decompression, canonical
   JSON, resource limits, cleanup and content-free failures. Add actual native
   Windows broad-DACL, owner/link/reparse, replacement, bounded-read and cleanup
   cases rather than returning early. No schema or cache-format change is
   intrinsically required. This closes a real guard gap without general native
   production approval.
2. **Destination lease mismatch.** Use the existing protected regular-file lease
   pattern already owned by `src/platform/owner-only-export-workspace-lease.js`.
   Preserve no-clobber acquisition, PID/token ownership, exact release, stale
   recovery, claim handoff and callback failure precedence. Review the existing
   symlink locks/claims and incomplete transactions explicitly; do not delete
   unknown controls or add a permissive reparse exception. Lock-control format
   and recovery compatibility need their own review before implementation.
   Test concurrent writers, replacement, failed cleanup, process crash and
   preserved last complete pair. Repaired fixtures must create native protected
   destinations, never fix permissions on pre-existing user state.
3. **Identity tests versus production qualification.** Separate pure/memory
   lifecycle coverage from actual unavailable production/file integrations.
   Preserve the existing refusal tests. A native file/credential lifecycle needs
   explicit composition and exact physical qualification, not an adapter with
   forged true flags, environment-secret workaround or a newly permissive
   legacy fallback. Do not rotate/migrate/delete any retained identity as part
   of fixing tests. This is lower priority for ordinary desktop refresh and
   separate from the first two source defects.

Fixing the export-set reader can be validated independently with pre-created
synthetic protected artifacts; it need not wait for a working exporter.
No new service, cache, dependency or public endpoint is needed. These are
recommendations only; the owner requested investigation, not implementation.

# Evidence and remaining gates

Ignored local material lives under
`.release-build/windows-export-diagnosis-20261111/`: `reproduction.log`,
`contracts.log`, `experiments.log`, `observations.json` and the temporary
investigation test backup. To reproduce the experiments, restore the backup
temporarily at `test/windows-export-investigation.test.js`, run it through the
ordinary isolated runner, and remove it afterward. It changes permissions only
on its own synthetic artifact using the existing fixture helper. Output contains
fixed errors, repository-relative stack locations, counts and capability facts;
no private source content or real identity is recorded.

The temporary test was removed from the repository tree. Existing tests and
production code were not modified. No native rebuild, manifest regeneration,
credential qualification, R7 generation, candidate switch, live test, install,
commit, push or external write occurred. Root-wide, installed and release gates
remain unqualified; the 57 reproduced failures remain open.
