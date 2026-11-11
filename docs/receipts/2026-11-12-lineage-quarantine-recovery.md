---
title: Lineage quarantine recovery and diagnostic separation
date: 2026-11-12
type: receipt
status: verified-source
---

# Evidence boundary

Point-in-time investigation on Windows x64, checkout
`28d31c5856e87e284b25e580194cbae7ca06a3f1` plus the architecture-cleanup and
diagnostic working diff. Live observations belong to unsigned local candidate
`2026111201`; the diagnostic additions below have not been packaged or activated.
The maintained [index reference](../reference/local-index-schema.md) owns the
diagnostic vocabulary and recovery contract.

## Recovered quarantine

A historical `codex_rollout_lineage_invalid` gap removed two usage records.
The same physical source was naturally reparsed at
`2026-11-11T15:54:15.829Z`; its facts were restored and the gap marked repaired.
The recovery preserved physical identity and the original 86,832-byte extent.
Read-only investigation found a unique present parent and a valid newline and
ordinal cutoff. The earlier boolean validator could convert a changing or
unreadable dependency into invalid lineage. Its generic historical receipt
cannot identify which transient branch occurred. Current discovery refuses
those passes and retries within the existing bound before a writer can remove
child facts.

The live workload snapshot generated at `2026-11-11T18:28:59.237Z` had no
integrity-gap error. For November 8 it retained 8 percentage points of observed
consumption: 0.804257 light, 1.370250 medium, 0.776727 heavy and 5.048766
unclassified. `work_boundary_incomplete` remained; `quota_read_failed` was a
separate current quota-read error, not proof of another historical quarantine.

## Remaining missing evidence

Read-only index grouping found eight recent task keys with starts and no
indexed terminal. Bounded native held-handle inspection checked all eight
origin files, four plain and four compressed, in memory. Each indexed start
matched its source offset and timestamp; none had a subsequent supported
terminal for that task. All eight file states were stable around inspection.
Three had later independent task starts; five had none. These observations
support missing source boundaries, rather than a demonstrated parser omission.
They do not establish an ending in another omitted source or authorize an
inactivity-based completion. No private records were copied into fixtures or
saved diagnostic artifacts, and no live refresh or profile write was requested.

## Source changes and validation

Discovery emits 20 fixed structural/I/O subcodes through the existing
process-local refresh diagnostic list. Durable quarantine enums, schemas,
cache formats, fingerprints and parser versions are unchanged. Shared rejected
cutoffs retain their specific cause within the pass. Observer failures do not
affect decisions. Cleanup failures preserve pending cancellation/resource
errors instead of replacing them with a source-change retry.

Synthetic isolated checks cover stable rejection, shared parents, graph cycles,
retry, restoration, replay, cancellation, resource limits, observer isolation
and privacy. The first combined cutoff/recovery/timing/workload run passed
180 tests. The expanded provider/recovery run passed 128 tests with one
pre-existing Windows path-replacement skip; it does not qualify that deferred
handle-identity gate. Architecture checking passed with 413 production files,
1,494 imports and zero approved debt edges. After the final cutoff assertions,
the cutoff-only run passed all 61 tests. Root workspace hygiene and preflight
passed, including 20 documentation/governance/guidance tests.
