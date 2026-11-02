import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNTING_CALIBRATION_DEFAULT_HOURS,
  ACCOUNTING_CALIBRATION_INTERVAL_HOURS,
  accountingCalibrationDue,
  nextAccountingCalibrationAt,
  normalizeAccountingCalibrationIntervalHours,
} from "../src/local-accounting-calibration-policy.js";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-02T12:00:00.000Z");

test("calibration interval is a closed setting with a safe default", () => {
  assert.deepEqual(ACCOUNTING_CALIBRATION_INTERVAL_HOURS, [6, 12, 24, 72, 168]);
  assert.equal(ACCOUNTING_CALIBRATION_DEFAULT_HOURS, 24);
  for (const value of ACCOUNTING_CALIBRATION_INTERVAL_HOURS) {
    assert.equal(normalizeAccountingCalibrationIntervalHours(value), value);
    assert.equal(normalizeAccountingCalibrationIntervalHours(String(value)), value);
  }
  for (const value of [undefined, null, 0, 1, 25, "24.5", Number.NaN, {}]) {
    assert.equal(normalizeAccountingCalibrationIntervalHours(value), 24);
  }
});

test("changing the interval starts timing from the change and never refreshes immediately", () => {
  const changedAtMs = NOW;
  assert.equal(nextAccountingCalibrationAt({ intervalHours: 6, changedAtMs }), changedAtMs + 6 * HOUR);
  assert.equal(accountingCalibrationDue({ nowMs: NOW, intervalHours: 6, changedAtMs }), false);
  assert.equal(accountingCalibrationDue({ nowMs: NOW + 6 * HOUR - 1, intervalHours: 6, changedAtMs }), false);
  assert.equal(accountingCalibrationDue({ nowMs: NOW + 6 * HOUR, intervalHours: 6, changedAtMs }), true);
});

test("a later completed refit becomes the anchor and cannot move backwards", () => {
  const changedAtMs = NOW;
  const lastRefitAtMs = NOW + 2 * HOUR;
  assert.equal(nextAccountingCalibrationAt({ intervalHours: 24, changedAtMs, lastRefitAtMs }),
    lastRefitAtMs + 24 * HOUR);
  assert.equal(accountingCalibrationDue({ nowMs: NOW + 25 * HOUR, intervalHours: 24,
    changedAtMs, lastRefitAtMs }), false);
  assert.equal(accountingCalibrationDue({ nowMs: lastRefitAtMs + 24 * HOUR, intervalHours: 24,
    changedAtMs, lastRefitAtMs }), true);
});

test("a missing schedule is immediately due, while an invalid clock fails closed", () => {
  assert.equal(accountingCalibrationDue({ nowMs: NOW, intervalHours: 24 }), true);
  assert.throws(() => nextAccountingCalibrationAt({ intervalHours: 24, changedAtMs: -1 }),
    { name: "TypeError" });
  assert.throws(() => accountingCalibrationDue({ nowMs: Number.NaN, intervalHours: 24 }),
    { name: "TypeError" });
});
