---
title: Historical golden consistency diagnosis
date: 2026-11-11
type: receipt
status: diagnosis-complete-repairs-not-applied
---

# Scope and outcome

Follow-up correction recorded during the later repair on 2026-11-11: the zero
calibration counterfactual below applies to `weeklyCalibration`, not the full
layer. Each layer also has 12 accepted capacity/basis/scenario/timeline version
differences. The statements that every other layer field matched and that the
full calibration layer reached zero differences were too broad. See the
[repair receipt](2026-11-11-historical-golden-repair.md) for their explicit test
contracts and validation. The original diagnosis evidence below is preserved.

Windows x64, Node.js 26.2.0, branch
`refactor/local-index-v11-impact-projections`, revision `71f1a2cb` plus
preserved authorized uncommitted work. The owner authorized diagnosis only.
This follows the historical-equivalence gate in the
[debt closeout receipt](2026-11-10-debt-closeout.md).

All three failures in `test/local-index-goldens.test.js` were reproduced and
explained using the same content-free synthetic corpus. No unexplained
difference remains in these compared views after the explicit historical
counterfactuals below. This is scoped evidence, not a passing root suite or a
claim about live data, subscription billing or refresh performance.

Production code, the formal golden tests, frozen fixture, schemas, cache
formats, live profiles and candidates were not changed. Temporary investigation
code was removed from `test/`; only this receipt is retained as a new repository
deliverable. Existing unrelated work remains intact.

# Reproduction and evidence

Both ordinary invocations used `scripts/run-isolated-tests.mjs` and disposable
synthetic homes:

```powershell
& .release-build/toolchains/node-v26.2.0-win-x64/node.exe scripts/run-isolated-tests.mjs --test-reporter=spec -- test/local-index-goldens.test.js
& .release-build/toolchains/node-v26.2.0-win-x64/node.exe scripts/run-isolated-tests.mjs --test-reporter=spec -- test/cache-switch-impact.test.js
```

The unchanged golden test reported **3 passed, 3 failed, zero skipped**.
The cache-impact suite reported **44 passed, zero failed/skipped**. Tests were
not relaxed or regenerated. The two independent per-event speed-pricing checks
in the golden suite passed, covering report amounts/components and work cells.
Those checks reuse current identity assembly and therefore do not independently
prove historical identity continuity; the salt experiment supplies that proof.

The generated corpus digest matches the frozen corpus: 90 sessions and 9,545
committed usage/status facts, including 486 unknown-model facts and no Terra
facts. Its parameters remain the existing `GOLDEN_CORPUS`, two `GOLDEN_CLOCKS`
and `GOLDEN_LEDGER` in `test/helpers/local-index-goldens.js`.

| Compared view | Initial complete differences | Controlled historical result |
| --- | --- | --- |
| Reports, after-the-corpus | 237 | 0 |
| Reports, unaligned-inside | 248 | 0 |
| Standard work, each clock | 12 | 0 after restoring the original synthetic salt |
| Calibration, without ledger | 25 | 0 when the weekly summary explicitly uses `standard_api` |
| Calibration, with ledger | 25 | 0 when the weekly summary explicitly uses `standard_api` |

These are comparison-path counts, not events, money deltas or independent bugs.
The initial totals are 485 report, 24 work and 50 calibration differences.

# Work identities: a changed test input

Commit `15776b67` changed `pinGoldenSalt()` from SHA-256 of
`tibotattle local index goldens` to SHA-256 of
`usagemonitor local index goldens`. These are public synthetic constants, not
credentials. The frozen fixture was left unchanged. Every thread handle depends
on that salt; cell IDs, thread lookup and family digests consequently change.

Restoring only the original salt in the disposable corpus eliminates all 24
work differences across both clocks and all four periods. It needs no project
policy, account attribution or production identity change. Trying empty thread
relations did not resolve the failure with the changed salt. Forcing POSIX path
resolution was also unnecessary and introduced cell-digest differences after
the correct salt was restored. Preserve the qualified Windows path behavior.

# Reports: changed analyzer and catalog contracts

The complete report differences fall exclusively within these groups:

| Group | After-the-corpus | Unaligned-inside |
| --- | --- | --- |
| Terra speed/declared-speed crossing entries | 64 | 64 |
| Cache-switch impact | 83 | 76 |
| Cache-continuity impact | 90 | 108 |

All 64 new Terra cells per clock have zero events and zero API-equivalent cost;
the corpus contains no Terra usage. The remaining compared main-usage fields,
token/event totals, Standard prices and timeline views have no differences.

The cache-impact changes include real valuation differences, not just new
fields. Commit `79d3d907` selected canonical token components and removed the
duplicate combined-output alias when split output is available. Commit
`63e8753a` supplied full input-context evidence, changed the repricing scenario
to positive cache-read decreases and added explicit unverified-prefix evidence
and observation-unit counts. Commit `36755be1` advanced the allowance basis
identity from v4 to v5. Terra catalog support arrived in `1e8ea13b`.

For example, one 24-hour cache-switch comparison changes from unpriced to a
conditional premium of `0.523471725` API-equivalent USD. This is a modeled cache
scenario, not additional recorded consumption or verified subscription loss.
The current analyzer explicitly keeps `verifiedPremiumUsd` null.

A diagnostic-only copy of the `cf94e9a8` analyzer, fed the same current committed
candidate rows, reproduces both frozen reports exactly after removing the
zero Terra catalog entries and selecting the original v4 basis string **before**
the existing large-subtree digest projection. The copy adapts imports and uses
the exact current parser label for boundary admission; it performs no database
writes. Candidate counts are 1,071 and 951, with zero ordering-gap sentinels.
This is a cause-isolation experiment, not a proposed production compatibility
layer. The large breakdown hashes need no independent numeric explanation once
the complete historical view has zero differences.

The current 44-test cache-impact suite independently covers deduplicated output,
missing/conflicting evidence, exact repricing, long-context boundaries and
unverified reusable prefixes. This supports the changed analyzer contract;
restoring its old unpriced behavior would undo existing fixes.

# Calibration: historical Standard versus the desktop policy

The accepted [desktop calculation decision](../decisions/2026-10-28-desktop-calculation-and-unknown-speed.md)
preserves observed speeds and timestamped declarations. The default Standard
setting resolves only unknown speeds. It therefore selects `speed_lower`,
not the all-Standard `standard_api` research basis frozen by the old test.

`buildCalibrationLayer()` now follows that desktop default. Of the 3,586 mined
transitions, 130 pass the basic weekly eligibility filter. The selected Pro
population has 68 such transitions across four resets; only four have finite
speed-lower costs at both endpoints. Their finite-next counts by reset are
3, 0, 0 and 1, below `fitReset()`'s minimum eight unique boundaries even with
an initial anchor. No qualifying speed-lower reset remains.

The corpus has 2,569 observed Ultrafast facts, all without an applicable
event-time Ultrafast price in the reviewed registry. The accounting projection
retains unknown scenario costs; `aggregateCumulativeScenarioField()` returns
null for an interval containing an unknown rather than silently adding zero.
`uniquePoints()` excludes those non-finite boundaries. This explains the
`estimated` to `insufficient_evidence` transition and two to zero qualifying
resets. It is not evidence of a broken token total or permission error.

On the exact same current dataset and composition,
`projectBoundedWeeklyCalibrationSummary(..., { forcedCandidateId: "standard_api" })`
matches the frozen weekly summary with zero differences for both ledger cases.
Every other compared calibration-layer field already matches. Do not restore
an estimate by mixing Standard capacity with the speed-aware numerator.

# Recommended smallest repairs, not applied

1. Restore the original public synthetic salt string in `pinGoldenSalt()`.
   Keep the frozen fixture byte-identical; assert that the pinned test input
   remains stable. No production salt, identity or schema operation is needed.
2. Separate historical Standard calibration reproduction from the desktop
   default-policy assertion using the existing public calculation boundaries.
   Keep a dedicated assertion that unsupported observed Ultrafast evidence
   remains unavailable under the default. Do not duplicate the research engine
   or introduce a production option solely to satisfy this test.
3. Review a field-specific report test contract: retain exact historical checks
   for unchanged usage/timeline fields; check the new zero catalog cells and
   versioned cache-impact behavior explicitly with independent expected values.
   The fixture README's claim that all Standard report/calibration views still
   match is no longer accurate and must be updated with that test repair.
   Do not broadly drop cache-impact fields or copy current outputs into a new
   golden. The historical analyzer copy is diagnostic only and should not become
   a second maintained production/test algorithm.

No business-logic repair is established by this investigation. The formal three
failures remain open pending the owner-authorized test-contract repair and rerun.
No root-wide, packaged, installed or live gate is claimed.

# Local reproducibility and fixture integrity

Ignored investigation files are retained in
`.release-build/golden-diagnosis-20261111/`: the original failing log,
`complete-diagnosis.log`, `cache-impact-tests.log`, `observations.json`,
the temporary investigation harness backup and its diagnostic module copies.
They contain synthetic counts, fields and calculation summaries only.
To repeat the counterfactuals, temporarily copy the harness backup to its
original `test/local-index-golden-investigation.test.js` location and run it
through the same isolated runner; remove that temporary file afterward.
The backup is local reproduction material, not a maintained test or release
artifact. The report/calibration adapters copy source into the ignored directory
and never modify the source modules they inspect.

The frozen `test/fixtures/local-index-goldens/views.json` remains byte-identical:
SHA-256 `C1C98D993313DD391C7CADD01AF200FEAA5A5CC47A401F1B39F473A29FB33CDD`.

Documentation validation passed across 339 Markdown files, preflight passed all
20 tests, root workspace hygiene passed, and `git diff --check` passed. The
existing package scripts were executed directly with the pinned Node binary
because `pnpm` was unavailable on PATH; no package manager was installed.
