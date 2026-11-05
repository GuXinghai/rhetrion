---
title: Accounting calibration settings and manual-repair Electron inspection
date: 2026-11-05
type: receipt
status: verified
source_commit: 94cc48ab85e2b92eeb927866739ebe5e7153f0ca
---

# Result and boundary

An unsigned Windows x64 development candidate built from source revision
`94cc48ab` rendered the calibration settings card and the manual-repair surface
in the real Electron window. The launch used an isolated synthetic profile with
a content-free 60-file, 5,000-event, 30-day Codex corpus. The live stable
profile was not read or written by this launch.

This is a development-package and rendered-UI inspection. It is not installed
app, stable-profile, signing, updater, or release evidence. The repair request
was intercepted in the renderer so the server did not run a repair; server
execution remains covered by the focused route/runner tests and the
protected-copy rehearsal, not by this receipt.

# Artifact

- Source revision: `94cc48ab85e2b92eeb927866739ebe5e7153f0ca`.
- Package command: development packaging, `--format dir`, portable Node.js
  v26.2.0.
- Output: `.release-build/electron-candidates/<revision>/win32-x64/dir`.
- Executable SHA-256:
  `2b8a394b5e9517091ee0fb4811a4ab99711bd38af7ef602383a3e6a6aedf9288`.
- ASAR SHA-256:
  `015946b44ba39893b991bd0c120f8f42246bce4772d430886873ad0286eccf12`.
- The package is unsigned, unpublished, and has no updater feed.

# Calibration settings

Settings -> Data & diagnostics rendered the **额度校准** card with the five
fixed options in the selected locale:

- 每 6 小时
- 每 12 小时
- 每 24 小时（默认）
- 每 3 天
- 每 7 天

The initial selection was 24 hours. Changing the selection to 6 hours persisted
the value and displayed `下次校准从 2026/11/5 11:29:54 重新计时`; restoring 24
hours persisted that value and displayed the new change time. No immediate
refresh was enqueued by either change. The status is the change-time anchor, not
a claim that a refit ran.

# Manual repair surface

With a synthetic retained `windows` receipt present, the dashboard rendered:

- `数据截至11月5日 GMT+9 11:19`;
- a visible **重新计算** button.

The first click sent exactly one bounded request with `scope: "window"` and a
two-day inclusive span. The button label then advanced to
**重新计算相关范围**, which is the ordered second stage. The renderer
intercepted that request; no server repair was executed.

The full-rebuild dialog was opened through the same rendered element. It
displayed:

- title **完整重建**;
- copy **完整重建全部会计数据可能需要数分钟**;
- **开始重建** and **取消** actions;
- the cancel action closed the dialog.

# Limitations

The synthetic corpus has no Codex origin metadata, so the accounting reuse proof
could not produce a real freshness envelope in this profile. The retained
component used for the stale label and repair button was injected into the
dashboard response as a renderer-only fixture. This receipt therefore proves the
rendered copy, visibility, ordering, and dialog behavior, not the production
proof-to-freshness transition or a real repair outcome.

The live stable collector was inspected separately and read-only: it still has
the pre-freshness cache schema and no window cache or calibration settings, so
its first production rebuild remains an open gate.
