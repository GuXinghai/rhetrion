---
title: Empty timing-source cleanup
date: 2026-11-02
type: receipt
status: verified
source_commit: c73af175
---

# Result and boundary

The persistent `timing_history_unavailable` warning was caused by three
parser-version-18 source checkpoints with no turns. Their original rollout
files were no longer present under the configured Codex home, so they could
never be re-read or upgraded to parser version 19. The warning was recomputed
on every model-performance publication, which is why its timestamp changed
while the unavailable count stayed at three.

The owner authorized deleting those three empty checkpoints. The cleanup was
limited to the current Codex-home timing scope and its tool-free supplement;
the legacy unscoped timing store was not modified.

# Before cleanup

- Current source files discovered: 4,269.
- Primary timing sources: 4,272 rows, of which 4,269 were parser 19/0 and three
  were parser 18/0.
- Supplement timing sources: the same counts.
- The three parser-18 sources each had zero `turn` rows and zero
  `parser_replay_turn` rows.
- History state for both stores: `pending: 0`, `unavailable: 3`,
  `recoveryFailed: 0`.
- The three orphaned digests did not match any source path retained by the
  local index, confirming that their files were no longer available.

# Cleanup

- A recursive backup of the primary and supplement timing stores was made
  before the change; the copied SQLite files matched the live SHA-256 values.
- Only the three source rows with zero turns were deleted, one transaction per
  store.
- No `turn` or `parser_replay_turn` rows changed.
- Both databases passed `PRAGMA integrity_check`.

# After cleanup

- Primary sources: 4,269 rows, all parser 19/0.
- Supplement sources: 4,269 rows, all parser 19/0.
- History state for both stores: `pending: 0`, `unavailable: 0`,
  `recoveryFailed: 0`.
- The rendered model-performance API returned `status: ready` with no
  `timing_history_unavailable` diagnostic header.
- The rendered dashboard no longer contains the “部分历史来源不可重读”
  warning.
- The app was left running against the real profile.

# Boundary

This is a local state cleanup, not a release or installed-app claim. The backup
remains available for rollback. Future unknown or stale evidence still remains
explicit; this cleanup only removed empty checkpoints that could never be
re-read.
