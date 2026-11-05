---
title: Workload quota attribution isolation
date: 2026-11-06
type: receipt
status: verified
source_commit: a4404ed5
---

# Result and boundary

The overview no longer grades the local workload against a provider quota plan
that cannot be tied to the displayed usage. Live evidence showed a 100%
unattributed usage period while the default Codex app-server supplied a
pseudonymous Plus quota observation. The workload selected Plus and offered
plan-based work-hour estimates that did not belong to the measured account.

The fix keeps the API-equivalent rate and local intensity grade, which come from
priced usage rather than a plan, and removes the unmatched plan and capacity
inputs. It does not change accounting, quota collection, or any provider data.
The quota card remains visible as a reference-only observation with an explicit
attribution note. A real same-scope quota/usage match is still unproven, and the
custom account's own provider quota is not read.

# Change

- `quotaUsageAttributionComparable` requires fully pseudonymous usage
  attribution, no unattributed usage, and an attributed quota observation.
- When that proof is absent, the workload reader receives no quota windows, no
  calibrated capacity, no stored account partition, and no previous plan-scoped
  workload. It still computes the recent API-equivalent USD rate and the local
  intensity grade from usage.
- `planAttribution.attribution` records `usage_matched` or
  `usage_unattributed`.
- The dashboard shows "当前套餐时段未估算" instead of a plan label, explains
  that the rate is API-equivalent rather than a plan conversion, and marks the
  quota observation as reference-only.
- `quotaUsageComparable` is projected from the companion overview to the
  browser; older snapshots default to no warning rather than inventing
  attribution.

# Verification

- `test/local-companion-data.test.js` covers all-unattributed, mixed, missing
  quota attribution, and fully attributed cases.
- `apps/web/test/overview-workload.test.mjs` covers the live shape: a Plus quota
  observation, unattributed usage, no Plus label, all work hours null, the API
  rate still visible, and both attribution notes.
- `product:local:test`: 296 passed.
- `product:ui:test`: 905 passed.
- `product:electron:test`: 589 passed, 3 skipped.
- `architecture:check`, `docs:check`, `test:preflight`,
  `i18n:browser:check`, and `i18n:electron:check`: passed.

# Live verification

An unsigned stable-metadata candidate was built from `a4404ed5` (build
`2026110602`) and launched directly from `win-unpacked` against the live stable
profile. No install, signing, updater, or publication step was run.

- First app-driven pass: `2026-11-05T21:26:47.545Z` to
  `2026-11-05T21:33:21.298Z`, about 394 s.
- Accounting: `fast_path`, `fullRebuilds = 0`, one dirty/recomputed window,
  generation `24963`.
- Overview: `quotaUsageComparable = false`,
  `planAttribution.attribution = usage_unattributed`,
  `estimationPlanType = null`, all `workHours.hours = null`.
- Recent load remained available: US$1.69/hour, light, with
  `ratePpPerHour = null`.
- The rendered workload contained no `Plus` plan label. It showed
  `当前套餐时段未估算：本地用量没有账户归属，无法确认额度观测属于同一账户。`,
  `该速率按本地用量的 API 等价价格计算，不按套餐额度折算。`, and the
  reference-only quota note.

# Remaining gates

- The quota observation still comes from the default Codex login and is kept as
  reference-only. Reading a custom account's own provider quota is a separate
  collection/configuration decision.
- Fully attributed usage still does not prove the quota and usage scopes are the
  same pseudonymous account; the current guard is conservative but not a full
  scope-equality proof.
- Installed-app, signing, NSIS lifecycle, updater, and release gates remain
  separate and were not run.
