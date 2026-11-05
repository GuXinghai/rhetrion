import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LocalCompanionClient } from "../public/data-client.js";
import { translate } from "../public/localization.js";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const appSource = await readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8",
);

test("the repair entry and confirmation dialog are present and start hidden", () => {
  assert.match(
    html,
    /id="accounting-recalculate"[^>]*hidden[^>]*data-i18n="dashboard\.recalculate\.action"/u,
  );
  assert.match(html, /id="accounting-recalculate-dialog"/u);
  assert.match(html, /id="accounting-recalculate-confirm"/u);
  assert.match(html, /id="accounting-recalculate-cancel"/u);
  assert.match(appSource, /requestAccountingRepair/u);
  assert.match(appSource, /accountingRepairStage = repair\.scope === "window" \? "range" : "full"/u);
  assert.match(appSource, /anchorDayStartMs/u);
  assert.match(appSource, /ACCOUNTING_REPAIR_WINDOW_DAYS/u);
  assert.match(appSource, /accounting\?\.repair\?\.status === "unavailable"/u);
  assert.match(appSource, /scope: "full"/u);
});

test("recalculate copy is translated in every supported locale", () => {
  for (const locale of ["en-US", "zh-Hans", "es"]) {
    assert.notEqual(
      translate("dashboard.recalculate.action", {}, locale),
      "dashboard.recalculate.action",
    );
    assert.notEqual(
      translate("dashboard.recalculate.confirmCopy", {}, locale),
      "dashboard.recalculate.confirmCopy",
    );
    assert.notEqual(
      translate("dashboard.recalculate.busyCopy", {}, locale),
      "dashboard.recalculate.busyCopy",
    );
  }
});

test("the client sends only the bounded repair scope and range", async () => {
  const calls = [];
  const client = new LocalCompanionClient({
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return new Response(JSON.stringify({
        request: { started: true },
        refresh: {},
      }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  await client.recalculateAccounting({
    scope: "window",
    fromMs: 1_000,
    toMs: 2_000,
  });
  await client.recalculateAccounting({ scope: "full" });
  assert.equal(calls[0][0], "/api/local/refresh/recalculate");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    scope: "window",
    fromMs: 1_000,
    toMs: 2_000,
  });
  assert.equal(calls[0][1].headers["X-Usage-Monitor-Local"], "1");
  assert.deepEqual(JSON.parse(calls[1][1].body), { scope: "full" });
});
