import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { refreshLocalIndex } from "../../src/local-index-refresh.js";
import { createWorkspace } from "../../test/helpers/local-index-facts.js";
import { startLocalCompanionServer } from "./server.js";

// The composition root always composes the v2 index. This test pins that every
// index reader the server composes reads the v2 store, with the previous index
// absent.

const RESOURCE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const HEADERS = { "X-Usage-Monitor-Local": "1" };

test("the server's readers serve the v2 store and never create the previous index", async () => {
  const workspace = createWorkspace({ variety: true, files: 12, events: 400, days: 5, seed: 61 });
  const v2File = join(workspace.state, "local-index-store-v1.sqlite");
  const v1File = join(workspace.state, "local-unified-index-v1.sqlite");
  const { existsSync } = await import("node:fs");
  let app = null;
  try {
    await refreshLocalIndex({
      codexHome: workspace.codexHome, indexFile: v2File, secretFile: workspace.secretFile, workerCount: 1,
    });
    app = await startLocalCompanionServer({
      resourceRoot: RESOURCE_ROOT,
      stateRoot: workspace.state,
      codexHome: workspace.codexHome,
      environment: { ...process.env },
      refreshRunner: async () => ({}),
      port: 0,
    });
    const base = `http://127.0.0.1:${app.port}`;
    const get = async (path) => {
      const response = await fetch(`${base}${path}`, { headers: { ...HEADERS, Origin: base } });
      return { status: response.status, body: await response.json() };
    };

    const started = await fetch(`${base}/api/local/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...HEADERS, Origin: base },
      body: JSON.stringify({ reason: "user_request" }),
    });
    assert.equal(started.status, 202);
    // This checks publication identity, not a cold-worker startup deadline.
    // Join the real refresh lifecycle rather than sampling a retained snapshot.
    await app.refresh.whenSettled();
    assert.equal(app.refresh.getStatus().status, "succeeded", JSON.stringify({
      errorCode: app.refresh.getStatus().errorCode,
      failedStep: app.refresh.getStatus().result?.failedStep,
      failureCode: app.refresh.getStatus().result?.failureCode,
    }));
    const overview = await get("/api/local/overview");
    assert.equal(overview.status, 200);
    assert.match(overview.body.accounting.generationFingerprint, /^generation-v2-[0-9a-f]{64}$/u);

    const day = 86_400_000;
    const end = Date.parse("2026-09-01T00:00:00.000Z");
    const windowed = await get(
      `/api/local/timeline/window-breakdown?from=${end - 3 * day}&to=${end}`,
    );
    assert.equal(windowed.status, 200);
    assert.equal(windowed.body.status ?? windowed.body.breakdown?.status, "available");

    const links = await get("/api/local/cache-drop-thread-links");
    assert.equal(links.status, 200);
    assert.equal(links.body.schemaVersion, "local-cache-drop-thread-links-v1");
    assert.equal(links.body.status, "available");

    assert.equal(existsSync(v1File), false, "the previous index is neither read nor created");
  } finally {
    await app?.close();
    workspace.cleanup();
  }
});
