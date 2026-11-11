---
title: Bounded work-origin source-path batching
date: 2026-11-08
type: receipt
status: completed-with-latency-limit
---

# Boundary

This slice replaces repeated work-origin source-path SQL in
`src/local-index-work-usage.js`. It does not change ingestion, accounting,
schema, indexes, persistent cache formats, timeout policy or the running
candidate. Source baseline is `71f1a2cb6dd673251195d966ba86ee6f4683ad8f`;
the candidate is an uncommitted source change. This is source/local-reader
evidence, not an artifact, live-refresh or production-latency qualification.

The initial requested UUIDs are selected case-insensitively in batches of at
most 256. Only one batch's lists are retained, with at most 33 distinct paths
per UUID, and consumed lists are removed. The existing ancestry reader refuses
more than 32 paths. Verified parents outside the initial request still use
the original lazy query. Unrelated historical sessions cannot populate a
small-window path lookup. Native ACL, link, path, header and file-state guards,
parent-chain verification, cancellation, unknown/fallback semantics and
generation fences are unchanged. No new service, dependency or reusable cache
is introduced.

# Protected-copy comparison

The owner-authorized operational copy remains outside the repository. Its
private bytes, paths, identities and work rows never enter tests, fixtures,
diagnostics or this receipt. The comparison opens only the copy's existing
index read-only and publishes no results. It runs the baseline module loaded
from Git and the candidate through `readLocalIndexWorkUsage` with the same
default intervals, empty declared-speed baselines and normal Git resolver.

Frozen index generation is **4368**, calculation revision **2351680**, and
calculation anchor **1794134628011**. The baseline contains 4,263 sessions,
4,368 sources and 564,116 usage events; 4,064 initial usage UUIDs are requested.
Both sides read one pinned SQLite transaction. Exact file identity, size and
nanosecond write/change timestamps are checked around each pair for the 4,368
source files, copied metadata, salt and index. Relevant source hashes are
rechecked. Git project inputs remain external and are not claimed frozen;
every pair must still produce exactly equal complete work results, excluding
only `snapshot.metadata.observedAt`.

Windows x64 Node.js **26.2.0** runs three paired fresh-process samples, then
one process with an excluded warmup pair and three measured warm pairs. The
side order alternates. Both sides of a pair share the existing header-relation
cache, and the second side can benefit from it; fresh process is not cold
operating-system cache. Warm and fresh groups remain separate. Host aggregate
CPU/available memory are sampled, and no tests or builds run concurrently.
Stage spans are inclusive and must not be added.
Process startup, discovery, index refresh, accounting proof/window shadow and
snapshot projection/publication are outside this work-read-only matrix; they
are unmeasured here rather than zero.

The ignored owner-local harness is
`.release-build/work-source-path-batch-20261108/`. `compare.mjs` runs one
`fresh <1|2|3>` process or one `warm 1` matrix; `run.mjs` runs them sequentially
and writes only aggregate timings, counts, source hashes and equality/refusal
flags. The exact runtime entrypoint is
`.release-build/toolchains/node-v26.2.0-win-x64/node.exe`. Source/input changes,
unavailable results, inequality or the existing ten-minute read deadline refuse
the sample. No live profile, metadata, cache or source is modified.

The first harness launch failed before measurement because a bare workspace
dependency could not resolve from the in-memory baseline module. Its output
is retained separately as `attempt-1-refused`; the harness now resolves both
relative and public package dependencies to URLs. No product failure or timing
sample is inferred from that refusal.

Candidate module SHA-256:
`8797f40293ba42f81e241572af6cea255d8e1cd27b8a0e80ea72cdce595d33c4`.
Baseline module SHA-256:
`f6b8a837d51df0a922bea4aacba5639379b17da899fdc27c9d2abc5337386fbf`.
Four-owner source matrix SHA-256:
`13d4dcf83429d2fe2efbd2363611f28a6ee9d64496e65d9bfe7b7aabb9767f5e`.

# Results

All six measured pairs and the excluded warmup passed complete-output equality
and unchanged-input checks. Each old read made **4,066** source-path queries;
each new read made **18** (16 initial batches and two lazy parent lookups).
Each side yielded **4,169** selected source-path rows. The admitted native
source authentication and resulting work figures were not removed.

The following values are milliseconds, shown as **median [minimum–maximum]**
over three samples per group. They are observations under host pressure,
not controlled causal estimates of whole-work savings.

| Fresh-process stage | Baseline | Candidate |
| --- | ---: | ---: |
| Complete work read | 138,462.790 [63,803.568–189,824.376] | 100,309.742 [31,394.197–185,408.569] |
| Process CPU during work | 101,141 [50,453–121,000] | 73,547 [28,079–113,937] |
| Source-path SQL | 15,530.825 [6,332.339–16,186.910] | 136.493 [71.670–201.753] |
| Work origins, inclusive | 123,971.806 [53,166.562–181,765.194] | 90,533.903 [24,499.903–175,971.710] |
| Origin open | 73,374.380 [24,415.486–79,123.829] | 61,412.237 [17,164.539–80,573.660] |
| Origin realpath | 15,052.167 [4,635.409–16,692.365] | 12,349.206 [3,059.318–17,725.761] |
| Origin read | 11,247.271 [70.577–47,274.514] | 13.278 [8.101–52,890.187] |
| Project/Git resolution | 3,967.500 [2,856.963–7,058.714] | 5,607.248 [3,492.089–5,884.994] |
| Work aggregate | 719.467 [590.416–4,142.438] | 2,644.007 [727.124–2,684.286] |
| Work finalize | 39.995 [37.528–139.528] | 112.865 [50.896–149.883] |

| Warm-process stage | Baseline | Candidate |
| --- | ---: | ---: |
| Complete work read | 147,814.023 [23,761.762–238,352.462] | 22,975.514 [18,098.256–23,682.483] |
| Process CPU during work | 97,015 [22,657–97,953] | 18,844 [17,343–21,953] |
| Source-path SQL | 16,907.188 [4,724.530–25,710.256] | 52.468 [43.818–52.712] |
| Work origins, inclusive | 134,135.353 [20,492.882–209,274.723] | 17,212.892 [14,822.311–19,206.251] |
| Origin open | 78,592.290 [10,971.181–121,641.180] | 12,351.113 [10,376.862–13,252.026] |
| Origin realpath | 16,417.302 [2,091.653–27,837.976] | 2,017.493 [1,800.650–2,408.392] |
| Origin read | 16.513 [10.215–193.447] | 10.908 [9.781–12.932] |
| Project/Git resolution | 5,692.859 [2,423.347–7,914.498] | 3,209.746 [2,462.600–3,494.269] |
| Work aggregate | 402.893 [340.683–4,239.934] | 349.631 [319.895–538.307] |
| Work finalize | 30.876 [25.323–211.574] | 27.033 [23.445–38.026] |

The measured SQL medians fell by approximately **99.1%** in fresh processes
and **99.7%** when warm. Even the slowest candidate SQL sample was faster
than the fastest baseline SQL sample. Together with the fixed query counts,
this supports removal of the repeated-scan computation. It does not prove
the much larger differences elsewhere are caused by this change.

Across 262 host samples from `2026-11-08T14:13:00Z` to `14:34:53Z`, total CPU
was 55.05–75.52% (median 58.51%); available memory was 35–7,803 MiB
(median 2,292 MiB), with 32 samples below 512 MiB. Pair order also changes
header-cache warmth. The first two fresh pairs were slower on the candidate
overall, while the third was faster. Whole-work medians therefore remain
descriptive and do not qualify a stable speedup. In particular, neither the
origin-read nor native-open differences establish an optimization of those
unchanged owners. A quiet-host full-refresh or live natural-refresh gate
remains open; do not extrapolate the SQL result into a six-minute refresh
claim or a session-count growth law.

# Validation and rollback

Synthetic tests cover 260 requested sessions across two bounded batches,
case-insensitive matching, duplicate and filtered paths, lazy out-of-window
parents, unrelated historical overflow, the 32/33-path refusal boundary,
repeat reads and cancellation before partial batch consumption. Existing
provider/native denial and generation-change tests retain their original
assertions.

Completed source validation:

- Targeted work/backend/generation/provider/native/source selection: **76 passed**.
- Complete isolated local suite: **300 passed**, zero failures/skips/cancellations.
- Architecture check: **413 production files, 1,462 imports, zero approved debt edges**.
- Protected-copy matrix: **6/6 measured pairs** equal, plus the excluded warmup;
  all input/source checks passed. No publication or live write occurred.

After the matrix, the filtered-source test was tightened so its quarantined
source has positive scanned bytes, independently testing that predicate.
Its final isolated work test file passed **6/6**. The complete local suite
command was `node scripts/run-isolated-tests.mjs --suite=local`; the final
focused command was
`node scripts/run-isolated-tests.mjs --test-reporter=spec -- test/local-index-work-usage.test.js`.
`corepack pnpm run docs:check` passed, and
`corepack pnpm run test:preflight` passed root hygiene, whitespace,
documentation governance and **20/20** guidance/documentation tests.
Dependency auto-verification was disabled for these commands; no dependency
installation occurred. `git diff --check` passed. The pre-existing CRLF
normalization notice on the plan is not a test failure. The final candidate
module hash matches the comparison receipt above. These test counts are
separate, overlapping command results and must not be added as unique coverage.

Rollback replaces only the source-path selection block with the prior lazy
query and removes its batching constants/maps. There is no state or schema
rollback and no reparse requirement. Native guards and publication rules are
the same on both sides. A future candidate build and live natural-refresh
observation remain separate gates; this slice does not switch the candidate.
