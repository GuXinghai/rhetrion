---
title: Remaining regression closeout and source acquisition classification
date: 2026-11-11
type: receipt
status: isolated-regressions-passed
---

# Scope and evidence boundary

Windows x64, Node 26.2.0, revision `71f1a2cb` plus the preserved authorized
working tree. This follows the collector identity repair and closes the remaining
regression inventory. Ordinary validation uses synthetic isolated homes/state.
No live profile/session/credential access, candidate activation, installation,
signing, publication, schema conversion or cache-format change is performed.
Source, native development binding, rendered fragments and final packaged/live
qualification remain distinct gates.

# Changes and causes

- Candidate preflight was sending an unmarked model-performance request; the
  expected 403 was mistaken for a report without status. The test now sends the
  reviewed local header and checks HTTP status. Its project fixture also relied
  on Git determining membership. Both the candidate seeder and integration
  fixture now create explicit, content-free Codex project assignments. Restart
  ingestion and saved task labels remain checked. The private companion test
  checks the current closed remote-proxy/upload capabilities instead of removed
  cloud-field names.
- X import setup moved into its setup/registration owners. The ownership test
  still inspected the old source layout; the catalog additionally omitted the
  current setup receipt and intent. Source parity now covers actual assets and
  both controls, with external registration/security/copy gates still blocked.
- Prospective CLI fixtures used unprotected output/state parents and removed
  Windows runtime environment requirements. Protected synthetic directories and
  the isolated child environment restore reachability; actual Windows DACLs
  replace meaningless Windows POSIX-mode assertions. Production CLI semantics
  are unchanged.
- Localization retains the warning matcher's two explicitly pinned English
  grammar slots while requiring both numeric counts in every locale. The old
  contribution-plural check now exercises an active quota-window plural instead.
  Component-price and update-action text are translated through canonical keys;
  HTML fallbacks match current catalog copy. Ten physical-direction declarations
  now use logical direction. Browser and Electron mirrors use their generators.
- Direct materialized R7 evidence generation remained executable despite receipt
  retirement. The harness/worker now refuse before option or fixture access. The
  orphaned filesystem sampler and its obsolete execution tests are removed.
  Active producer/verifier ceilings remain covered by their owning resource
  tests. Frozen R7 schemas/receipts are untouched; no replacement evidence is
  generated. New negative tests pin direct/worker refusal and content-free output.
- Exact export facade, classified-tool caller and Windows platform-branch
  inventories now include the previously accepted identity helper and current
  tests. Counts are updated to actual reviewed branches; no skip is added.

# First complete run and native investigation

`closeout-root-first.log` reports 4,687 tests: 4,611 passed, seven failed,
69 skipped, zero cancelled, in 1,601 seconds. No agent source edits were made
during that run. Three failures were the exact inventories above. Four shadow-cache cases
failed at native main-file acquisition with `WINDOWS_FILESYSTEM_ACCESS_DENIED`,
before tamper/basis validation. The owning file then passed 10/10, its accounting
neighbors passed 41/41, and a temporary 32-iteration publication/immediate-read
experiment passed. The temporary test was removed; its source/log are retained
only in ignored local build scratch.

The old native category combined actual access denial, sharing conflict, byte
lock conflict and write protection. The exact underlying Win32 causes of those
four historical failures were not retained and cannot be reconstructed from that
category. Do not claim they prove a cache-validation defect or an ACL problem.
The binding now keeps OS classification internally and returns only fixed
`WINDOWS_FILESYSTEM_SOURCE_BUSY` for source acquisition sharing/lock conflicts.
Other operations and real access refusals retain their contracts. Deterministic
synthetic peers holding DELETE access on the file and an ancestor prove refusal,
successful acquisition after release, unchanged bytes and unchanged protected
DACLs. There is no fallback, retry, sharing relaxation or timeout increase.

The development binding was rebuilt with the existing Windows x64 build
configuration and its Node-26.2.0 headers; the adjacent manifest was regenerated
with pinned Node. Global production/path-walk policy remains disabled. This is
not installed-artifact or release qualification.

The second root invocation (`root-final.log`) was stopped after it exposed one
missed compatibility mapping: the legacy-report migrator correctly refused an
existing writer, but categorized the new `SOURCE_BUSY` as `unsafe_source`
instead of its established `source_changed`. The sole exact-code consumer now
maps that contention into the existing refusal state; neither migration nor
source changes are allowed. The owning migration and contention checks pass.
All four earlier shadow cases passed during that second invocation. Its
pre/post 1,500-file digest (including the native binding/manifest, excluding only
this completion record and its plan) matched; it remains an interrupted failing
investigation run, not a complete passing root gate. The final invocation is
recorded separately as `root-clean.log`.

# Validation

Ignored logs beneath `.release-build/` use the `closeout-` prefix. Overlapping
invocations are not summed into unique coverage, and earlier failures are not
rewritten as passing runs.

| Invocation | Result |
| --- | --- |
| `process-second.log`: normal candidate / private companion | 58 passed, zero failed/skipped |
| `profile-cli.log`: ownership and both prospective CLI entrypoints | 52 passed, one existing POSIX-only skip |
| `localization-final.log`: localization and warning contracts | 14 passed, zero failed/skipped |
| `r7.log`: retirement/readback and current resource boundaries | 90 passed, two existing Windows watchdog qualification skips |
| `inventories-final.log`: public facade, tool callers, Windows ledger, generated desktop copy | 11 passed, zero failed/skipped |
| `source-contention-final.log`: native competing file/ancestor handles | Three passed, zero failed/skipped |
| `native-regression.log`: binding contracts/loader/manifest, native security, protected SQLite | 60 passed, zero failed/skipped |
| `legacy-classification-final.log`: migration refusal and native contention | 24 passed, zero failed/skipped |
| `local.log`: complete local companion suite | 301 passed, zero failed/skipped |
| `electron.log`: first Electron suite before mirror digest synchronization | 588 passed, one generated-copy failure, three existing skips; owning copy test corrected in the inventory invocation |
| `root-clean.log`: complete final root suite | 4,690 tests: 4,621 passed, zero failed/cancelled/todo, 69 existing skips; 1,480.110 seconds |
| `electron-final.log`: complete final Electron source suite | 592 tests: 589 passed, zero failed/cancelled/todo, three existing skips; 33.675 seconds |
| `local-final.log`: complete final local companion suite | 301 passed, zero failed/cancelled/skipped/todo; 51.525 seconds |
| `quota-package-final.log`: four independent quota-analysis package files | 45 passed, zero failed/cancelled/skipped/todo |
| Exact accounting package file (`money-mixture.test.js`, isolated runner) | Four passed, zero failed/cancelled/skipped/todo |
| Architecture / tool inventory | Passed: 413 production files, 1,465 imports, zero approved debt edges; 87 tool records, 88 executable paths, 43 aliases |
| Codex contract / Codex browser mirror / browser and Electron i18n mirrors / export contract | Passed; export contract current with 156 fields and current compatibility |
| `preflight-final.log` / `hygiene-final.log`: documentation, whitespace, agent guidance and root layout | Passed; 20 preflight tests passed, zero failed/skipped; completed plan removed and surviving documentation links checked |

The final root process exited zero. The complete root suite includes the browser
test directory; it is not only a selected-file run. The root and surface runs
were sequential. The 1,500-entry checkout/native digest before root, after root,
and after both surface runs is identical:
`be0eea698aa1f03ee3a44d9253a9a13ccf03bea622a12e60598235a23b0cbda7`.
It covers tracked/nonignored checkout entries plus the development native binary
and adjacent manifest, excluding only this record and its completed plan. It
does not identify a packaged or installed artifact. No R7 schema/receipt bytes
changed. The four earlier shadow-cache cases all pass in this final root run;
the historical native error's lost OS classification remains unrecoverable.

No skips were added to obtain these results. Existing skips include POSIX-only
checks, unavailable filesystem-production policy and explicit native/usage-freeze
or watchdog qualification. They remain unqualified boundaries, not passing
coverage. Zero observed regression failures does not establish absence of every
possible defect.

Isolated Electron 43.8.4 source-fragment rendering used only synthetic labels and
values, loopback assets and a disposable profile. English, Simplified Chinese and
Spanish at widths 1,280 and 430 showed translated new copy and no horizontal
overflow; Chinese and Spanish captures were visually inspected. Logical text
alignment was checked under RTL direction. This is source-fragment rendering,
not a packaged full-dashboard or live-account test.

# Recovery and remaining qualification

These changes do not convert durable state. Rollback is a focused source/test/doc
revert; preserve existing/new-format data and historical R7 bytes. Do not restore
retired generation or broaden native policy as a validation shortcut. The known
remaining regression inventory is closed by the final unchanged-tree runs above.
Native credential/usage-freeze qualification, fresh packaged full-dashboard
inspection, installed-app behavior, live refresh and release qualification remain
separate and were not performed. The active desktop/profile is unchanged. Final
documentation and workspace checks are recorded in the validation table.
