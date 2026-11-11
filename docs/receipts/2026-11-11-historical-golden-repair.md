---
title: Historical golden test contract repair
date: 2026-11-11
type: receipt
status: source-tests-validated
---

# Scope and acceptance

Owner authorized the repairs identified by the
[historical golden diagnosis](2026-11-11-historical-golden-diagnosis.md).
Starting revision: `71f1a2cb` plus preserved authorized uncommitted work,
Windows x64 and Node.js 26.2.0. This change owns only golden test code, its
existing helpers and documentation. Production algorithms, live state,
schemas, cache formats, candidates and the frozen `views.json` are out of scope.

1. Restore and pin the original public synthetic salt input.
2. Keep exact frozen comparisons for unchanged report and calibration fields;
   check zero Terra additions explicitly. Compare current cache impacts in full
   against the public per-event ledger and exact candidate-row reader.
3. Reproduce historical Standard calibration through the existing public miner
   and summary entrypoints. Assert the desktop default independently, preserving
   unsupported observed Ultrafast evidence as unavailable.
4. Run the exact golden file, focused pricing/calibration/candidate-reader gates,
   documentation, preflight and architecture checks. Preserve the fixture hash.

No current-output fixture regeneration, copied historical analyzer, new
production seam or weakened comparator is permitted. The main risk is hiding a
future change behind a projection; unknown fields and retained totals must
continue to fail the frozen comparison. Rollback is a focused test/doc revert
and needs no data or schema operation.

# Implemented boundary

- `test/helpers/local-index-goldens.js` again derives the public synthetic salt
  from its original pre-rename text. The test pins the resulting 32 bytes and
  the fixture SHA-256 separately, so renaming cannot silently change identities
  or regenerate expected results.
- Historical report comparisons retain unchanged usage, timeline, cache-drop
  counts, token amounts, coverage and metadata. The five additive speed fields
  retain their existing per-event checks. Terra cells must be exactly zero
  before leaving this corpus's historical view.
- The report test enumerates the post-v1 cache-analysis fields whose meaning
  changed. Every current cache-impact field and full large-breakdown/recent-row
  digest is compared against the exact candidate reader and public per-event
  ledger, bypassing the optimized query and memoized pricer. Scenario
  classification is shared deliberately; the 44 manual/negative cache-impact
  tests supply its independent semantic checks. No full cache impact is removed
  from validation and no legacy analyzer is retained in the test suite.
- The public cooperative miner derives weekly transitions from the same opened
  corpus before the desktop build closes it. This fixed resident test input is
  capped at 10,000 usage rows. Public summaries explicitly reproduce historical
  all-Standard and Fast results; current composition still compares against the
  historical fixture. Desktop default remains a separate assertion requiring
  `speed_lower`, unavailable observed-speed bounds, no estimate and zero
  qualifying resets for this corpus, with and without the declaration ledger.
  Its full weekly summary also compares against an explicit expected-policy
  adaptation, retaining all other fields and rejecting unknown additions.
- Capacity schema v0.2, basis v5, selected-scenario-only publication and timeline
  schema/encoding v2 are explicit literals in the expected layer adaptation.
  Other fields still compare exactly. Unknown fields or future version changes
  in the actual layer are not normalized away. No production schema/version was
  changed by this repair.
- Negative report checks prove that new root/period fields, changed retained
  counts and nonzero Terra evidence fail the historical comparison. The
  fixture README and current status now describe the actual comparison gates.

# Correction to the diagnosis

The earlier receipt's zero calibration counterfactual covered only
`weeklyCalibration`. The repair exposed the omitted remainder when the test
advanced past that first assertion. Each 25-path layer difference comprises
13 weekly policy differences and 12 metadata/scenario/version differences.
The latter all follow commit `36755be1` and the accepted
[desktop calculation decision](../decisions/2026-10-28-desktop-calculation-and-unknown-speed.md):
capacity v0.2 and basis v5, the explicit selected policy and plan-scope basis,
removal of the inactive Fast publication, and timeline schema/encoding v2.
The diagnosis now has a follow-up correction pointing here; its original
measurements were not rewritten to imply later evidence.

The new contract checks every one of those changes explicitly. The inactive
historical Fast calibration remains reproduced and checked separately. The
Standard weekly summary, composition, selected allowance calibration, five-hour
calibration, input counts and remaining timeline fields match their frozen
values. No new calculation defect was found.

# Validation

All runs used Windows x64 and the pinned Node.js 26.2.0 binary through
`scripts/run-isolated-tests.mjs`, with synthetic homes/state. The earlier
baseline was 3 passed and 3 failed; final results are:

| Gate | Result |
| --- | --- |
| `test/local-index-goldens.test.js` | 10 passed, zero failed/skipped |
| Cache impact, weekly calibration, unknown-speed policy, exact/materialized candidate pairing and identity preservation: five exact test files | 86 passed, zero failed/skipped |
| Architecture | Passed: 414 production files, 1,470 imports, zero approved debt edges |
| Documentation / preflight / root workspace / whitespace | Passed: 340 Markdown files, 20 preflight tests, clean root hygiene and `git diff --check` |

Logs are ignored local outputs beneath
`.release-build/golden-diagnosis-20261111/`, named `repair-goldens.log`,
`repair-focused.log` and `repair-architecture.log`. These are source-test
receipts, not release or performance evidence. The test comparator's exactness
and float tolerance are unchanged. No assertion, skip, timeout or platform
boundary in the existing focused suites was relaxed.
The package-script implementations ran directly through the pinned Node binary
because `pnpm` was absent from PATH. No package manager or dependency was installed.

The frozen `test/fixtures/local-index-goldens/views.json` remains byte-identical:
SHA-256 `C1C98D993313DD391C7CADD01AF200FEAA5A5CC47A401F1B39F473A29FB33CDD`.

No full-root, packaged, installed or live qualification is claimed. No real
profile/source was accessed, no candidate was switched, and no signing,
installation, remote write, commit or publication occurred.
