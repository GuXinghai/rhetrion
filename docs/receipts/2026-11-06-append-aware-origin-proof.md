---
title: Append-aware accounting origin proof
date: 2026-11-06
type: receipt
status: partial
source_commit: e2223de3
---

# Result and boundary

The accounting reuse proof no longer treats the whole session-origin set as a
single immutable input. It records the session count in the freshness provenance
and compares the next proof against that exact session prefix. A newly indexed
session appended to the durable session order stays on `fast_path`; its facts
dirty only the UTC days they touch. A removal, a reclassification of an existing
session, or an out-of-order insert still fails the prefix check and falls back
to reuse/rebuild.

This receipt records the synthetic proof and the first live pass after the
change. A 20-minute live watch after that pass observed no new session
(4264 to 4264 indexed sessions), so a live pass containing a genuinely new
session remains pending. The append behavior is proven against a real local
index in the focused test, not yet in Live.

# Change

- `src/local-index-accounting-reuse.js` returns `originCount` and, when the
  caller supplies the previous count, `originPrefixKey`.
- `src/local-accounting-fast-path.js` accepts an append when the current full
  origin digest differs but the previous fingerprint equals the current prefix
  digest and the count grew.
- The composed cache stores the current provenance, including
  `originSessionCount`, so the expanded set is the next pass's baseline.
- `completeAccountingFreshness` prefers the current proof over an older stored
  envelope.

# Verification

Focused:

- `test/local-index-accounting-reuse.test.js` builds a real index with one
  session, restores a held rollout as a second session, and asserts that the
  second proof exposes the first proof's exact digest as its prefix.
- `test/local-accounting-fast-path-refresh.test.js` runs three real collector
  passes. The first rebuilds; the second is an unchanged `fast_path`; after a
  genuinely new session is indexed, the third is still `fast_path`, recomputes
  dirty days, keeps `fullRebuilds` at one, and includes the new session's events.
- `test/local-accounting-fast-path.test.js` covers the append, changed-prefix,
  count-growth, and legacy-no-count cases.

Full surfaces:

- `product:local:test`: 295 passed.
- `product:ui:test`: 904 passed.
- `product:electron:test`: 589 passed, 3 skipped.
- `architecture:check`, `docs:check`, and `test:preflight`: passed.

# First live pass

An unsigned stable-metadata candidate was built from `e2223de3` (build
`2026110601`) and launched directly from `win-unpacked` against the live stable
profile. No install, signing, updater, or publication step was run.

- First app-driven pass: `2026-11-05T20:51:32.618Z` to
  `2026-11-05T20:56:22.895Z`, about 290 s.
- Result: `fast_path`, `fullRebuilds = 0`, one dirty/recomputed window, no
  unavailable or mismatched windows, no fallback code, generation `24960`.
- The refreshed cache records `originSessionCount = 4264` with 4264 indexed
  sessions and a 64-hex window digest.
- The dashboard showed `数据截至11月6日 GMT+9 05:47`, with the manual
  recalculate control hidden.

# Remaining gates

- Observe a live pass after a new session is indexed and confirm it stays on
  `fast_path` with one additional origin tail.
- Calibration due still forces a full rebuild by design; a new session around
  the calibration boundary can therefore still coincide with one.
- A changed origin classification for an existing session, a removed session,
  or a non-tail insert still falls through to the reuse/rebuild path.
- Installed-app, signing, NSIS lifecycle, updater, and release gates remain
  separate and were not run.
