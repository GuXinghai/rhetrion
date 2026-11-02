---
title: X Reposts timeline loading
date: 2026-11-02
type: receipt
status: verified
source_commit: 3cf6a3c0
---

# Result and boundary

The X reader's **Reposts** tab now loads X's dedicated Reposts profile
timeline instead of filtering retweets out of the ordinary Posts timeline. The
tab previously showed an empty state because X serves reposts from
`/username/reposts` through the `UserRepostsTimeline` operation.

This was verified in the unsigned stable-metadata candidate against the real
stable profile and the real X session. It is not a signed installer,
installed-app qualification, normal-candidate CI journey, or release receipt.

# Fix

- `apps/electron/desktop-x-page-adapter.js` now navigates the Reposts tab to
  `https://x.com/<target>/reposts`.
- The network allowlist and expected operation include `UserRepostsTimeline`.
- Original repost ownership is preserved: the projected post keeps the
  original post ID and author while its kind remains `repost`.
- The existing detail view continues to load replies after a repost is opened;
  `正在加载评论` is the post-detail comments status, not the Reposts list.

# Verification

- `node --test apps/electron/test/desktop-x-page-adapter.test.mjs`: 20 passed.
- `node --test apps/electron/test/desktop-x-service.test.mjs
  apps/electron/test/desktop-x-service-lifecycle.test.mjs
  apps/web/test/x-reader.test.mjs`: 106 passed.
- Candidate source revision:
  `3cf6a3c09ed0728567b496d356ff2eb56cc6f99f`.
- Production source candidate: build number `2026110203`, unsigned local
  `win-unpacked` artifact.
- Executable SHA-256:
  `71F20CA6C6AEE957BBDE220D90365B5F8091F88523C7750AD1329336F8E1CCA3`.
- ASAR SHA-256:
  `357724AFF5CCE78164762077BB2ED3D2B1DAF3C1E3FB34E392A6F2AD5D08D620`.
- Authenticode status: `NotSigned`.
- In the rendered candidate, the Reposts tab selected 24 repost rows and no
  longer showed the empty-state message. The persisted X cache gained a
  `reposts` list with 20 entries at the time of inspection.
- Opening one repost showed the repost card immediately and `正在加载评论`
  while its replies loaded; after the replies arrived the detail contained the
  repost and its comments. Returning to the tab restored the Reposts list.
- The app was left running against the real profile.

# Remaining gates

Signing, the disposable-runner normal-candidate smoke, NSIS
installation/upgrade/uninstall, owner-profile phase receipt and release or
updater publication remain separate gates.
