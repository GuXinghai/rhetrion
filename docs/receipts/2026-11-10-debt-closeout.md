---
title: Technical debt closeout and remaining gates
date: 2026-11-10
type: receipt
status: scoped-repairs-validated-with-open-gates
---

# Scope and result

Windows x64, Node.js 26.2.0, starting revision `71f1a2cb` plus preserved,
previously authorized uncommitted changes. This pass follows the
[targeted repairs](2026-11-10-targeted-debt-repairs.md). It closes confirmed
small defects and test-contract drift; it does not qualify the entire product.
No live profile/source access, refresh, candidate switch, installation, signing,
publication, schema conversion or persistent-cache-format change occurred.

The completed broad run reported 4,590 tests: 4,331 passed, 189 failed and
70 skipped, in approximately 26 minutes. It is an investigation inventory,
not a final frozen-tree gate: repairs happened during the run, and the hung
R7 filesystem test child was ended after its exact ownership was checked.
Other files continued. Subsequent exact-file invocations qualify the repaired
files separately; their counts must not be subtracted to manufacture a passing
root result. No failures or skips were suppressed.

# Repairs kept

- The timing store reuses an unchanged current-parser terminal `blocked` state
  after authenticating physical identity and the committed prefix, and verifying
  the held source again. Plain-source append no longer forces body parsing in
  that state. Cursor, snapshot, revisions and schema remain unchanged; unread
  bytes are not represented as consumed. Source replacement, truncation, prefix
  edits, parser upgrades and pending replay still use the existing bounded
  replay path. Both primary and supplemental parsers are covered across restart,
  cancellation, upgrade and staged source recovery. This applies to terminal
  excluded sources, not only API sources. Compressed-source work is unchanged.
- Fixtures for accounting impact, collector sessions, maintenance, timing
  experiments, weekly pace, privacy sidecars and audit output now create new
  disposable state through the existing protected Windows fixture helper.
  Existing unsafe sources are not repaired or granted permissions by tests.
  Permission refusal uses an actual synthetic broad DACL, not POSIX mode bits.
- The timing experiment closes its store before deleting its fixture. Its
  source-change assertion follows the existing staged-replay contract: retain
  committed rows during partial replay and replace them only at complete EOF.
- Exact inventories now include the existing Terra Priority cards/ratio,
  current v23 parser, existing accounting timer spans, facade consumers and
  runtime-closure test caller. Future-version rejection remains exact.
- Collector identity-failure injection now occurs while the collector lock is
  held, rather than being consumed by an earlier preparation stat. It proves
  refusal, release and a same-PID retry with exact large identities.
- The explainer comparison includes the existing calculation revision in the
  publication tuple. A calculation-only mutation changes that revision in both
  readers while retaining their ingestion commit and fingerprint. No public
  contract changed. Reporting-boundary checks inspect actual ESM imports rather
  than rejecting a mutation test's read-only implementation-source inspection.
- R7 sampler tests now fail when the sampler returns before starting the
  awaited callback, instead of waiting indefinitely. Production R7 identity
  checks, retained evidence, capabilities and generation remain untouched.

The attempted one-period-only work projection was rejected and removed. Full
and selected-period results had different thread lookup/family digests: thread
identity and short-name disambiguation currently depend on other periods.
Current all-period behavior and earlier source-path batching remain intact.
No completed-result cache, service, dependency or architectural layer was added.

# Verification

Ordinary runs used `scripts/run-isolated-tests.mjs`, synthetic homes and
content-free fixtures. Logs are ignored local outputs beneath
`.release-build/debt-closeout-20261110/`; they are not release evidence.
Overlapping invocations are not summed as unique coverage.

| Invocation / log | Result |
| --- | --- |
| `scoped-final.log`: 17 affected timing, collector, pricing, privacy, impact, boundary and tool-inventory files | 191 passed, zero failed; two pre-existing POSIX-only skips |
| `local-final.log`: complete local companion suite | 301 passed, zero failed/skipped |
| `final-fixtures-repaired.log`: pace, explainer, reporting and private-copy reconciliation | 26 passed, one failed; the remaining receipt-update defect is described below |
| `r7-windows-final.log`: R7 filesystem tests after the wait repair | Completes in under one second; one passed, 78 failed, zero skipped; underlying Windows identity incompatibility remains |
| `native-staging-final.log`: unchanged-source Electron staging and native filesystem tests | 27 passed, one failed, zero skipped; staging is deterministic, hot-journal recovery still fails |
| Architecture | Passed: 413 production files, 1465 imports, zero approved debt edges |
| Codex contract / tool inventory | Passed; 87 tool records, 88 executable paths, 43 aliases |
| Documentation / preflight / whitespace | Passed; 334 Markdown files validated, 20 preflight tests passed |

The terminal-source test exercises three unchanged/append observations per
parser, closing and reopening between them. Each reports zero body parser lines
and an identical source row, including after large appends. This proves removed
parsing work, not zero filesystem I/O or a live wall-time improvement. Concurrent
root validation is unsuitable for a performance baseline; no median refresh
speedup is claimed. Guarded work origins and snapshot computation remain.

# Open gates, ordered by consequence

| Priority / boundary | Reproduced evidence and next action |
| --- | --- |
| Runtime crash recovery | `windows-filesystem-security.test.js`: timing SQLite reopens normally, but a synthetic crash leaving a hot rollback journal causes `SQLITE_READONLY_ROLLBACK` during read-only identity admission. Writable recovery before schema/identity validation would violate the admission boundary. Design a guarded, current-format recovery proof and negative tests before changing that order. No live recovery was attempted. |
| Windows export / identity operations | Export identity reports `EXPORT_IDENTITY_WINDOWS_FILESYSTEM_POLICY_UNAVAILABLE`; bundle/set verification and paired storage fail at protected storage or publication admission. The general native production/path capability remains deliberately disabled. Separate native qualification from default-DACL fixture defects; do not flip policy flags or replace guards with JavaScript checks. |
| Explicit private-copy reconciliation | Protected initial fixtures now expose a later `EPERM` at `updateReceipt` in `scripts/reconcile-native-electron-collector-observations.mjs`. The append-only plan and refusal checks pass; completion/idempotent retry remains unqualified. Replace the old receipt publication sequence only with a reviewed atomic, no-clobber/expected-state contract. Do not run this against real copies until fixed. |
| Legacy report migration/publication | `local-legacy-report-storage.test.js` still reaches directory `fchmod` and no-follow requirements that fail on Windows. Use the accepted copy-first migration boundary and native publication owner, not permissive POSIX fallbacks. |
| Historical equivalence | Three `local-index-goldens.test.js` assertions remain red. Across both clocks: 485 report differences, 24 work digest differences and 50 calibration-layer differences. Reports include additive Terra entries, cache-impact fields and basis changes; calibration includes Standard versus speed-lower selection, two qualifying resets versus zero, and versioned projection differences. Token/event totals alone do not explain identity digests. Trace accepted changes individually; do not regenerate the frozen fixture or broadly omit changed fields. |
| R7 historical tooling | The old sampler admits only safe-integer file identities, which rejects this Windows filesystem's identities. The repaired tests expose that failure promptly. Its separate native qualification and retained readback are not ordinary regeneration work. The materialized harness also fails at collector source admission. |
| Remaining regression inventory | Candidate/process fixtures, localization placeholders/static-copy inventory, profile ownership, supplemental/predecessor workspace fixtures and export source-plan admission still need targeted attribution. The initial failures are not all product defects or all environment failures. Candidate/build fixture results do not qualify installed/live behavior. |

The initial run had failures in 42 files. Sixteen of those files subsequently
passed targeted reruns; the reconciliation fixture is only partly repaired.
There is no final all-root pass or precise frozen-tree residual failure count.
The broad run's Electron staging comparison overlapped source edits; its
unchanged-source rerun passes. The native hot-journal error reproduces in both.

# Follow-up boundary

Prioritize crash-safe timing admission, then resolve Windows export/migration
scope and historical golden equivalence. Lower-risk fixture and catalog repairs
can proceed independently. Avoid more timeout increases, new caches, disabling
work usage, dropping stale/unknown states, weakening origin or ACL checks, and
reintroducing account attribution. Every retained source repair can be reverted
independently without converting state. All native installed-artifact, live,
signing and release gates remain separate and unqualified by this receipt.
