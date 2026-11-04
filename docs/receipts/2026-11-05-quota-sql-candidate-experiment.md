---
title: Quota SQL candidate collapse negative performance result
date: 2026-11-05
type: receipt
status: negative-result
source_commit: 7492641812ec4ad417979bcb682898ca1088865a
---

# Result and boundary

The candidate-selection experiment matched the existing accounting quota
selection on one protected-copy generation, but did not establish a consistent
performance improvement after preserving ordering and malformed-row refusal.
The SQL implementation and its experiment-only tests were removed. The shipping
occurrence reader and quota allocation remain unchanged.

This is a local experiment on Windows x64 with Node.js 22.21.1, based on the
named commit plus an uncommitted, subsequently discarded SQL implementation.
It is not live-profile, whole-refresh, Electron, installed-app, or release
evidence. The protected index was opened read-only; no live profile was written.

# Method and equality

An inline `node --input-type=module` harness compared both scan modes against
the same copied index, generation 24600, clock, cache, and 365-day window.
The experiment grouped identical quota states, ranked same-instant winners,
and selected state transitions and 15-minute bucket edges in SQL. Separate
family counts preserved the original 10,000-row threshold. UTC-day batches
bounded materialization and allowed cooperative cancellation. Decimal rounding
used the existing JavaScript rule through a deterministic SQLite scalar.

The baseline delivered 483,511 committed occurrences and selected 121,096
candidates; SQL delivered those same 121,096 candidates. Their canonical
SHA-256 was identical:
`239170677c3d4a8206b7c06d618a2b3d294dfb379dcf68ef28f9c4e9da0679bd`.
The earlier same-instant comparison also matched all 369,065 unique points.

The complete retained-slice result compared equal, including usage timelines,
both 10,000-row quota timelines, coverage and generation metadata. The weekly
forecast remained null in both runs; this does not prove an attributed forecast.
Synthetic checks covered empty windows, ties, rounding, UTC boundaries, retry
after cancellation, and capped/uncapped families with multiple durations.

# Performance and rejection

The final comparison included the original malformed-reset and source-integer
refusal semantics. Values are milliseconds from one serial, warm-process pair;
SQL composition ran before baseline composition.

| Measurement | Existing reader | SQL candidate selection |
|---|---:|---:|
| Candidate scan and comparison projection | 5,696 | 5,847 |
| Quota refresh stage | 7,336 | 7,911 |
| Complete moving-slice composition | 9,490 | 9,688 |

An earlier version measured 5,237 versus 3,564 ms for quota refresh, but that
version had not preserved every original refusal and ordering boundary. Its
apparent speedup is not acceptance evidence for the final version. Timings also
varied substantially between runs. Candidate-count reduction alone therefore
does not justify changing the shipping reader.

The focused review found that filtering malformed reset/provenance integers
could turn a refused publication into a plausible exact series. Preserving
refusal requires considering the original admitted, committed scan scope before
candidate filtering. A future SQL design must include that cost in its baseline
and equality proof.

# Remaining work

No whole-refresh speedup is proven. Discovery/stat, snapshot reload/build,
receipt/window maintenance, and publication were outside this timing harness.
Keep their costs separate in the next measurement plan. Aggregate runtime
counters, repeated stable-profile observation, first production freshness-seed
evidence, synthetic Electron inspection, and the owner-runtime phase receipt
remain separate gates.
