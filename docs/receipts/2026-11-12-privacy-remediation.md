---
title: Privacy audit source remediation
date: 2026-11-12
type: receipt
status: source-verified
---

# Scope and evidence boundary

Source repair for F1–F4 in the
[privacy audit](../reviews/2026-11-12-privacy-audit.md), against checkout
`28d31c5856e87e284b25e580194cbae7ca06a3f1` plus the existing uncommitted
architecture, lineage and privacy changes on Windows x64. The audit retains
its original point-in-time findings. The maintained
[privacy inventory](../reference/local-data-and-privacy.md) describes the
resulting contracts.

No live profile, credential, proxy setting, running candidate, release or
remote resource was changed. Tests used disposable synthetic state through
`scripts/run-isolated-tests.mjs` and pinned Node.js 26.2.0.

## Repairs and compatibility

- **F1:** the shared snapshot transport uses the existing native protected
  root/child guards, bounded source-read lease and owner-only atomic publisher.
  Both active index-salt entrypoints share protected no-clobber creation and
  bounded native reads. Broad DACLs, unsafe parents and multiple links are
  refused without repair or identity regeneration. Salt bytes, HMAC derivation,
  file locations and snapshot envelope encoding are unchanged. Snapshot reads
  above the protected-record API's 1 MiB ceiling use bounded chunks rather than
  widening that API. A clock callback runs before the final validation/encoding
  boundary and cannot insert unvalidated fields afterward.
- **F2:** observation parsing, final CLI stderr and retained experiment failure
  reasons project fixed codes; parser excerpts, source paths and arbitrary
  workload/cleanup messages are omitted. Cancellation and primary-failure
  precedence remain explicit. Historical experiment result files are unchanged.
- **F3:** browser caller notes, server authorization and the final diagnostic
  sink admit finite reviewed vocabularies. Browser/server parity tests cover
  caller codes and resource-limit details; server-minted refresh outcomes also
  use closed code projection. Startup health exposes only reviewed failure codes
  before teardown. Origin, local-header, context and size restrictions remain in
  force.
- **F4:** the authoritative dashboard snapshot closes nested DTO fields on
  persistence and restore. Artifact dataset field lists are shared with the
  builder; reviewed model/dimension keys come from their existing owners.
  Unknown fields, serialization hooks, accessors, symbols, proxies and custom
  object/array prototypes are refused. Explicit unknown/stale states retain
  their meaning; existing accounting-completeness checks still decide authority.

No database schema, cache version, migration behavior or salt derivation changed.
Admission is stricter: an unsafe or unknown-shape old optional snapshot remains
preserved but is not restored. Failed writes preserve the last-good bytes.
An unsafe salt blocks refresh and requires separately reviewed recovery using
the original identity; these repairs do not silently convert live state.

## Validation

The following gates completed with zero failures and zero skips:

| Gate | Result |
| --- | --- |
| Final core privacy/storage/identity/work-source/model-performance tests, six files | 100 passed |
| Authoritative snapshot and real synthetic builder contract tests, two files | 80 passed |
| Complete local surface, `--suite=local` | 302 passed |
| Complete browser surface, `--suite=ui` | 910 passed |
| Focused diagnostic client/server/refresh integration, five files | 332 passed |
| Native credential-free security, workload, accounting-window and CLI reference tests, four files | 40 passed |
| Documentation governance and agent-guidance preflight | 20 passed |

Architecture validation passed with 414 production files, 1,504 imports and zero
approved debt edges. Root workspace hygiene, tracked/untracked whitespace and
the complete documentation gate passed. pnpm was unavailable; the existing
Node entrypoints were run directly without changing dependencies or lockfiles.

The core tests cover exact snapshot envelope roundtrip, native protection,
refusal without ACL repair, last-good preservation, a snapshot above 1 MiB,
unchanged salt bytes across both entrypoints, actual CLI stderr and fixed
experiment failure output. Diagnostic integration includes an actual isolated
loopback server and identifier-shaped private-marker rejection.

Snapshot tests inject unknown fields into every nested record of a populated
builder output, reject a forged receipt even with a recomputed matching digest,
and verify that accessors and serialization hooks never execute. Positive cases
include fitted weekly model maps, workload errors, stale/unavailable values,
typed-tool gaps, restart and exact v1 envelope bytes.

## Remaining gates

The running unsigned candidate `2026111201` was not rebuilt or restarted and
does not contain these source repairs. Packaged/native runtime behavior,
alternate-Windows-user access, credential qualification and traffic observation
remain separate gates. Generic Windows adapter/store production and race-safety
readiness flags remain unchanged. The focused repair tests do not establish
injected native close-failure or adversarial concurrent path-replacement proof.
The snapshot traversal's node, depth, array and string ceilings are admission
limits; these tests do not qualify every maximum-size owner corpus.
