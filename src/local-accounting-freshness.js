// The freshness envelope is shared by the accounting cache validator, the
// browser projection, and the fast-path composer. Keep it in a neutral module
// so the cache layer can validate it without importing the fast path (which
// itself imports the cache layer).
export const LOCAL_ACCOUNTING_FRESHNESS_VERSION =
  "local-accounting-freshness-v1";

export const LOCAL_ACCOUNTING_FRESHNESS_COMPONENTS = Object.freeze([
  "windows",
  "timeline",
  "quota",
  "calibration",
  "weeklyApiIntervals",
  "planScope",
]);

const COMPONENT_STATUSES = new Set(["exact", "retained"]);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

function canonicalInstant(value) {
  if (typeof value !== "string" || value.length > 32) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? value
    : null;
}

/**
 * Validate the freshness envelope that a fast-path cache publishes.
 *
 * A cache written before the envelope existed has no `freshness` property and
 * remains readable; that cache is simply not fast-path eligible. Once the
 * property is present, every component and every proof the fast path relies on
 * must be complete. Partial markers are rejected rather than inferred.
 */
export function validAccountingFreshness(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.schemaVersion !== LOCAL_ACCOUNTING_FRESHNESS_VERSION) {
    return false;
  }
  for (const name of LOCAL_ACCOUNTING_FRESHNESS_COMPONENTS) {
    const component = value[name];
    if (!component || typeof component !== "object"
        || Array.isArray(component)
        || !COMPONENT_STATUSES.has(component.status)
        || canonicalInstant(component.asOf) === null) {
      return false;
    }
    if (component.coveredTo !== undefined
        && canonicalInstant(component.coveredTo) === null) {
      return false;
    }
  }
  const windows = value.windows;
  if (!DIGEST_PATTERN.test(windows.digest)
      || !DIGEST_PATTERN.test(windows.basisFingerprint)
      || !Number.isSafeInteger(windows.calculationRevision)
      || windows.calculationRevision < 0) {
    return false;
  }
  if (value.timeline.rescanFromAt !== undefined
      && canonicalInstant(value.timeline.rescanFromAt) === null) {
    return false;
  }
  if (value.provenance !== null && value.provenance !== undefined
      && (typeof value.provenance !== "object"
        || Array.isArray(value.provenance))) {
    return false;
  }
  return true;
}
