---
title: Stable-metadata candidate live launch and fast-path observation
date: 2026-11-05
type: receipt
status: verified
source_commit: 5e089621
---

# Result and boundary

An unsigned stable-metadata Windows candidate built from `5e089621` was
launched directly from `win-unpacked` against the live stable profile. No
installer, signing, updater, or publication step was run. The old
`codex-usage` daemon remained stopped.

The app-driven accounting path reached `fast_path` on an unchanged index
generation, and the dashboard updated automatically after the progress-event
contract was repaired. A later pass with a new index generation and a
54-source rescan still required a full rebuild and took longer than the
ten-minute incremental budget; the following pass completed after eleven
minutes. The whole-refresh performance and new-session proof limits therefore
remain open.

# Candidate

- Source revision: `5e0896218a6dc17b6cce458a598e1a67233f9b42`.
- Build number: `2026110503`, stable metadata, production staging.
- Executable SHA-256:
  `94d386bd5fd92cc23edc531a0147891882ed4d0c5204ebb772dcc38af8f9256e`.
- ASAR SHA-256:
  `8dfe88aeaaeddbd892930c3795f6dac78592af96d14251efa6009797966217f7`.
- Signature: none. Installed: no. Published: no.

# Review fixes before launch

A read-only subagent review returned **READY WITH FIXES**. The blocking items
were corrected before the launch:

- the packaged companion now forwards `USAGE_MONITOR_ACCOUNTING_FAST_PATH`;
- a manual repair with unchanged receipts now persists the rebuilt days and
  cannot report completion against the old stored digest;
- the progress-event contract accepts the new `repair` state; without this,
  every event was rejected and the dashboard missed automatic completions;
- repair ranges now select the exact two or 31 UTC days containing the stale
  component, and a failed repair surfaces `repair_unavailable`;
- a successful fast path clears the previous fallback code;
- zero-fact window days no longer call the accumulator export with `undefined`;
- the two stale local-companion-data expectations were corrected, so
  `product:local:test` is green.

# Live observations

The live collector already had a seeded freshness envelope and window cache
from `36f9294c`. Launching the `1c58d8f6` candidate produced:

- one app-driven `fast_path` pass in about 99 s;
- `fullRebuilds = 0`, one dirty/recomputed window;
- automatic dashboard update to `数据截至` without a manual reload.

A later pass with a changed index generation rebuilt the snapshot and hit the
five-minute server budget during `snapshot_index_projection`. The budget was
raised to ten minutes. A subsequent pass encountered a 54-source rescan and hit
the ten-minute budget during the same terminal stage (`index_discovery` 177 s,
`index_execute` 216 s, `index_parent_model` 93 s, `snapshot_build` 47 s,
accounting fast path 33 s).

The following pass completed in 11 min 14 s with a full rebuild at generation
`24921`, seven dirty/recomputed windows, no unavailable or mismatched windows,
and fallback `retained_marker_absent`. The final cache contains a 64-hex window
digest, six provenance components, exact windows/timeline and quota timestamps,
and a 253-day window cache with a matched audit.

# Operational state

The stable-metadata candidate is running against the live stable profile. The
old daemon is stopped. The live index was advanced by the app's own refresh; the
pre-launch backup remains available. No software was installed.

# Remaining gates

- At `5e089621`, a new indexed session changed the global origin proof and
  forced a full rebuild; the zero-rebuild claim was limited to an unchanged
  session set. A follow-up makes the proof append-aware, but this receipt does
  not prove that follow-up in Live.
- A 54-source rescan can exceed ten minutes; whole-refresh discovery/snapshot
  optimization remains open.
- A failed pass can leave its failure notice visible until the next successful
  render or reload.
- Repeated long-running observation, installed/packaged qualification, signing,
  NSIS lifecycle, updater, and release publication remain separate gates.
