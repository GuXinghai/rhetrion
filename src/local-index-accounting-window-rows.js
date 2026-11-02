import { createHash, createHmac } from "node:crypto";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { createLocalIndexAccountingScan } from "./local-index-accounting-cache.js";
import { readLocalIndexGenerationIdentity } from "./local-index-companion-source.js";
import { buildReplaySafeAccountingPeriod } from "./replay-safe-accounting-cache.js";
import { ACCOUNTING_WINDOW_MS } from "./local-index-accounting-windows.js";

const DOMAIN = "rhetrion-accounting-window-row-v1";
const MAX_WINDOWS = 4_096;

function fixedError(code) {
  return Object.assign(new Error(code), { code });
}

function normalizeKey(hmacKey) {
  if (typeof hmacKey !== "string" && !Buffer.isBuffer(hmacKey)
      && !(hmacKey instanceof Uint8Array)) {
    throw new TypeError("accounting window row HMAC key is invalid");
  }
  if (hmacKey.length === 0 || hmacKey.length > 4096) {
    throw new TypeError("accounting window row HMAC key is invalid");
  }
  return createHmac("sha256", hmacKey).update(`${DOMAIN}-key-v1`).digest();
}

function digest(value, key) {
  return createHmac("sha256", key).update(`${DOMAIN}\0`).update(JSON.stringify(value)).digest("hex");
}

function validKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/**
 * Build the derived accounting row for named UTC days and hash it. This is the
 * output-side proof for a future windowed cache; it does not merge into the
 * shipping cache or change any reader.
 *
 * Each day is scanned independently through the same accounting path used by
 * the full cache. The generation is checked before and after the pass, so a
 * concurrent commit fails closed instead of mixing generations.
 */
export async function buildAccountingWindowRows({
  indexFile,
  windowKeys,
  hmacKey,
  declaredSpeedBaselines = [],
  includePeriod = false,
  includeAccumulator = false,
  signal = null,
  now = () => Date.now(),
} = {}) {
  if (typeof indexFile !== "string" || indexFile.length === 0) {
    throw new TypeError("accounting window row indexFile is invalid");
  }
  if (!Array.isArray(windowKeys) || windowKeys.length === 0 || windowKeys.length > MAX_WINDOWS
      || windowKeys.some(key => !validKey(key))
      || new Set(windowKeys).size !== windowKeys.length) {
    throw new TypeError("accounting window row keys are invalid");
  }
  if (!Array.isArray(declaredSpeedBaselines)) {
    throw new TypeError("accounting window row baselines are invalid");
  }
  if (typeof includePeriod !== "boolean") {
    throw new TypeError("accounting window row includePeriod must be boolean");
  }
  if (typeof includeAccumulator !== "boolean") {
    throw new TypeError("accounting window row includeAccumulator must be boolean");
  }
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const key = normalizeKey(hmacKey);
  const generation = readLocalIndexGenerationIdentity({ indexFile });
  if (generation === null) throw fixedError("accounting_window_generation_unavailable");
  const scan = createLocalIndexAccountingScan({ indexFile });
  const rows = [];
  for (const windowKey of [...windowKeys].sort()) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const lowerMs = Date.parse(`${windowKey}T00:00:00.000Z`);
    const upperMs = lowerMs + ACCOUNTING_WINDOW_MS;
    const built = await buildReplaySafeAccountingPeriod({
      id: "window",
      label: "UTC day",
      startAt: new Date(lowerMs).toISOString(),
      endAt: new Date(upperMs - 1).toISOString(),
      scan,
      signal,
      declaredSpeedBaselines,
      includeAccumulator,
    });
    const current = readLocalIndexGenerationIdentity({ indexFile });
    if (current === null || String(current.id) !== String(generation.id)
        || current.fingerprint !== generation.fingerprint
        || current.calculationRevision !== generation.calculationRevision) {
      throw fixedError("accounting_window_generation_changed");
    }
    const row = {
      key: windowKey,
      lowerMs,
      upperMs,
      rowDigest: digest({ key: windowKey, lowerMs, upperMs, period: built.period }, key),
    };
    if (includePeriod) row.period = built.period;
    if (includeAccumulator) row.accumulator = built.accumulator;
    rows.push(row);
    await yieldTurn();
  }
  return {
    schemaVersion: 1,
    generation: String(generation.id),
    generationFingerprint: generation.fingerprint,
    calculationRevision: generation.calculationRevision,
    computedAtMs: Number(now()),
    rows,
  };
}
