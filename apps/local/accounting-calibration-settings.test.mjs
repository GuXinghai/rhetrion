import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProtectedFixtureDirectory } from "../../test/helpers/windows-owner-only-fixture.js";
import {
  defaultLocalCollectorStatePath,
} from "../../src/local-collector-state.js";
import {
  createAccountingCalibrationSettingsConfiguration,
} from "./accounting-calibration-settings.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "accounting-calibration-"));
  const stateDirectory = join(root, ".usage-monitor");
  if (process.platform === "win32") createProtectedFixtureDirectory(stateDirectory);
  else await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  return {
    root,
    stateFile: defaultLocalCollectorStatePath(root),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("the calibration interval persists and only moves its anchor on change", async t => {
  const value = await fixture();
  t.after(value.cleanup);
  let nowMs = 1_788_220_800_000;
  const configuration = createAccountingCalibrationSettingsConfiguration({
    stateFile: value.stateFile,
    clock: () => nowMs,
  });

  assert.deepEqual(await configuration.get(), {
    intervalHours: 24,
    changedAtMs: null,
  });
  assert.deepEqual(configuration.options, [6, 12, 24, 72, 168]);

  assert.deepEqual(await configuration.setInterval(168), {
    intervalHours: 168,
    changedAtMs: nowMs,
  });
  const anchor = nowMs;
  nowMs += 60_000;
  assert.deepEqual(
    await configuration.setInterval(168),
    { intervalHours: 168, changedAtMs: anchor },
    "selecting the active interval is a no-op",
  );
  assert.deepEqual(await configuration.setInterval(6), {
    intervalHours: 6,
    changedAtMs: nowMs,
  });

  await assert.rejects(
    configuration.setInterval(5),
    /calibration interval is invalid/u,
  );

  const reloaded = createAccountingCalibrationSettingsConfiguration({
    stateFile: value.stateFile,
    clock: () => nowMs,
  });
  assert.deepEqual(await reloaded.get(), {
    intervalHours: 6,
    changedAtMs: nowMs,
  });
});
