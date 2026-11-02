export const ACCOUNTING_CALIBRATION_INTERVAL_HOURS = Object.freeze([6, 12, 24, 72, 168]);
export const ACCOUNTING_CALIBRATION_DEFAULT_HOURS = 24;
const HOUR_MS = 3_600_000;
const MAX_DATE_MS = 8_640_000_000_000_000;

function validInstant(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE_MS;
}

/**
 * Validate a persisted calibration interval. Missing or malformed values fall
 * back to the default rather than making the refresh unusable.
 */
export function normalizeAccountingCalibrationIntervalHours(value) {
  if (value === undefined || value === null) return ACCOUNTING_CALIBRATION_DEFAULT_HOURS;
  const number = typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value;
  return ACCOUNTING_CALIBRATION_INTERVAL_HOURS.includes(number)
    ? number
    : ACCOUNTING_CALIBRATION_DEFAULT_HOURS;
}

/**
 * A setting change starts the next interval from the change moment. It never
 * schedules an immediate refit. A completed refit after the change becomes the
 * later anchor, so a concurrent setting change cannot move the schedule
 * backwards.
 */
export function nextAccountingCalibrationAt({
  intervalHours,
  changedAtMs = null,
  lastRefitAtMs = null,
} = {}) {
  const hours = normalizeAccountingCalibrationIntervalHours(intervalHours);
  const changed = changedAtMs === null ? null : changedAtMs;
  const refit = lastRefitAtMs === null ? null : lastRefitAtMs;
  if (changed !== null && !validInstant(changed)) {
    throw new TypeError("accounting calibration change time is invalid");
  }
  if (refit !== null && !validInstant(refit)) {
    throw new TypeError("accounting calibration refit time is invalid");
  }
  const anchor = Math.max(changed ?? 0, refit ?? 0);
  return anchor + hours * HOUR_MS;
}

export function accountingCalibrationDue({
  nowMs,
  intervalHours,
  changedAtMs = null,
  lastRefitAtMs = null,
} = {}) {
  if (!validInstant(nowMs)) throw new TypeError("accounting calibration clock is invalid");
  return nowMs >= nextAccountingCalibrationAt({
    intervalHours, changedAtMs, lastRefitAtMs,
  });
}
