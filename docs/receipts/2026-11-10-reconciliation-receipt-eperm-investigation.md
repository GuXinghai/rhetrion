---
title: Windows reconciliation receipt replacement investigation
date: 2026-11-10
type: receipt
status: investigated-with-unattributed-transient-trigger
---

# Scope and conclusion

Windows x64, Node.js 26.2.0, revision `71f1a2cb` plus preserved, previously
authorized uncommitted changes. This is a follow-up to the private-copy gate in
the [debt closeout receipt](2026-11-10-debt-closeout.md). It records investigation,
not an implementation repair or live qualification. No live profile, source,
candidate, installed application, schema or persistent cache was changed.

The receipt replacement refusal is intermittent. It reproduces without SQLite
or any product database guard. A diagnostic native call captured
`MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)` returning
`ERROR_ACCESS_DENIED` (5). On this host, holding a read handle to the existing
target reproduces that refusal even with all three sharing flags enabled;
closing that handle makes the same replacement succeed. Three controlled
rounds agree. Successful DELETE-access admission therefore does not exclude
an open-target replacement restriction.

The spontaneous failure's actual handle owner or filesystem filter was not
captured. This establishes a matching Windows refusal mechanism, not proof
that a particular antivirus, indexer, process or driver caused the original
failure. The historical log has no raw Win32 code or handle snapshot, and its
disposable fixture has been removed. Its exact trigger cannot be reconstructed.

# Product call path and consequence

The relevant source is
[`reconcile-native-electron-collector-observations.mjs`](../../scripts/reconcile-native-electron-collector-observations.mjs).

1. `writeReceipt` exclusively creates, writes, flushes and closes a temporary
   file. It hard-links that file to the final receipt, removes the temporary
   name and calls `chmod(0600)`.
2. `reconcileNativeElectronCollectorPrivateCopy` opens the destination session
   and commits missing record multiplicities.
3. `updateReceipt` exclusively creates, writes, flushes and closes `.update`,
   then calls `rename(temporary, receipt)` at line 290. The original failure
   occurred here during the `append_committed` update, before session close.
4. The `finally` block still closes the SQLite session. A successful run later
   verifies conservation and replaces the receipt again with `verified`.

The script does not retain an open receipt handle across replacement. Its
temporary write handle is closed in `finally`. `syncDirectory` is an explicit
Windows no-op and cannot retain a directory handle. Synthetic reproduction
without database activity proves the SQLite guard is not necessary to trigger
this failure; moving receipt update after database close is not an established
fix.

A receipt failure can follow a committed append. The published receipt can
remain `preflight_passed`, while the complete `.update` file remains beside it.
`readReceipt` rejects an existing receipt on the next invocation. The existing
idempotency test uses a new copy root with reconciled input; it does not prove
restart recovery on the same interrupted copy. Blindly rerunning the entire
append or removing the receipt is not an acceptable repair.

# Reproduction evidence

All ordinary invocations used `scripts/run-isolated-tests.mjs` with disposable,
content-free synthetic fixtures and serial execution. Initial reproduction:

```powershell
& .release-build/toolchains/node-v26.2.0-win-x64/node.exe scripts/run-isolated-tests.mjs --test-reporter=spec -- test/native-electron-collector-reconciliation.test.js
```

Temporary investigation tests were removed after use. Their exact sources,
the standalone diagnostic source and helper, and logs remain in the ignored
`.release-build/receipt-eperm-20261110/` directory. These local outputs are not
release artifacts. The small diagnostic binding was built separately; the
product native binary and manifest were not rebuilt by this investigation.

| Experiment | Observation |
| --- | --- |
| Original test file, unchanged during investigation | Four passed, zero failed |
| 20 repeated registrations with pre-rename security inspection | 80 tests passed; 80 receipt replacements succeeded |
| Another 20 registrations plus error-class probe | 77 replacements: 76 succeeded, one EPERM; a separate probe setup error caused the second failed test |
| Same run after fixing the probe's unsigned C# argument | 81 tests passed; 80 replacements succeeded |
| 30 registrations without pre-rename security inspection | 121 tests passed; 120 replacements succeeded |
| 30 registrations with separate asynchronous Win32 rename diagnostic | 121 tests: 120 passed, one failed; 117 replacements, one error 5 |
| File-only reproduction without SQLite | 400 replacements, five errors 5 |

Repeated registrations share an isolated process; these are not independent
process-start trials. The native diagnostic changes the rename implementation
in the test process only and is not a passing product regression gate. Neither
test counts nor rename latency constitute a refresh-performance benchmark.

The file-only matrix rotates scenario order across three rounds, with 300
replacements per scenario per round. Each write is flushed and its handle is
closed before replacement. The existing protected fixture helper creates the
parent directory. All target names and bytes are synthetic.

| Initial publication / update preparation | Round 1 failures | Round 2 failures | Round 3 failures | Total attempts |
| --- | ---: | ---: | ---: | ---: |
| Hard-link, unlink temporary name, chmod | 17 | 13 | 2 | 900 |
| Hard-link, unlink temporary name, no chmod | 11 | 11 | 8 | 900 |
| Direct creation, chmod | 0 | 0 | 0 | 900 |
| Direct creation, no chmod | 0 | 0 | 0 | 900 |
| Existing native owner-only fixture creation for both files | 0 | 0 | 0 | 900 |
| Target absent | 0 | 0 | 0 | 900 |

All 62 failures across 5,400 attempts had error 5, file attributes 32
(`FILE_ATTRIBUTE_ARCHIVE`, without READONLY), and successful source/target
DELETE-access opens immediately after the failed call. Restart Manager returned
no locking PID. That later snapshot does not prove no handle existed at the
failed instruction. The results isolate susceptibility to the hard-link
publication sequence in this experiment; zero observed failures in another
scenario is not proof of a universally safe replacement primitive.

# Controlled Windows refusal classes

The helper holds exact synthetic handles across both Node `renameSync` and a
separate `MoveFileExW` call. Each scenario was repeated three times.

| Controlled condition | Node result | Win32 result | Target DELETE open | After closing held handle |
| --- | --- | --- | --- | --- |
| No held handle | Success | Not needed | Success | Not applicable |
| Target read handle without DELETE sharing | EPERM | 5 | 32 | Replacement succeeds |
| Source read handle without DELETE sharing | EBUSY | 32 | Success | Replacement succeeds |
| Parent directory handle without DELETE sharing | Success | Not needed | Success | Not applicable |
| Readonly target | EPERM | 5 | Success | Not applicable |
| Read handle to deleted temporary hard-link alias, all sharing enabled | Success | Not needed | Success | Not applicable |
| Target read handle with READ, WRITE and DELETE sharing enabled | EPERM | 5 | Success | Replacement succeeds |

Thus a lingering handle to the deleted alias alone did not reproduce refusal.
An open target with full sharing did. Both observations matter: neither
"parent directory lock" nor "missing DELETE sharing" fully explains this case.
The spontaneous caller has not been tied to the controlled target handle.

# Independent Windows permission contract gap

The script uses POSIX-style mode arguments and `chmod`. Its directory/file
preflight skips mode checks on Windows and does not admit files through a
native DACL/identity guard. Inspection of generated receipt and update files
reported `ownerMatches: true`, `daclProtected: false`, `broadAccess: false`,
`nonOwnerAllow: true`, `isReparsePoint: false`, and a single link. These files
do not meet the current protected owner-only DACL contract. The same security
summary occurred on successful and failed replacements; this gap must not be
presented as the established EPERM cause.

# Repair boundary and remaining evidence

No repair was applied. A subsequent reviewed change should replace the
POSIX-only publication assumption using the existing Windows protected-state
boundary, with exclusive initial publication, authenticated expected state,
atomic replacement and bounded handling of transient refusal. It must also
define interrupted-append receipt recovery before claiming same-copy retry.
Do not enable general native policy flags, remove ACL/identity checks, unlink
the published receipt before replacement, retry a committed append blindly,
or add an unbounded sleep/retry loop.

Required validation includes a deliberately held target read handle, release
and bounded retry, persistent refusal preserving the prior receipt, target
replacement races, owner/DACL/link refusals, interruption after append and
before receipt update, and exact conservation after same-copy recovery.
Any persistent receipt-format change needs separate review.

The remaining attribution question requires a narrowly filtered observation
at the failing Windows operation. No system-wide filesystem trace was captured
because it would record unrelated private paths. No antivirus exclusion,
service change, administrator-mode workaround or live experiment was used.

Final cleanup removed all three temporary test entrypoints and restored normal
builtin bindings by ending their isolated processes. The original four tests
passed again; that pass does not resolve an intermittent refusal. Documentation
governance validated 336 Markdown files and 585 source/config files; root
workspace hygiene passed, and the preflight lane passed all 20 tests with no
failures or skips. With no pnpm executable available, these checks invoked the
existing script entrypoints directly using the fixed Node runtime; no package
manager or dependency was installed.
