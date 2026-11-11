# Local index golden views

`views.json` holds figures the shipping (v1) unified index produced at commit
`cf94e9a8` for one synthetic, content-free corpus: the companion report at two
clocks (with a declared-speed ledger), the work breakdown at the same clocks,
and the replay-safe calibration layer with and without the ledger.

`test/local-index-goldens.test.js` builds the successor store from the same
corpus. Unchanged Standard usage, timeline and cache-impact counts/coverage
remain exact against the frozen view. The five named speed-pricing fields are
checked separately against a per-event public-ledger oracle. New Terra crossing
entries must be exactly zero for this corpus before leaving the historical
projection; nonzero evidence is never silently omitted.

Cache-analysis token normalization, context evidence, conditional repricing and
basis identities changed after this fixture. Its explicitly enumerated pricing,
evidence and breakdown fields leave only the historical comparison. Every
current cache-impact field, including complete breakdown/recent-row digests, is
checked against the exact candidate reader and public per-event ledger instead
of the optimized query and memoized pricer. Both sides reuse scenario
classification; `test/cache-switch-impact.test.js` independently pins that
behavior with hand-calculated and negative fixtures. This does not reintroduce
the old analyzer or treat a modeled cache premium as verified subscription loss.
Unknown fields outside the named replacements and retained-total mutations
still fail; a negative test exercises that boundary.

Historical Standard calibration explicitly selects `standard_api` through the
public transition miner and summary entrypoints. Current composition stays
checked against the frozen fixture. Capacity v0.2, basis v5, selected-scenario
publication and timeline v2 use an explicit expected-metadata adaptation;
all other compared layer fields remain frozen. The old Fast scenario's
calibration is still reproduced through the public summary even though desktop
now publishes only its selected scenario. Desktop default calibration has a
separate full-view expected adaptation: Standard resolves unknown speed
only, preserves observed speed and returns insufficient evidence when observed
Ultrafast costs have no applicable price. It must not fall back to the historical
all-Standard estimate. No production policy or test-only hook is added.

The accepted 2026-10-27 project-membership change leaves this historical fixture
intact. Its Standard readback explicitly uses the original repository grouping;
the current full work-cell comparison uses Codex assignments and verified
source-header ancestry. Both keep the independent per-event pricing checks.
The original public synthetic salt is SHA-256 of
`tibotattle local index goldens`; this identity input must survive product
renaming. The test pins its bytes and the frozen fixture's SHA-256 independently.

Integers, strings and identities are exact within each declared comparison;
the numeric tolerance is binary-float rounding of money
(deviation N1 in the redesign plan). Large cache-impact breakdowns are held as
digests and compared in full against the current per-event pricing reference.

The [diagnosis](../../../docs/receipts/2026-11-11-historical-golden-diagnosis.md)
records the original failures and controlled counterfactuals; the
[repair receipt](../../../docs/receipts/2026-11-11-historical-golden-repair.md)
records the qualified test boundary. The frozen JSON was not rewritten.

The corpus parameters live in `test/helpers/local-index-goldens.js`. Nothing
here is derived from a real Codex home.

## Regenerating

There is no generator. The shipping (v1) implementation that produced these
views has been removed, and the successor is never a source for them. The
fixture is the specification: change it only when a documented, intended
difference in meaning is accepted, say why in the commit, and never regenerate
it from the successor.
