---
title: Workspace discard transaction target inventory
date: 2026-11-11
type: receipt
status: read-only-inventory-with-access-gaps
---

Scope: Windows x64, Node.js 26.2.0, checkout `71f1a2cb` plus preserved owner
changes. Following the initial repository-local inventory, the owner explicitly
requested that the agent find existing transactions instead of asking the owner
to identify them. This authorizes the expanded filename-only inspection below,
not migration, deletion, permission repair or live-profile mutation.

## Method and result

All five ready local fixed NTFS volumes, `C:` through `G:`, were searched from
their roots. The inventory used ripgrep with configuration disabled, hidden and
ignored files included, case-insensitive filename globs, NUL-delimited output,
two threads per scan and at most two concurrent volume scans. No symlinks were
followed, ignore-based subtree exclusions applied or traversal/time limits hit.
Private filenames and scan errors were consumed in process memory; only fixed
categories and counts were emitted. No discovered file contents were read.

The searched names came from both the committed v0.1-era contract and current
source, which use the same filenames: `workspace.sqlite3` and its journal/WAL/SHM
sidecars, discard journal, commit marker and receipt, quarantine-prefix files,
workspace lock and files beneath the export transaction directory. A disposable
empty-file probe verified all eight constructed representative paths, including
hidden controls and a nested transaction file, were found by the same rules.

| Volume | Matching files | Access-error records | First scan wall time |
| --- | ---: | ---: | ---: |
| C: | 0 | 164 | 141.662 s |
| D: | 0 | 5 | 45.513 s |
| E: | 0 | 3 | 21.139 s |
| F: | 0 | 1 | 111.033 s |
| G: | 0 | 1 | 11.450 s |

Scans were concurrent; these times must not be added as total wall time. Each
scanner exited with access errors, so zero matches is not an error-free complete
machine inventory. A repeat filename scan reproduced zero matches and the same
per-volume error counts. D:/E:/F:/G: gaps were classified as system volume
metadata (four records) and recycle-bin contents (six records). C: gaps include
Windows/system software, user application state and temporary/build caches.

Volume and partition metadata also identified the two filesystems without drive
letters as the 260 MiB system partition and 2,000 MiB recovery partition. They
were not mounted or searched. Network targets, disconnected devices, archive
contents, alternate streams and inaccessible descendants were not inspected.
No ACL, ownership, process, application, database or user-data file was changed.

## Retirement boundary

No actual old transaction was discovered or admitted for conversion. This is not
a conversion-completion receipt, proof that the CLI was never used, or a claim
that inaccessible state does not contain a transaction. The current runtime
already accepts v0.2 only; the four v0.1 schema files are used by regression tests,
not by an old production reader. They remain unchanged during this investigation.

The [compatibility review](../reviews/2026-11-11-workspace-discard-identity-compatibility.md)
continues to govern target-specific recovery and retirement. Missing access or
missing precise identity evidence cannot authorize deletion or version relabeling.
Any later discovered old control must remain preserved and refused until an
explicit protected-copy recovery operation can be bound to that exact target.
