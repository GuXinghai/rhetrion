---
title: Refresh and workload recovery repair
date: 2026-11-10
type: plan
status: source-validated-broad-gate-failed
---

# Scope

The owner requested complete repair after the
[read-only diagnosis](../receipts/2026-11-10-live-refresh-workload-diagnosis.md).
Starting checkout is `71f1a2cb` with the previously authorized, uncommitted
work-source-path batching change and its evidence; preserve that work.
Implement repairs in existing owners, without a new service, persistent cache,
database schema or migration. Keep all origin/source security, accounting,
generation, cancellation and unknown-evidence boundaries.

# Acceptance and sequence

1. Distinguish changing/unreadable history dependencies from a stable invalid
   cutoff. Refuse/retry discovery with the existing cancellation/deadline and
   a finite attempt bound; never commit a false lineage quarantine.
2. After fresh complete discovery proof, retry previously discovery-rejected
   lineage sources without touching their bytes. Extraction failures still
   require their own validation. A stable invalid dependency stays refused.
3. Only a complete authenticated source replay may repair its existing gaps,
   atomically with facts/cursor/impact publication. Preserve failed, partial,
   cancelled, absent and identity-replaced gaps. Repaired old facts must not
   double count after retry/restart. Include existing gaps whose source is
   already admitted, so a prior replay cannot leave them open forever.
4. Keep gap effects explicit in the workload analyzer. Bound effects only
   where source/fact-domain evidence actually bounds them; null/legacy bounds
   remain conservative. Independent complete windows can remain usable.
5. Following the owner's investigation/discussion, use the local single-account
   model for the existing same-plan historical capacity, without a new UI label.
   Preserve actual account-change boundaries, explicit foreign-scope refusal,
   plan/reset/price/coverage rules and unchanged historical attribution. Do not
   import old unscoped saved state or resume creator-account attribution.
6. Validate synthetic negative/replay cases first, then the owning local/UI
   suites, architecture and documentation gates as applicable. Rehearse
   verified recovery on an owner-only operational copy, never ordinary tests
   containing private session bytes. Record exact input/source identity and
   aggregate facts only. Candidate preparation and natural live observation
   remain separate artifact/runtime gates.

# Validation boundaries

Source tests prove the named changes only. No manual live refresh, source
touch, direct profile/cache/gap edit, app termination, schema change, identity
reassignment, signing, installation, publication or remote action is part of
source repair. Existing authorization to prepare and normally switch unsigned
local candidates does not remove the need for exact package verification and
the owner's normal quit. Preserve the current candidate and state throughout.

Rollback is a source/candidate rollback after exact identity verification;
there is no schema downgrade, data deletion or cache-format rollback.
Do not describe a partial repair or a passed synthetic gate as live recovery.

# Implementation and evidence

The owner paused implementation for discussion, then explicitly resumed the
single-account capacity change without an additional UI assumption label.
The earlier full root test process was stopped; no passing root-suite result
is claimed for that run. Preserve the current source changes and operational
copies. Candidate preparation and live activation remain unperformed.

Source repair is implemented in the existing scanner, refresh, store and
workload owners. Discovery distinguishes retryable dependency changes from
stable invalidity; unchanged discovery quarantines receive renewed admission;
complete same-identity replay closes eligible gaps atomically. Change ordering,
rather than wall-clock order, prevents repair across a later identity change.
Out-of-range cutoffs also validate final dependency state before quarantine.

Workload policy `task-workload-v16` accepts bounded transient exact gap ranges,
preserves conservative handling of legacy/unknown extents and refuses expected
consumption across missing usage. Public input types and maintained contract
documentation are updated; persisted schema/cache formats are unchanged.
Historical capacity selection now implements the owner's local single-account
model decision. Existing same-plan unattributed fits are admitted; explicitly
foreign-account capacities are refused. No additional UI label or persistent
format is introduced, and historical account attribution remains unchanged.
The workload/connection gate passed 117 tests and the local gate passed 300.
Read-only comparison on the repaired real-index copy restored a deterministic
expected value but exposed a large actual/expected model discrepancy; the
receipt records the exact values without claiming accuracy or live recovery.

Final focused verification completed with 213 passed, zero failed and one
existing Windows replacement-contract skip. Broad root regression was stopped
after reporting 166 failures; 46 were independently reproduced at the unchanged
`71f1a2cb` HEAD with the same native binary/manifest bytes. Remaining broad
failures have not all been attributed. One introduced cancellation-code
regression was corrected and covered by the final focused run. No broad,
packaged, rendered or live gate is claimed complete. No new candidate was
built or activated.

The [recovery receipt](../receipts/2026-11-10-refresh-workload-recovery.md)
records synthetic validation and two protected real-index-copy rehearsals.
The persistent lineage gap recovered with its two usage, two quota and three
work facts; independent missing lifecycle evidence remains explicit. Full
root/surface validation and any rendered candidate/live qualification remain
separate gates. No candidate switch or live profile write has occurred.

The owner's follow-up challenge to the 447.15 pp result blocks qualifying the
expected-consumption slice. Independent raw-event pricing matches the reader's
290.2429916 API-equivalent USD, while 128 retained direct quota reads stay at
8% used during a later span containing another 167.9703816 API-equivalent USD.
The historical scalar's eligible fragments contain no priced Astra events;
that does not alone explain the full quota/usage divergence. Establish meter
and usage comparability before changing calibration or claiming recovery of
expected consumption. No number capping, same-period self-fit or unsupported
account assignment is an acceptable correction. The receipt records the
verified arithmetic, time partitions and still-missing evidence.

# Owner-approved API exclusion slice

The owner confirmed the CLI uses a third-party API-key provider, then requested
the simplest exclusion from all usage statistics and calculations. Implement a
source-metadata selection rule in the existing shared response prepass: a
nonempty custom `model_provider`, explicit `auth_mode` of `apikey`/`api_key`, or
`billing_surface: openai_api` excludes that source's emitted usage, quota,
tool and work facts. Do not infer from CLI/IDE labels, creator fields, missing
account identity, current configuration or credentials. Missing historical
declarations retain the existing single-account subscription model; an
`openai` provider alone does not prove authentication mode.

The initial exclusion advanced extractor provenance to v23 and used existing
bounded/atomic source replay to replace present v22-derived facts, retaining
catalogs and cursors. The later owner-directed discovery slice below supersedes
API admission and cursor retention; original files and necessary replay evidence
remain preserved. Absent sources cannot be silently reclassified; their old
provenance remains a qualification limit. No persistent schema, cache format or
migration change is authorized or needed for either slice.

Acceptance: subscription/unknown CLI and IDE fixtures keep exact facts; API
fixtures contribute no usage/quota/tools/work across cold, worker, append and
old-parser replay paths; cancellation cannot publish partial replacement;
rollups and downstream readers agree, and a repeated refresh cannot add spend.
Validate synthetic fixtures first, then rehearse an owner-only index copy.
The existing live profile remains untouched and no candidate is activated.

The same metadata rule also gates the independent model-performance parser,
using its existing `blocked` state and ordinary parser replay (revision 20).
No second filter policy or new timing-cache field is introduced.

# API-session marginal performance qualification

The owner requested no additional interface declaration and measured evidence
that excluded API-session changes do not materially increase recomputation.
Prepare a new owner-only operational corpus from authenticated real source
prefixes; never use it as an ordinary test fixture or mutate the live profile.
First build the current parser and accounting caches, then restore the same
baseline generation and fixed clock before each unchanged/add-short/append-tail
trial. Interleave three trials per scenario, separating fresh-process and warm
process results. Record stage timings and calculation revisions, verify exact
subscription facts, zero API facts, accounting reuse, and replay idempotence.

Before measurement, the practical timing acceptance is a median incremental
cost no greater than the larger of 1 second or 10% of the unchanged pipeline;
also report individual stages and the full observed range. This is an explicit
engineering threshold for the measured corpus, not a statistical or universal
constant-time claim. A failed result requires investigation, not relabeling.
Any performance repair must retain validation, source proof and lineage replay,
use existing owners, and introduce no persistent schema/cache changes. Record
one-time cache preparation separately from steady-state measurements.

The first protected full-history triplet disproved the initial performance
expectation: window shadow scanned all inputs after both excluded API changes,
taking about 12 seconds versus 0.6 seconds unchanged, despite zero dirty days.
That matrix was stopped and its results preserved. A window-receipt exception
then proved old/current accounting inputs empty from the complete manifest and
verified source before reusing days. Synthetic full-scan equality and a new
protected-copy matrix qualified that intermediate change. The later discovery
slice below removes the exception entirely: preventing the API-only index
change makes accounting-specific empty-source handling unnecessary. The
conservative window planner is now unchanged from HEAD. No receipt algorithm,
digest, schema or cache-format revision is introduced.

The [API-session performance receipt](../receipts/2026-11-10-api-session-marginal-refresh.md)
records the completed 18-sample protected-copy matrix. Exact facts, replay and
zero-dirty-window accounting are qualified; the full warm-refresh threshold is
not met (14–16% median increase). The remaining report projection rebuild must
not be hidden by weakening publication identity or adding a cache layer. The
window/refresh focused gate passed 191 tests and the local surface passed 300;
broad-root, packaged and live qualification remain separate.

# Owner-directed exclusion before indexing

The owner then directed API sessions to stay out of the index. Move the existing
explicit metadata predicate to discovery admission: independent API sources do
not register catalog/session/cursor/fact rows or advance publication. Reuse only
existing inspection records whose current parser and nonempty statistical facts
prove subscription admission; empty/old sources receive a bounded header read.
Do not add a persisted classification field, schema, cache or parser relabel.

Keep API history only in the transient dependency closure when an admitted
subscription source needs it for exact history/replay. Use the existing guarded
extractor and in-memory lineage state without registering the API source. Old
API-derived facts receive one atomic evidence-backed correction and an absent
catalog tombstone; later API additions/appends must leave generation and
calculation revision unchanged. Preserve raw files, ordinal history, manifests,
unknowns, origin proof, cancellation and replacement/lineage fallbacks.

Acceptance: cold/worker/restart and mixed-parent fixtures preserve subscription
facts exactly; API-only growth creates no source or session and does not move
generation, revision or reporting cache. Rehearse corrections and full-cache
unchanged/add/append comparisons against protected operational copies, at least
three samples per case. The live profile stays untouched.

The [admission receipt](../receipts/2026-11-10-api-index-boundary-refresh.md)
records the completed 18-sample comparison. All samples retain generation,
calculation revision and exact subscription facts, with zero ingestion bytes
or new API catalog entries. All nine warm snapshots reuse the completed report;
the projection medians are 75.9/74.0/78.3 ms for unchanged/add/append. Both API
deltas meet the predefined median-increase threshold in fresh and warm modes.
Shared-host wall times vary widely and include reported memory pressure, so
these measurements do not establish statistical equivalence or live latency.
There is no new cache or accounting exception. Candidate/live qualification and
the independent model-performance-page latency remain separate gates.
