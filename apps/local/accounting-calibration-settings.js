import {
  ACCOUNTING_CALIBRATION_DEFAULT_HOURS,
  ACCOUNTING_CALIBRATION_INTERVAL_HOURS,
} from "../../src/local-accounting-calibration-policy.js";
import {
  ACCOUNTING_CALIBRATION_SETTINGS_SCHEMA_VERSION,
  readLocalCollectorAccountingCalibrationSettings,
  writeLocalCollectorAccountingCalibrationSettings,
} from "../../src/local-collector-state.js";

function fixedError(code) {
  return Object.assign(new Error(code), { code });
}

function defaultSettings() {
  return Object.freeze({
    schemaVersion: ACCOUNTING_CALIBRATION_SETTINGS_SCHEMA_VERSION,
    intervalHours: ACCOUNTING_CALIBRATION_DEFAULT_HOURS,
    changedAtMs: null,
  });
}

function projection(settings) {
  return Object.freeze({
    intervalHours: settings.intervalHours,
    changedAtMs: settings.changedAtMs,
  });
}

/**
 * Process-local view of the owner's calibration interval. The collector state
 * file is the durable authority; this object only caches the last loaded value
 * and serializes writes so two settings changes cannot race.
 *
 * Changing the interval starts the next cycle at the change instant. Selecting
 * the already active interval is a no-op and never moves that anchor.
 */
export function createAccountingCalibrationSettingsConfiguration({
  stateFile,
  clock = () => Date.now(),
} = {}) {
  if (typeof stateFile !== "string" || stateFile.length < 1) {
    throw new TypeError("accounting calibration stateFile is invalid");
  }
  if (typeof clock !== "function") {
    throw new TypeError("accounting calibration clock must be a function");
  }
  let current = null;
  let loading = null;
  let operation = Promise.resolve();

  async function load() {
    if (current !== null) return current;
    if (loading !== null) return loading;
    loading = (async () => {
      let stored;
      try {
        stored = await readLocalCollectorAccountingCalibrationSettings({
          stateFile,
        });
      } catch {
        stored = { status: "invalid", settings: null };
      }
      current = stored.status === "available" && stored.settings !== null
        ? Object.freeze({ ...stored.settings })
        : defaultSettings();
      return current;
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }

  async function get() {
    return projection(await load());
  }

  async function setInterval(intervalHours) {
    if (!ACCOUNTING_CALIBRATION_INTERVAL_HOURS.includes(intervalHours)) {
      throw new TypeError("accounting calibration interval is invalid");
    }
    const run = operation.catch(() => {}).then(async () => {
      const prior = await load();
      if (prior.intervalHours === intervalHours) return projection(prior);
      const next = Object.freeze({
        schemaVersion: ACCOUNTING_CALIBRATION_SETTINGS_SCHEMA_VERSION,
        intervalHours,
        changedAtMs: clock(),
      });
      try {
        await writeLocalCollectorAccountingCalibrationSettings({
          stateFile,
          settings: next,
        });
      } catch {
        throw fixedError("accounting_calibration_settings_unavailable");
      }
      current = next;
      return projection(next);
    });
    operation = run.catch(() => {});
    return run;
  }

  return Object.freeze({
    get,
    setInterval,
    options: ACCOUNTING_CALIBRATION_INTERVAL_HOURS,
    defaultIntervalHours: ACCOUNTING_CALIBRATION_DEFAULT_HOURS,
  });
}
