import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createRefreshCoordinator } from "../public/refresh-coordinator.js";
import { translate } from "../public/localization.js";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("refresh notice popover stays inside the viewport", () => {
  const start = source.indexOf("function refreshNoticeLeft(");
  const end = source.indexOf("\n}\n\nfunction positionRefreshNotice", start) + 2;
  assert.ok(start >= 0 && end > start, "refresh notice positioning helper is present");
  const context = {};
  runInNewContext(`${source.slice(start, end)}
    result = [
      refreshNoticeLeft({ right: 143.42 }, 420, 958),
      refreshNoticeLeft({ right: 900 }, 420, 958),
      refreshNoticeLeft({ right: 950 }, 420, 958),
      refreshNoticeLeft({ right: 300 }, 368, 400),
    ];`, context);
  assert.deepEqual([...context.result], [16, 480, 522, 16]);
});

function publicationHarness({ refreshStatus, view = {}, events = {}, documentRef = {}, windowRef = {},
  setTimeoutRef, clearTimeoutRef }) {
  return createRefreshCoordinator({
    client: { refreshStatus },
    events: { current: () => null, cursor: () => 0, connection: () => "connected", ...events },
    view: {
      context: () => ({ dashboard: { mode: "local" } }),
      isBusy: () => false,
      analysisAllowed: () => true,
      actions() {}, statusObserved() {}, summary() {}, notice() {}, publishResult() {},
      reload: async () => true,
      ...view,
    },
    desktop: {}, lifecycle: { documentRef, windowRef }, setTimeoutRef, clearTimeoutRef,
  });
}

test("overview refresh failures use localized safe copy instead of internal codes", async () => {
  for (const locale of ["en-US", "zh-Hans", "es"]) {
    for (const statusName of ["failed", "cancelled"]) {
      const notices = [];
      const code = "codex_rollout_generation_ambiguous";
      const coordinator = publicationHarness({
        refreshStatus: async () => ({
          refresh: {
            finishedAt: `2026-10-19T10:00:0${statusName === "failed" ? "1" : "2"}.000Z`,
            status: statusName, failureCode: code, errorCode: "local_index_schema_newer",
          },
        }),
        view: { notice: notice => notices.push(notice) },
      });
      await coordinator.observeOverviewPublication();
      assert.equal(notices.length, statusName === "cancelled" ? 0 : 1);
      if (statusName === "cancelled") continue;
      assert.equal(notices[0].titleKey, "refresh.failedTitle");
      assert.equal(translate(notices[0].titleKey, {}, locale), translate("refresh.failedTitle", {}, locale));
      assert.equal(translate(notices[0].copyKey, {}, locale), translate("refresh.failedCopy", {}, locale));
      assert.equal(notices[0].kind, "error");
      assert.equal(translate(notices[0].copyKey, {}, locale).includes(code), false);
      assert.equal(translate(notices[0].copyKey, {}, locale).includes("local_index_schema_newer"), false);
    }
  }
});

test("publication events have one owner and returning to the foreground only updates age", async () => {
  const timers = [], documentListeners = [], windowListeners = [], ages = [], subscriptions = [];
  let reads = 0;
  let closed = 0;
  const pending = Promise.withResolvers();
  const coordinator = publicationHarness({
    refreshStatus: async () => { reads += 1; return pending.promise; },
    view: { foreground: () => ages.push("age") },
    events: { subscribe: fn => subscriptions.push(fn), close() { closed += 1; } },
    documentRef: { visibilityState: "visible", addEventListener: (name, callback) => documentListeners.push({ name, callback }) },
    windowRef: {
      addEventListener: (name, callback) => windowListeners.push({ name, callback }),
    },
    setTimeoutRef: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutRef() {},
  });
  coordinator.start(); coordinator.start();
  assert.equal(timers.length, 0);
  assert.equal(subscriptions.length, 1);
  assert.deepEqual(documentListeners.map(item => item.name), ["visibilitychange"]);
  assert.deepEqual(windowListeners.map(item => item.name), ["focus", "pagehide"]);
  subscriptions[0]({ connection: "connected" });
  windowListeners[0].callback(); documentListeners[0].callback();
  assert.equal(reads, 1, "focus and tab switches cannot overlap a pending status read");
  assert.equal(ages.length, 2, "evidence ages update immediately on return");
  pending.resolve({ refresh: { status: "idle", running: false } });
  await new Promise(setImmediate);
  assert.equal(timers.length, 0, "no periodic publication polling is scheduled");
  windowListeners[1].callback({ persisted: true });
  assert.equal(closed, 0, "a persisted page retains its event owner");
  windowListeners[1].callback({ persisted: false });
  assert.equal(closed, 1);
});

test("scheduler failure is distinct from unreadable status and is deduplicated until recovery", async () => {
  const notices = [], summaries = [];
  let failure = "overview_refresh_schedule_failed", disconnected = false;
  const coordinator = publicationHarness({
    refreshStatus: async () => {
      if (disconnected) throw new Error("synthetic transport failure");
      return { refresh: { status: "idle", running: false }, overviewSchedule: { errorCode: failure } };
    },
    view: { notice: notice => notices.push(notice), summary: key => summaries.push(key) },
  });
  await coordinator.observeOverviewPublication(); await coordinator.observeOverviewPublication();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].titleKey, "refresh.schedule.failedTitle");
  assert.equal(notices[0].kind, "warning");
  assert.equal(summaries.at(-1), "refresh.schedule.failedTitle");
  disconnected = true;
  await coordinator.observeOverviewPublication();
  assert.equal(notices.length, 1, "transport failure cannot create a business failure notice");
  assert.equal(coordinator.state().scheduleError, failure, "a missing read cannot establish scheduler recovery");
  disconnected = false; failure = null;
  await coordinator.observeOverviewPublication();
  assert.equal(coordinator.state().scheduleError, null);
  assert.equal(summaries.at(-1), null);
});
