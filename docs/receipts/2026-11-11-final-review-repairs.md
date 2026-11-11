---
title: Final main-logic review repairs
date: 2026-11-11
type: receipt
status: isolated-regressions-passed
---

# Scope

Windows x64, Node 26.2.0, revision `71f1a2cb` plus the preserved working tree.
This closes the four confirmed findings from the final main-logic review.
All mutation/recovery tests use synthetic disposable isolated state. No live
profile, session, credential, installed app or release state is changed.

# Repairs and invariants

Export/discard storage no longer unlinks an inventory or control pathname after
releasing the evidence handle. The optional native `deleteExactFile` checks
exact journal Node-stat U64 identifiers, size and streaming SHA-256 on its held
target before marking that object for deletion. It denies target write/delete
sharing and holds parents without delete sharing. A two-link discard step must
prove distinct canonical names in the same protected parent and the same native
128-bit identity; all ordinary readers retain their single-link rule. Hashing
uses an ephemeral silent context with no credential/key container. Missing
native support refuses cleanup. General production/path-walk flags stay false.
The binding and adjacent manifest were rebuilt together with the existing
Windows x64 build configuration and cached pinned-runtime headers.

Regression cases replace the canonical or quarantine object after the final
JavaScript check, or modify bytes on the same object. Deletion refuses, preserves
the changed object and does not create a successful completion receipt. The
existing interruption, recovery, control and SIGKILL cases remain exercised.
Discard controls previously used POSIX chmod, which cannot establish a protected
Windows DACL; controls and receipts now use the existing native exclusive creator.
Synthetic SQLite sidecars used by deletion tests obey the same DACL contract.
An identity-injection test no longer expects a fabricated Node stat identity to
authorize native deletion; it verifies that native independent proof refuses it.

The production snapshot builder forwards `previousWorkloadScope`. A real quota
history exception supplies no internal history context, so the reader retains
only the same known account/plan's already confirmed comparison, with its old
start, endpoints, capacity and date. It labels the result stale and does not join
a new single observation. Unknown or intersecting usage gaps withhold expected
consumption, including exact gaps outside the display lookback during a 21-day
process. A gap after the old confirmed span does not erase that span. Changed
or unknown account/plan cannot inherit it; successful history replay reselects
the final epoch after an intervening account switch.

Stable explicit API evidence can supersede that exact source's old gap only
with original same-physical-identity provenance and no later replacement. Both
new retirement and already-retired rows are covered. Existing `superseded` means
excluded from subscription coverage, never recovered missing usage. Gap/change
rows remain retained; the coverage impact publishes atomically. Subscription,
unknown, absent, replaced or unproved sources keep their gaps open. Repeated
refresh, API append and fresh-process restart remain no-ops after settlement.
No schema, durable cache/journal format or migration behavior is changed.

# Validation

Final validation is recorded here after the source freeze. Earlier repair-stage
failures are investigation evidence, not passing gates. Logs are ignored local
artifacts under `.release-build/final-review-*`.

| Invocation | Result |
| --- | --- |
| `storage.log`: both complete deletion/discard files, exact deletion, loader, native contract and Windows security | 104 passed, zero failed/skipped; 267.594 seconds |
| `contracts-fixed.log`: export owner/identity/schema boundaries, native manifest/state/contention, API gap and lineage recovery | 84 passed, zero failed/skipped; 19.093 seconds |
| `workload.log`: account connection, workload reader/analyzer, browser workload, exact deletion including unsafe DACL | 155 passed, zero failed/skipped; 11.786 seconds |
| `adapter.log`: optional native method/refusal and API inventory | 24 passed, zero failed/skipped |
| `local.log`: complete local companion suite | 302 passed, zero failed/skipped; 83.234 seconds |
| `local-final.log`: complete local suite after final source freeze and root completion | 302 passed, zero failed/skipped; 41.404 seconds |
| `electron.log`: complete Electron source suite | 589 passed, zero failed, three existing skips; 39.166 seconds |
| `root.log`: complete root suite, including browser tests | 4,723 tests: 4,654 passed, zero failed/cancelled/todo, 69 existing skips; 2,020.780 seconds |
| `preflight-final.log`: guidance/documentation/layout | 20 passed, zero failed/skipped |
| `preflight-complete.log`: final receipt and completed-plan removal | 20 passed, zero failed/skipped; documentation and workspace hygiene passed |
| Architecture / documentation / tool inventory / export contract / Codex contract / generated mirrors | Passed; 413 production files, 1,467 imports, zero debt edges; export compatibility current |

These invocations overlap in coverage and are not summed as unique tests.
The complete root process exited zero. No skips were added to obtain green
results. The code/native snapshot before and after the complete root run has
1,503 entries with SHA-256
`0984308f3be41c77cfb8521d120d4dcec70d507575e72c8765e2da993607d078`.
It excludes only this receipt and its completion plan, and includes the ignored
development native binary and adjacent manifest. A matching digest does not
identify an installed or packaged artifact.
The same digest was verified again after the final local suite. The completed
plan was removed after checking inbound references. No staging, commit or push
was performed.

During implementation, the first storage run exposed inherited DACLs on controls
and synthetic sidecars plus unnormalized native refusal codes; those paths were
corrected without weakening assertions or ACL validation. A long-running quota
failure test first reproduced an exact gap outside the lookback, then passed
after the complete retained comparison span was checked. Initial render setup
used the wrong localization callback; correcting the isolated harness enabled
the actual renderer. Those earlier invocations are not passing evidence.

Isolated Electron 43.8.4 rendered the current workload component at 1,280 and
430 CSS pixels, showing retained old-date consumption and a missing expected
value as a dash. No horizontal overflow was detected; wide stale and narrow
gap captures were visually inspected. This is component/source rendering, not
a fresh full packaged dashboard or installed-app qualification.

# Remaining gates and rollback

Packaged full-dashboard, installed behavior, native credential qualification,
normal live refresh and release qualification were not performed. No claim of
all possible defects being absent follows from regression success. Rollback is
a focused source/native pair revert preserving state; never downgrade durable
formats, discard unknown gaps or restore a path-unlink fallback as recovery.
