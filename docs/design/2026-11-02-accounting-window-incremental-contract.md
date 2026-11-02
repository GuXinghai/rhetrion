---
title: Accounting window receipts and incremental-refresh contract
date: 2026-11-02
type: design
status: proposed
---

# Status and claim boundary

This is a proposed design contract for the accounting derived cache. The
input-receipt, derived-row, exact accumulator-merge, rolling-fold, and
owner-only window-cache storage slices are implemented in source and
shadow-tested. A protected-copy rehearsal matched the shipping periods and
history exactly for one 251-day generation. The window cache is not wired to
readers and does not replace or accelerate the shipping accounting rebuild; the
refresh runner maintains an existing shadow cache but does not create the first
one inline. No reader, schema, migration, performance, installed-app, or release
claim is made. It follows the
[v11 impact-manifest plan](../plans/2026-11-01-local-index-impact-and-work-projections.md)
and the [local index schema](../reference/local-index-schema.md); the
[implementation plan](../plans/2026-11-02-accounting-window-incremental.md)
defines the rollout. It does not change source evidence, parser semantics,
ingestion, or the work projections.

The motivating observation is a live refresh on 2026-11-02 in which 4,268 of
4,273 index sources were skipped and only 5.45-8.43 MB was read, while the
accounting rebuild still took 302-345 seconds and the whole refresh took
596-647 seconds. Source ingestion and work projections were incremental; the
accounting cache was not.

# Problem

The current accounting reuse proof is global. Its key includes the global
`calculation_revision`, baseline windows clamped to the current usage range, and
an origin key covering every session. Any new event, new session, or range
extension changes the key, so every normal refresh falls through to a full
rebuild. A full rebuild is currently the default `else` path, not an explicit
operation.

That is the behavior this contract changes. The requirement is:

> Under normal fact changes and an unchanged basis/algorithm, no full rebuild
> may occur. A full rebuild is reachable only by a closed, explicit set of
> reasons. A missing or invalid proof marks the affected window unavailable and
> retains the last good result; it does not silently become a full rebuild.

# Definitions

- **Fact**: a committed accounting input row with a stable occurrence key and an
  event time. `usage_event` uses `(source_id, source_offset)`; quota and work
  facts use their existing source/offset-based primary keys.
- **Window**: a fixed, non-overlapping time partition of facts. The proposed
  default is a UTC day for accounting rows, with a boundary checkpoint carried
  into the next window. Finer buckets require a separate proof.
- **Receipt**: a content-free record proving which facts a window contains and
  which derived rows were produced from them.
- **Dirty window**: a window whose input receipt no longer matches the current
  facts. A dirty window is normal work, not a proof failure.
- **Proof failure**: a window cannot be mapped, read, validated, or reconciled
  against its receipt.
- **Full rebuild**: recomputation of the whole accounting artifact from facts.
- **Repair**: an explicit, receipt-backed operation that rebuilds a named window
  or range after a proof failure. Repair is not an automatic refresh fallback.

# Invariants

The incremental path is valid only while all of these hold.

| ID | Invariant |
|---|---|
| I1 | Every fact has a stable occurrence key and belongs to exactly one window. |
| I2 | Window derivation is deterministic: the same window facts, basis, and algorithm version produce the same canonical rows and digest. |
| I3 | A window depends only on its own facts and the checkpoint at the preceding boundary. No window depends on a global revision, all-session origin set, or unbounded history. |
| I4 | Every covered window has a valid input receipt; before a reader consumes it, it also has a derived-row output digest. |
| I5 | Digests are domain-separated, content-free, and computed with a local secret or equivalent non-reversible local key. No raw prompt, response, path, account identifier, or session content is stored. |
| I6 | A cache manifest is published atomically: readers see the previous complete manifest or the next complete manifest, never a partial merge. |
| I7 | Full rebuild has a closed reason enum; no `catch` block or missing receipt may invoke it implicitly. |
| I8 | Last-good windows remain readable when another window is unavailable; unavailable or partial states are explicit and are never converted to zero or inferred continuity. |

I1-I8 are mechanically checkable. I2 establishes determinism by construction;
I3 establishes locality; I4-I6 establish coverage and publication; I7-I8
establish the fallback policy. This is an engineering proof of cache
completeness and locality, not a formal proof of every accounting formula. The
formula results are protected by the equality audit in the plan.

# Receipt contract

A window receipt is conceptually:

```text
Current input receipt
window_key          fixed window identity, e.g. UTC day
lower_ms/upper_ms   exact bounds
fact_digest         digest of sorted committed inputs and joined dimensions
basis_fingerprint   price registry / policy / unknown-speed / parser basis
algorithm_version   receipt derivation version
commit_seq          publication fence
calculation_revision fact/dimension revision (also advances on lane commits)
fact_count          number of committed inputs assigned to the window
status              input
keyed               whether the digest used the local key
computed_at_ms      local computation time
receipt_digest      integrity digest over the receipt

Future derived-row proof
row_digest          digest of canonical derived rows
status              ready | unavailable
```

The current implementation produces input receipts for every covered window,
updates them from the durable impact manifest when every change is an ordinary
append with a bounded time range, builds keyed derived-row digests for named UTC
days, serializes the exact pre-finalize accumulator, and folds interior day rows
plus at most two recomputed edge fragments into 24h/7d/30d/all and history.
Unsafe change modes, lineage/coverage partitions, pruned manifests, or missing
ranges fall back to a full receipt scan. Declared speed-baseline coverage is
part of each window digest: extending a baseline that covers existing unknown
speed facts forces a full receipt scan but rebuilds only the windows whose
digest moved. The cache is persisted in owner-only collector state, but it is
not wired to readers and does not replace the shipping rebuild. The derived-row
`row_digest` is required before a reader consumes a window or an incremental
merge trusts it; it is not inferred from `fact_digest`.

The receipt never contains raw facts. The input digest includes the stable
occurrence key and only the fields that participate in accounting derivation.
The output digest is computed over canonical serialized rows, not over object
property order or formatting.

A receipt counts every committed row in its window, including rows whose token
components are all zero. Derived periods count only rows with a positive token
total, so period event counts can be lower than receipt usage counts. That
difference is explicit evidence, not a missing window, and it must not be
reported as full reconciliation.

A receipt is evidence, not authority over source facts. If a receipt is missing
or invalid, the window is dirty or unavailable; the source facts remain the
authority.

# Refresh algorithm

```text
1. Read the current index generation and a consistent fact snapshot.
2. Map facts to windows and verify I1 (every fact has exactly one window).
3. Derive candidate dirty windows:
   - primary: impact_partition accounting_window ranges since the last
     projected change;
   - defense in depth: per-window input receipts and fact counts.
4. Extend the dirty set by the bounded dependency closure:
   - the window itself;
   - the next boundary checkpoint window when a reset or transition is
     affected;
   - a suffix only when a checked checkpoint diverges. The suffix ends at the
     next reset boundary, not at the end of history, unless the basis changes.
5. Recompute only dirty windows.
6. Run preflight:
   - all facts mapped;
   - all covered windows have receipts;
   - receipt fact counts sum to the fact total;
   - basis and algorithm match;
   - row digests validate;
   - fold totals reconcile with fact totals.
7. If preflight passes, merge windows and publish a new manifest atomically.
8. If a window fails, mark only that window unavailable, retain the previous
   manifest and last-good windows, and enqueue an explicit repair. Do not run a
   full rebuild.
```

`impact_partition.accounting_window` is already recorded by the index refresh
with a lower and upper fact range. It is the primary dirty source; the per-window
receipt check is the completeness backstop.

# Normal changes

These are expected and must never invoke a full rebuild.

| Change | Dirty windows | Full rebuild |
|---|---|---|
| Append to an existing source | tail window | no |
| New source or new session | windows containing its usage | no |
| Late-arriving event | target window and next checkpoint | no |
| Source replacement / response reconciliation | that source's affected time range | no |
| Quota observation or origin update | windows containing the affected facts | no |
| Time advance with no new facts | rolling-window projection only | no |

A source replacement that spans every window of every source is a basis-scale
rewrite, not a normal change; it is handled by the explicit full-rebuild policy.

These rules describe the shipping accounting cache. The shadow implementation
may perform a full receipt scan for a source replacement, lineage, or coverage
change, but it still rebuilds only the day rows whose digest moved; it does not
replace or force a shipping full rebuild.

# Proof failures

A proof failure is one of:

- P1: a covered window has no receipt, or its receipt is malformed.
- P2: a fact cannot be mapped to exactly one window.
- P3: a recomputed window digest or fact count does not match its receipt.
- P4: a cross-window fold or boundary checkpoint does not reconcile.

On any P1-P4:

1. Mark the affected window or range `unavailable`.
2. Keep all unaffected windows and the last-good manifest readable.
3. Surface partial/unavailable state explicitly; never infer zero.
4. Enqueue an automatic bounded repair for the exact target, and expose a
   manual **Recalculate** entry for the same window.
5. Record a content-free diagnostic and increment a runtime counter.

P1-P4 must not call the full rebuild function. A repeated repair failure is an
alert and a release defect, not a reason to rebuild everything on every tick.

A manual **Recalculate** entry repairs in this order:

1. the affected window;
2. the related range or session range;
3. a full rebuild, only after an explicit confirmation that names the scope and
   the expected wait.

The automatic path never performs step 3. The manual path never hides which step
is running or silently escalates past a confirmation.

# Full-rebuild policy

Full rebuild is allowed only for:

| Reason | Trigger |
|---|---|
| `basis_changed` | price registry, policy, or unknown-speed basis changed |
| `algorithm_changed` | schema, parser, or cache algorithm version changed |
| `explicit_repair` | owner or recovery command targets a proven corrupt state, or confirms a full rebuild after window and range repair fail |
| `initial_build` | no prior valid artifact exists |

The enum is closed. `inputs_revision_changed`, `inputs_baselines_changed`,
`inputs_origins_changed`, and `inputs_changed` are not full-rebuild reasons;
they identify dirty windows. Adding a full-rebuild reason requires a contract
change, tests, and an owner decision.

A full rebuild is idempotent and receipt-backed. It must publish a new manifest
only after preflight passes. Existing last-good state remains untouched on
failure or cancellation.

# Calibration separation

The global composition/calibration fit is a model, not a per-event fact. It must
be separated from window freshness:

- `calibration` carries its own basis, algorithm, corpus range, computed time,
  and status.
- Window rows carry price-derived fields that depend only on the basis, and
  calibration-derived fields that depend on the model.
- A new event dirties its window; it does not refit the global model.
- A calibration refit re-folds calibration-derived fields; it does not re-read
  facts unless the basis or algorithm changed.
- Readers label calibration age (`calibrationAsOf`). A stale model is explicit,
  not a reason to rebuild all windows.

The refit cadence is a user setting with fixed options. The first set
is every 6 hours, every 12 hours, every 24 hours (default), every 3 days, and
every 7 days. A changed setting starts its next interval from the moment of the
change; it does not trigger an immediate refit. Price, policy, or plan changes
still calibrate immediately regardless of the setting. Normal refreshes must not
block on the calibration schedule.

# Reader semantics

- A reader may consume only windows with valid receipts under the current basis
  and algorithm.
- If a required window is unavailable, the aggregate is `partial` or
  `unavailable`; it must not drop the window silently or substitute zero.
- The reader shows the last-good value with an explicit age or partial label and
  a **Recalculate** entry. The entry escalates window → related range → full
  rebuild with confirmation; it never jumps straight to a full rebuild.
- Rolling 24h/7d/30d/all totals fold interior day rows plus at most two
  recomputed edge fragments; they do not rescan all facts.
- A stale calibration is shown with its timestamp; it is not presented as a
  current provider measurement.
- The previous complete manifest remains readable until a new manifest is
  published atomically.

# Enforcement

The contract is enforced by all of the following, not by convention:

1. **Preflight assertions** on every incremental publication.
2. **Shadow equality audit**: incremental result must equal a full rebuild for
   the same generation on synthetic data and a protected profile copy.
3. **Property tests** over append, late append, rewrite, shrink, new session,
   source replacement, boundary, restart, and cancellation sequences.
4. **Runtime counters** for dirty windows, recomputed windows, unavailable
   windows, receipt mismatches, and full rebuilds by reason.
5. **Release gate**: a full rebuild with a non-whitelisted reason fails the
   test/release gate. A normal-change sequence must produce zero full rebuilds.
6. **Closed schemas and fail-closed validation** for receipts and cache
   manifests.

# Limits and delegated decisions

- This contract does not prove the accounting formulas; it proves cache
  completeness and locality. Formula correctness remains covered by the
  incremental-versus-full audit.
- Input receipts are not sufficient for incremental cache merge. Derived-row
  output digests, windowed cache rows, persistence, and reader integration
  remain required.
- Window granularity and receipt storage location remain engineering decisions.
  Calibration cadence, reader stale policy, and repair UX are settled by the
  owner decisions recorded in the implementation plan.
- A global basis, parser, or schema change still requires a deliberate full
  rebuild. That is planned work, not a normal refresh fallback.
- A historical rewrite spanning all sources is outside the normal path and must
  be handled by an explicit rebuild or repair with its own evidence.
