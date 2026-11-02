---
title: Work-usage filters during refresh and partial amount label
date: 2026-11-02
type: receipt
status: verified
source_commit: e5dc4b7f
---

# Result and boundary

A named saved work-usage report now keeps search, grouping, sort and model
selection usable while its replacement is being generated. Saved rows remain
read-only, so an old row cannot start a drill-down against stale evidence.
Partial API-equivalent amounts now use the existing localized
`workUsage.partial` label instead of the missing `workUsage.amountPartial` key.

The change was rendered in the unsigned stable-metadata candidate against the
real stable profile and the real `~/.codex` source. This is not a signed
installer, installed-app qualification, normal-candidate CI journey, or release
receipt.

# Behavior

During the `savedUpdating` state:

- the saved report body stays `inert`, preserving its read-only rows;
- the search form, grouping controls, sort selector and model selector remain
  enabled when the saved report has names;
- an anonymous saved report keeps search disabled because it has no names to
  search;
- the account-scope selector stays read-only because it is tied to the saved
  snapshot.

The candidate rendered `部分数据` beneath a partial amount. The raw
`amountPartial` key no longer appears. The label is the existing
`workUsage.partial` translation in all shipped locales.

# Verification

- `node --test apps/web/test/work-usage-view.test.mjs`: 107 passed.
- `npm run product:ui:test`: 898 passed.
- Candidate source revision:
  `e5dc4b7f247e4025dccad64df2cda9b6794c35d6`.
- Production source candidate: build number `2026110202`, unsigned local
  `win-unpacked` artifact.
- Executable SHA-256:
  `364F5EA7BA065723CA37DB7F752757B0DB2F177245260D8A4E1BAAC2444EFEFF`.
- ASAR SHA-256:
  `E0CD0300C122D3B9AF44F03142A8E779085B691FF6E2B6FB676C19DBDCD0CD63`.
- Authenticode status: `NotSigned`.
- The rendered candidate was inspected through its loopback-only DevTools
  endpoint (9228). In the `savedUpdating` state, the report body was `inert`
  while the search form and model selector were not inert and their controls
  were not disabled.
- The work-usage replacement remained in `正在更新` for more than 200 seconds
  during this inspection. The controls stayed usable throughout; report
  latency is a separate performance issue.
- The previous candidate was preserved as
  `.release-build/electron-production/win32-x64/artifacts.previous-2026110201`;
  the new candidate is under `artifacts/win-unpacked`.
- The app was relaunched without a debugging port and left running against the
  real profile.

# Remaining gates

Signing, the disposable-runner normal-candidate smoke, NSIS
installation/upgrade/uninstall, owner-profile phase receipt and release or
updater publication remain separate gates. Work-usage generation latency on the
large real store remains an open performance issue.
