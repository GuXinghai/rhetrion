---
title: Native Windows legacy report storage repair
date: 2026-11-10
type: receipt
status: source-and-isolated-windows-validated
---

# Scope and outcome

Windows x64, Node.js 26.2.0, starting revision `71f1a2cb` plus preserved,
previously authorized uncommitted work. Owner authorized the next legacy-report
storage repair after the
[collector reconciliation repair](2026-11-10-collector-reconciliation-recovery.md).
All execution used isolated synthetic data. No real report, live profile,
candidate, installed application or publication was changed.

The initial exact-file run reproduced three failures out of nine tests:
directory `fchmod` returned EPERM, report publication refused unavailable
`O_NOFOLLOW`, and the directory permission error masked a symlink refusal test.
These are Windows implementation defects, distinct from the inherited-DACL
fixtures subsequently exposed by stricter native admission.

# Repair

[`local-legacy-report-storage.js`](../../src/local-legacy-report-storage.js)
retains its public entrypoints and fixed nine-file inventory. The unsupported
POSIX publication, chmod, hard-link and source-unlink implementation is replaced
with existing verified native report publication and frozen legacy-source/copy
operations through the public platform facade. The module shrank from 843 lines
to approximately 360. No native API, dependency, cache, service or architecture
layer was added; the native binary and manifest were not rebuilt by this repair.

Report reads use bounded native frozen handles. The existing capability validates
current ownership, regular-file/single-link state, every path component and the
held identity, while denying writer and delete sharing. JavaScript checks the
initial file identity, bounded read responses, EOF overflow and final metadata.
Root and canonical parent guards remain held across awaited operations. Canonical
files require the exact native protected owner-only contract and are read with
identity revalidation. An unsafe canonical file/parent is not hidden by falling
back to an older root report. Missing canonical reports retain the existing
read-only legacy-root fallback without changing source ACLs.

Canonical writes reuse `createOwnerOnlyAtomicFilePublisher`: protected staging,
flush/readback, native atomic publication and its existing cooperating-writer
mutex/uncertain-commit handling. Explicit arbitrary report paths require an
existing protected parent. Invalid/oversized content is refused before directory
creation. Read/write limits are 16 MiB; native reads are at most 64 KiB per call.
At most the fixed nine migration sources can remain open. Larger reports use
the bounded source reader, avoiding the protected-state JSON reader's separate
one MiB ceiling.

Explicit migration now copies rather than deleting sources, as authorized by
the owner. Every source is frozen and hashed before destination creation. Native
copy exclusively creates an independent protected file, flushes and reads back
exact bytes, and retains incomplete creation as delete-on-close until verified.
Caller verification compares destination identity, full hash and byte count
against the still-held source. Source bytes, identities, ACLs and filenames remain
unchanged. An existing or racing conflicting destination is never overwritten
or deleted. A partial/uncertain operation preserves complete copies and reports
`recovery_required`; repeat inspection reauthenticates full bytes and accepts
only safe exact copies before copying remaining files.

The `local-legacy-report-migration-v0.1` result shape and state vocabulary remain:
`migrated` means verified canonical placement with source retained;
`already_migrated` also covers a safe exact existing copy while its source remains.
There is no new migration journal or implicit deletion. CLI help describes copy
and preservation, conflicting apply/dry-run flags are refused, and CLI failures
omit private argument values and raw filesystem messages. Maintained operations
are documented in the
[recovery runbook](../runbooks/local-index-recovery.md#historical-report-storage-and-explicit-copy).

# Validation

All tests used `scripts/run-isolated-tests.mjs`. Safe local logs remain under
the ignored `.release-build/receipt-eperm-20261110/` scratch directory.
Overlapping invocations are not summed as unique coverage.

| Invocation | Result |
| --- | --- |
| `legacy-baseline.log`: original report tests | Six passed, three failed; implementation failures reproduced |
| `legacy-exact-final.log`: final report and tool-inventory tests | 26 passed, zero failed/skipped |
| `legacy-final-scoped.log`: report, calibration audit and reporting boundary | 26 passed, zero failed/skipped |
| `legacy-integration-fixed.log`: report, companion snapshot and tool inventory | 81 passed, zero failed/skipped |
| `legacy-local-final.log`: complete local companion suite | 301 passed, zero failed/skipped |
| `legacy-native-copy.log`: existing native frozen-source copy qualification test | One passed, zero failed/skipped |
| `legacy-integration.log`: earlier companion, atomic storage, inventory and native publication run | 79 passed, two failures; protected-fixture and static-caller declaration corrected in later runs |
| Architecture | 414 production files, 1,470 imports, zero approved debt edges |
| Tool inventory | Complete: 87 records, 88 executable paths, 43 aliases |
| `legacy-preflight.log` and root workspace hygiene | 20 preflight tests passed, zero failed/skipped; root layout clean |

The final report suite has 21 tests. Its Windows permission assertions inspect
DACL/owner/reparse/link facts, not POSIX mode bits. Original source-growth tests
now attempt a real append while the native frozen handle is held and require
OS refusal. An injected inconsistent final stat independently proves the final
size check still refuses. Tests also cover partial multi-file copy/repeat,
post-copy interruption, destination conflict/race, source identity substitution,
root/source pinning, existing writers, hardlinks, symlinks, unsafe destination
DACL preservation, read-only preview, content-free results, exact byte bounds,
large reports, canonical replacement and CLI mode separation.

Companion snapshot and server tests create their new synthetic canonical files
using the existing protected fixture helper. Their malformed-content and HTTP
route assertions remain intact. No existing unsafe production state is repaired
to make those tests pass.

Checks invoked the maintained script entrypoints with the fixed Node runtime;
no package manager or dependency was installed. Documentation governance and
tracked/untracked whitespace checks passed. These scoped correctness runs are
not a complete root-test pass or a refresh-performance measurement.

# Remaining gates

No live, installed, signing or release qualification is claimed. The original
files remain in place after explicit copy; owners must separately authorize any
future deletion. Existing unsafe canonical directories/files remain blocked and
require a separately reviewed preservation/recovery operation. Native general
production/path-walk policy remains false. Atomic name publication retains the
existing parent-directory power-loss durability limitation, and the native
cooperating-writer guarantee does not cover hostile same-owner bypass.
