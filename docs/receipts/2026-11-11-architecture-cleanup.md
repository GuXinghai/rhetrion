---
title: Architecture cleanup source validation
date: 2026-11-11
type: receipt
status: verified
---

# Scope and evidence boundary

This receipt covers six architecture cleanups in the uncommitted working tree
based on `28d31c5856e87e284b25e580194cbae7ca06a3f1`, validated on Windows x64
with Node.js 26.2.0 on 2026-11-11. Current ownership is documented in
[system architecture](../reference/system-architecture.md).

The evidence is source, isolated synthetic tests and isolated Electron 43.8.4
rendering. It does not establish an installed candidate, live-profile behavior,
signing, release or publication. No live profile, schema, cache format, native
security policy, dependency, lockfile or release state was changed.

# Completed cleanup

| Area | Result |
|---|---|
| Export entrypoints | Removed five flat forwarding modules; consumers use existing export entrypoints. The dependency policy permanently rejects the retired paths. |
| Companion and work projections | Removed the combined projection API, selector adapters and ignored routing options. Companion caching and independent work-service reads retain their own publication, time and cancellation boundaries. |
| Scanner composition | Added `local-codex-runtime.js`; ingestion constructs its scanner independently of export and deletion contexts. |
| Accounting ownership | Value contracts, exact pricing and bounded calibration have named module owners. Removed the cache-internals object; the cache retains assembly, validation and persistence. |
| Workload lifecycle | The existing workload owner handles protected state read, quota evidence, computation, conditional persistence and safe error merging. Snapshot assembly supplies scope and consumes the result. |
| Browser refresh | One importable coordinator owns submission, cancellation, publication observation, leases and bounded continuation. The app supplies explicit ports and renders read-only state snapshots. |

The accounting extraction was compared against the base: 153 function bodies
and 66 constants were preserved, allowing the two accesses through the pricing
owner's scaled-total accessor. Companion figures and generation still share one
read snapshot. Work reads retain the commit-sequence fence and exact reporting
anchor. Workload scope matching, evidence-object identity and persistence order
remain unchanged.

Tests for removed APIs were replaced with tests of their actual surviving
owners. Refresh coordination tests import the production module directly;
source extraction remains only for unrelated DOM/presentation helpers. Coverage
includes metadata rereads, subscriber cancellation, identical-anchor concurrent
work requests, stale publication reads, writer settlement, leases, no-progress
termination, pause, shared busy state and continuation limits.

# Validation

Commands below used the pinned local Node.js executable and the existing
isolated runner. The root suite includes the complete browser test suite.

| Gate | Observed result |
|---|---|
| `scripts/check-architecture-boundaries.mjs` | Passed: 413 production files, 1,494 imports, zero approved debt edges. |
| Root workspace hygiene | Passed. |
| `scripts/test-lanes.mjs preflight` | Passed: documentation, whitespace and 20 governance/guidance tests. |
| Codex contract and tool inventory | Passed. |
| Browser/Electron i18n, Codex browser and local export contract checks | All current; no generated-file changes. |
| `scripts/run-isolated-tests.mjs --suite=root` | Completed: 4,734 tests; 4,660 passed, 5 failed, 69 skipped. All five failures were corrected and retested as described below. |
| Corrected boundary and documentation tests | 4/4 and 7/7 passed on the final files. |
| Coordinator timer and concurrent work coverage | Two affected files: 12/12 passed. |
| `scripts/run-isolated-tests.mjs --suite=local` | 295/295 passed; zero skipped. |
| `scripts/run-isolated-tests.mjs --suite=electron` | 589 passed, zero failed, 3 skipped. |
| Isolated complete-dashboard rendering | Passed at 1280 and 430 CSS-pixel widths; no horizontal overflow or captured JavaScript exceptions. |

One root failure was an old exact facade allowance: snapshot assembly now calls
the guarded workload owner, while the test listed only the backend. The test
now names that precise owner; direct-store restrictions remain intact. Its
entire four-test file passed after correction.

The other four failures were baseline README assertions: both README and the
test were unchanged from the base before this cleanup. They required removed
negative wording and low-level details. The updated test verifies the concise
product introduction and maintained links in README, while checking the same
strict provider, identity, privacy, source and retention contracts in their
maintained authorities. Its entire seven-test file passed. README was unchanged.

Production code remained frozen throughout the complete-root run. Subsequent
edits corrected tests only. The complete root command was not repeated after
those corrections; the affected files were retested directly. Qualification
skips were preserved and are separate gates, not passing native qualification.

Rendering used the actual dashboard modules, a synthetic loopback fixture and
a sandboxed Electron window with an isolated profile and external requests
blocked. Startup submitted no refresh. Three explicit submissions exercised
completion, cancellation and a report-read failure with retry presentation.
The new coordinator loaded through the actual module graph. The local suite
also verified its real companion static-asset route and runtime closure.

# Source identity and retained boundaries

The 102 changed non-Markdown paths have SHA-256
`6aff9f5f266cc3c70ff5ed2a9a4a857a767997849ff5e5f35c3c39c57602bb7b`.
The 40 changed non-test paths have SHA-256
`6394e5785752cd6429e9a8a34f5860860bf19fdee3ef182a44842a3de1bb0151`.
For each set, sort repository-relative paths from the diff against the base
plus untracked files, exclude Markdown, then hash each path, NUL, file bytes
(or the literal `<deleted>`), and NUL. The second set additionally excludes
root `test/`, nested `test/` and `.test.*` files.

This closes the six reviewed coupling findings and the observed stale test
contracts. A zero-edge dependency scan describes that mechanical policy; it is
not a claim that every possible architectural debt in the repository is absent.
