---
title: Protected collector reconciliation publication and same-copy recovery
date: 2026-11-10
type: receipt
status: source-and-isolated-windows-validated
---

# Scope and result

Windows x64, Node.js 26.2.0, revision `71f1a2cb` plus preserved, previously
authorized uncommitted changes. The owner approved protected receipt publication
and interrupted-operation recovery after the
[EPERM investigation](2026-11-10-reconciliation-receipt-eperm-investigation.md).
This receipt qualifies source and isolated synthetic tests, not live data,
installed artifacts or release readiness.

The private-copy reconciliation script now uses the existing verified narrow
Windows release-operation capability for root-bound protected file creation and
expected-identity atomic replacement. It no longer hard-links a Node-created
temporary receipt or treats `chmod(0600)` as a Windows security boundary. The
native replacement's existing finite retries apply only to its uncommitted
rename; no JavaScript append retry, new native method or approval flag was added.

# Recovery contract

The existing `openOperation` journal and SQLite mutex are reused in the exact
private-copy root. Its existing format binds a digest of the root identity,
three database identities, source/baseline byte hashes, proof byte hash and
checkpoint digest before append. This supplies the missing restart binding
without changing the reconciliation v1 receipt, collector schema or persistent
cache format. Operation records contain the binding digest, not private paths,
source records or session content.

Explicit apply can resume that same bound operation. Read-only planning creates
neither operation journal nor receipt and refuses an already-started operation.
Every resume checks baseline containment and allows destination multiplicities
only between baseline and the exact union with source. Foreign records, removed
baseline records, changed checkpoint/metadata, changed inputs or substituted
database identities fail before further append. Partial batches append only
remaining multiplicities; a fully committed append does not reopen an append
session. A completed repeat verifies conservation and returns the operation's
original cumulative result, so repeated calls are not fresh inserted-row counts.

After all database sessions close and conservation succeeds, a protected
`.pending` receipt is created exclusively before expected-identity replacement
of the published receipt. Persistent refusal leaves the prior receipt and
pending value intact. Resume validates pending bytes against the bound input and
actual committed database. If replacement applied before the caller observed
success, resume verifies the published result and removes only the exact
authenticated pending identity. It does not replay database append.

The source and baseline copies are held against deletion/replacement for the
operation, and their whole-file hashes plus proof bytes are checked again before
completion. The existing operation mutex serializes cooperating calls and is
released by process death. It does not protect against a hostile same-owner
process bypassing that protocol. Atomic publication retains the existing
parent-directory power-loss durability limitation.

Legacy receipts lacking the matching source-bound journal remain preserved and
refused. Counts alone cannot authenticate their original source. No legacy
receipt, pending file, foreign operation or unsafe ACL is deleted or repaired to
force admission. Such copies require a separately reviewed recovery or a fresh
authorized set of stopped copies. Maintained instructions are in the
[local recovery runbook](../runbooks/local-index-recovery.md#explicit-collector-state-private-copy-reconciliation).

# Verification

All test invocations used `scripts/run-isolated-tests.mjs`, disposable synthetic
homes/state and content-free fixtures. Logs are ignored local files under
`.release-build/receipt-eperm-20261110/`. Counts below overlap and must not be
summed as independent unique coverage.

| Invocation | Result |
| --- | --- |
| `repair-exact-final.log`: exact reconciliation test file | 27 passed, zero failed/skipped |
| `repair-recovery.log`: reconciliation and existing release-operation tests | 25 passed, zero failed/skipped before the final additional refusal cases |
| `repair-final.log`: reconciliation, collector sessions and tool inventory | 36 passed, one inventory failure; the new static caller was subsequently declared |
| `repair-inventory.log`: exact tool inventory tests after declaring caller | Five passed, zero failed/skipped |
| `repair-native.log`: native filesystem security, loader and manifest | 49 passed, zero failed/skipped |
| Architecture | 414 production files, 1,472 imports, zero approved debt edges |
| Tool inventory checker | 87 records, 88 executable paths, 43 aliases; complete |
| `repair-preflight.log` and root workspace hygiene | 20 preflight tests passed, zero failed/skipped; root layout clean |

The exact reconciliation suite includes actual target read handles with finite
release and persistent refusal, preservation of prior/pending receipt, uncertain
post-replacement return, exclusive no-clobber first publication, true process
exit immediately after durable append, partial-batch restart and completed
same-copy retry. Negative cases include concurrent operation, source/baseline
byte changes, proof changes before/during append, destination identity change,
checkpoint mutation, unrelated rows, missing baseline rows, missing receipt,
unknown receipt/pending values, broad ACLs and hardlinks. Security assertions
check generated receipt, pending and operation files with the native inspector.

The native module was not rebuilt or changed by this repair. Its SHA-256 remains
`86f7b5c8e903c00fd9d63cf6b575e0834681b55a9e5dbf2017ff32f1ac5b1035`,
matching the previously prepared timing-recovery module. Global production/path
approval remains false. No dependency, service, new cache layer, timeout increase,
live profile/source access, candidate switch, installation, signing, push or
publication occurred. The investigation's spontaneous external holder remains
unattributed; the repair handles the demonstrated bounded-refusal mechanism
without claiming that an antivirus or particular process caused it.

Checks invoked the existing script entrypoints with the fixed Node runtime;
no package manager or dependency was installed. No full-root or live wall-time
claim is made from these scoped correctness runs.
