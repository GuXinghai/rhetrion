---
title: Stable-profile accounting freshness seed and fast-path verification
date: 2026-11-05
type: receipt
status: verified
source_commit: 36f9294c
---

# Result and boundary

A controlled live seed wrote the first accounting freshness envelope and window
cache into the owner's stable collector, then verified that the next accounting
pass composed through `fast_path` without another full rebuild. The write used
the current source at `36f9294c`; no application was installed, upgraded, signed,
or published. The live index bytes were not modified.

This is stable-collector evidence produced by the current source, not
installed-app, packaged-candidate, signing, updater, or release evidence. The
old desktop daemon was stopped for the write and was not restarted.

# Copy rehearsal first

A consistent SQLite copy of the stable collector and index was created and
checked with `PRAGMA quick_check = ok`. The copy was given an owner-only DACL
before the runner opened it.

| Pass | Elapsed | Status | Rebuilt windows | Full rebuilds |
|---|---:|---|---:|---:|
| First pass | 503 s | `rebuilt` | 252 | 1 |
| Follow-up | 36 s | `fast_path` | 0 additional | 0 additional |

The first pass seeded a 64-hex window digest and all six provenance components.
The window cache held 252 days, four folded periods, and a matched audit. The
follow-up's cumulative counters were unchanged: zero dirty, recomputed,
unavailable, mismatch, or full-rebuild increments.

# Live seed

After stopping the old `codex-usage` daemon, the same collector, index, device
salt, and private baseline files were backed up. The index backup and the live
index after the write have the same SHA-256:
`6c448aca4ad4e26ba43fefd9f4baf1e1d6c7ce365052115d63f51c8a8d520817`.

| Pass | Elapsed | Status | Rebuilt windows | Full rebuilds |
|---|---:|---|---:|---:|
| First live pass | 521 s | `rebuilt` | 252 | 1 |
| Follow-up | 37 s | `fast_path` | 0 additional | 0 additional |

The live cache now contains:

- `local-replay-safe-accounting-v0.26`;
- `local-accounting-freshness-v1`;
- a 64-hex window digest;
- `fileDigest`, `calculationRevision`, `baselinesDigest`, `originFingerprint`,
  `policyIdentity`, and `diagnostics` provenance;
- calibration and quota timestamps at the rebuild instant;
- an exact timeline component.

The window cache contains 252 days, four folded periods, a matched audit, and
generation `24833`. The follow-up left the cumulative counters at 252 dirty and
252 recomputed windows with one full rebuild, so it added zero rebuilt windows
and zero full rebuilds. The live index hash above is unchanged.

# Backup and operational state

The backup set contains SQLite `VACUUM INTO` copies with `quick_check = ok`, raw
collector and index files with their WAL/SHM sidecars, the device salt, and the
private speed-baseline and workload-account files. The backup directory is
owner-only. No backup path or private content is recorded here.

The old `codex-usage` daemon remains stopped. No installer or app update was
run. A normal app-driven refresh with the new build has not yet been observed;
the stable profile now has the markers that make that observation possible.

# Remaining gates

Repeated app-driven live observation, the installed/packaged candidate,
signing, NSIS install/upgrade/uninstall, and release publication remain separate
gates. A different live index byte set would need its own copy rehearsal.
