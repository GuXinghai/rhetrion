import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { compareProjections } from "./helpers/local-index-report-diff.js";
import { GOLDEN_CLOCKS, readGoldenViewsFromStore } from "./helpers/local-index-goldens.js";
import { SPEED_REPORT_FIELDS } from "./helpers/local-index-pricing-oracle.js";

// The committed views are what the shipping (v1) implementation produced for
// one synthetic corpus at commit cf94e9a8. They keep the successor held to it
// after the implementation is removed. See the README beside the fixture.

const frozenBytes = readFileSync(
  new URL("./fixtures/local-index-goldens/views.json", import.meta.url),
);
const golden = JSON.parse(frozenBytes.toString("utf8"));
let views;
const readViews = () => views ??= readGoldenViewsFromStore();

// These reviewed cache-analysis fields changed meaning after the v1 fixture.
// Keep its unchanged counts, coverage, token amounts and root metadata exact.
// All replaced fields (including full breakdowns/recent rows) are independently
// priced below with the exact candidate reader and public per-event ledger.
// Never remove an entire impact or use a wildcard: unknown fields must fail.
const REPRICED_CACHE_FIELDS = Object.freeze([
  "pricedDrops", "unpricedDrops", "estimatedPremiumUsd", "estimatedPremiumUsdExact",
  "standardApiPremiumUsd", "allowanceWeighting", "coveredSubtotal",
  "estimateEvidence", "observationUnits",
  "byChangeType", "byGapBand", "byOutcomeBucket", "byModel", "recent",
]);
const CACHE_IMPACTS = ["cacheSwitchImpact", "cacheContinuityImpact"];
const CURRENT_BASIS_FAMILY = "codex_primary:speed_priced_api_equivalent:v5:published_speed_card_ratio_2026_09_29:event_time:observed_declared_scenario";

// The accepted desktop-policy decision versioned these metadata fields and
// publishes only the selected scenario. Express that contract with literals in
// the expected view, never by stripping versions from the actual result. The
// removed Fast calibration is still checked through the public summary below.
function currentLayerContract(frozenLayer) {
  const { weeklyCalibration, ...expected } = structuredClone(frozenLayer);
  void weeklyCalibration;
  const capacity = expected.allowanceCapacityByScenario;
  capacity.schemaVersion = "codex-primary-allowance-capacity-v0.2";
  capacity.basisFamilyId = CURRENT_BASIS_FAMILY;
  capacity.planScope.basisFamilyId = CURRENT_BASIS_FAMILY;
  capacity.planScope.basisId = `${CURRENT_BASIS_FAMILY}:unresolved_as_standard`;
  Object.assign(capacity.scenarios.unresolved_as_standard.basis, {
    version: 5, basisFamilyId: CURRENT_BASIS_FAMILY,
    basisId: `${CURRENT_BASIS_FAMILY}:unresolved_as_standard`,
  });
  delete capacity.scenarios.unresolved_as_fast;
  capacity.unknownSpeedPolicy = { mode: "standard", customFastRatioBps: null };
  capacity.selectedScenario = "unresolved_as_standard";
  expected.planScopedTimeline.schemaVersion = "local-plan-scoped-accounting-timeline-v2";
  expected.planScopedTimeline.encoding = "plan_bucket_v2";
  return expected;
}

function desktopWeeklyContract(frozenSummary) {
  const expected = structuredClone(frozenSummary);
  for (const population of [expected, ...expected.planPopulations]) {
    population.status = "insufficient_evidence";
    population.estimate = null;
    population.validation.selectedCostBasis = "speed_lower";
    population.validation.sameResetHoldoutMeanAbsoluteErrorPercentagePoints = null;
    population.sourceCounts.qualifyingResetValues = 0;
    population.recentResets = [];
  }
  return expected;
}

function standardReportView(report) {
  const copy = structuredClone(report);
  for (const period of copy.usage) {
    for (const group of [period, period.spark]) {
      for (const row of [group, ...group.byModel, ...group.modelUsage]) {
        for (const field of SPEED_REPORT_FIELDS) delete row[field];
        for (const field of ["speedWeighting", "declaredSpeedWeighting"]) {
          for (const cells of Object.values(row[field] ?? {})) {
            if (!Object.hasOwn(cells, "gpt-6.1-terra")) continue;
            assert.deepEqual(cells["gpt-6.1-terra"], { events: 0, apiPriceEquivalentUsd: 0 },
              "this frozen corpus has no Terra evidence; a nonzero new cell cannot be projected away");
            delete cells["gpt-6.1-terra"];
          }
        }
      }
    }
  }
  for (const field of CACHE_IMPACTS) {
    for (const period of copy[field].periods) {
      for (const key of REPRICED_CACHE_FIELDS) delete period[key];
    }
  }
  return copy;
}

function speedFields(row) {
  return Object.fromEntries(SPEED_REPORT_FIELDS.filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]]));
}

function expectSame(label, expected, actual, minimumValues) {
  const differences = [];
  const stats = { money: 0, exact: 0 };
  compareProjections(expected, actual, "$", differences, stats);
  assert.deepEqual(
    differences.slice(0, 8),
    [],
    `${label}: ${differences.length} differences over ${stats.exact} exact and ${stats.money} money values`,
  );
  assert.ok(stats.exact + stats.money >= minimumValues, `${label}: compared ${stats.exact + stats.money} values`);
}

test("the historical fixture and public synthetic identity input stay pinned", async () => {
  assert.equal(createHash("sha256").update(frozenBytes).digest("hex"),
    "c1c98d993313dd391c7cadd01af200feaa5a5cc47a401f1b39f473a29fb33cdd");
  assert.equal((await readViews()).syntheticSalt,
    "807f5447e3dc069353223ccb3034b98c2b3195af9be869a45b8ffd75b5d8f818");
});

test("unchanged Standard report fields remain frozen across reviewed catalog and cache-analysis changes", async () => {
  const actual = await readViews();
  assert.equal(actual.corpus, golden.corpus, "the generator still produces the corpus the goldens were made from");
  for (const [name] of GOLDEN_CLOCKS) {
    expectSame(`Standard report at ${name}`, standardReportView(golden.reports[name]), standardReportView(actual.reports[name]), 400);
  }
});

test("the historical report projection rejects new fields, changed retained totals and nonzero Terra evidence", async () => {
  const actual = await readViews();
  const name = GOLDEN_CLOCKS[0][0];
  const expected = standardReportView(golden.reports[name]);
  for (const change of [
    report => { report.cacheSwitchImpact.periods[0].cacheReadDrops += 1; },
    report => { report.cacheContinuityImpact.periods[0].unexpectedField = true; },
    report => { report.cacheSwitchImpact.unexpectedField = true; },
    report => { report.usage[0].events += 1; },
  ]) {
    const changed = structuredClone(actual.reports[name]);
    change(changed);
    const differences = [];
    compareProjections(expected, standardReportView(changed), "$", differences);
    assert.ok(differences.length > 0);
  }
  const changed = structuredClone(actual.reports[name]);
  changed.usage[0].speedWeighting.standard["gpt-6.1-terra"].events = 1;
  assert.throws(() => standardReportView(changed), { code: "ERR_ASSERTION" });
});

test("current cache-impact amounts, coverage and full breakdowns equal exact per-event public pricing", async () => {
  const actual = await readViews();
  for (const [name] of GOLDEN_CLOCKS) {
    for (const key of CACHE_IMPACTS) {
      expectSame(`${name}/${key}`, actual.cacheImpactOracles[name][key], actual.reports[name][key], 100);
    }
    for (const period of actual.reports[name].usage) {
      for (const group of [period, period.spark]) {
        for (const field of ["speedWeighting", "declaredSpeedWeighting"]) {
          for (const mode of ["standard", "fast", "ultrafast", "unknown"]) {
            assert.deepEqual(group[field][mode]["gpt-6.1-terra"], { events: 0, apiPriceEquivalentUsd: 0 });
          }
        }
      }
    }
  }
});

test("historical Standard work identities remain frozen across project-policy changes", async () => {
  const actual = await readViews();
  for (const [name] of GOLDEN_CLOCKS)
    expectSame(`per-event Standard work at ${name}`, golden.work[name], actual.standardWork[name], 40);
});

test("historical calibration stays frozen and remaining layer fields match the explicit desktop version contract", async () => {
  const actual = await readViews();
  for (const name of ["no-ledger", "ledger"]) {
    const historical = golden.layers[name].weeklyCalibration;
    const { weeklyCalibration: desktop, ...remaining } = actual.layers[name];
    void desktop;
    expectSame(`Standard calibration (${name})`, historical, actual.standardCalibration[name], 100);
    expectSame(`historical Fast calibration (${name})`,
      golden.layers[name].allowanceCapacityByScenario.scenarios.unresolved_as_fast.calibration,
      actual.historicalFastCalibration[name], 80);
    expectSame(`remaining calibration layer (${name})`, currentLayerContract(golden.layers[name]), remaining, 200);
  }
});

test("desktop Standard resolves only unknown speed and retains unavailable observed Ultrafast evidence", async () => {
  const actual = await readViews();
  for (const name of ["no-ledger", "ledger"]) {
    const current = actual.layers[name].weeklyCalibration;
    expectSame(`desktop default calibration (${name})`, desktopWeeklyContract(golden.layers[name].weeklyCalibration), current, 100);
    assert.ok(actual.calibrationEvidence[name].observedUltrafastEvents > 0);
    assert.ok(actual.calibrationEvidence[name].unavailableLowerBoundaries > 0);
    assert.equal(current.validation.selectedCostBasis, "speed_lower");
    assert.equal(current.status, "insufficient_evidence");
    assert.equal(current.estimate, null);
    assert.equal(current.sourceCounts.qualifyingResetValues, 0);
    assert.deepEqual(current.recentResets, []);
    for (const population of current.planPopulations) {
      assert.equal(population.validation.selectedCostBasis, "speed_lower");
    }
    assert.equal(actual.standardCalibration[name].validation.selectedCostBasis, "standard_api");
    assert.equal(actual.standardCalibration[name].sourceCounts.qualifyingResetValues, 2);
    assert.equal(actual.standardCalibration[name].status, "estimated");
  }
});

test("speed-tier report totals, provenance, model amounts and components equal the per-event ledger", async () => {
  const actual = await readViews();
  const differences = [];
  const stats = { money: 0, exact: 0 };
  for (const [name] of GOLDEN_CLOCKS) {
    for (const period of actual.reports[name].usage) {
      const expected = actual.speedReports[name][period.id];
      for (const [label, group, reference] of [["normal", period, expected], ["Spark", period.spark, expected.spark]]) {
        const expectedModels = reference.byModel;
        const expectedAliases = label === "normal" ? { ...reference.byModel, ...expected.spark.byModel } : reference.byModel;
        compareProjections({ ...speedFields(reference), byModel: expectedModels, modelUsage: expectedAliases }, {
          ...speedFields(group),
          byModel: Object.fromEntries(group.byModel.map((row) => [row.model, speedFields(row)])),
          modelUsage: Object.fromEntries(group.modelUsage.map((row) => [row.model, speedFields(row)])),
        }, `${name}/${period.id}/${label}`, differences, stats);
      }
    }
  }
  assert.deepEqual(differences.slice(0, 8), [], `${differences.length} speed-tier differences across both clocks and every period/model/component`);
});

test("every speed-priced work cell and coverage count equals independent per-event pricing", async () => {
  const actual = await readViews();
  const differences = [];
  const stats = { money: 0, exact: 0 };
  for (const [name] of GOLDEN_CLOCKS) {
    compareProjections(actual.speedWork[name], actual.work[name], `speed-priced work at ${name}`, differences, stats);
    for (const id of ["24h", "7d", "30d", "all"]) {
      const before = golden.work[name][id];
      const after = actual.work[name][id];
      assert.deepEqual(after.scopes, before.scopes, "pricing cannot change scope event counts");
      for (const [scope, snapshot] of Object.entries(after.snapshots)) {
        for (const key of ["events", "tokens", "incomplete"]) {
          assert.equal(snapshot.totals[key], before.snapshots[scope].totals[key], `${name}/${id}/${key}`);
        }
      }
    }
  }
  assert.deepEqual(differences.slice(0, 8), [], `${differences.length} speed-priced cell/coverage differences across both clocks`);
});

test("the goldens exercise the price-sensitive branches", () => {
  const everything = golden.reports["after-the-corpus"].usage.find((period) => period.id === "all");
  assert.ok(everything.priceCardIds.some((id) => id.includes(":long")), "long-context card");
  assert.ok(everything.spark.events > 0, "Spark track");
  assert.ok(everything.pricingCoverage.unpricedEvents > 0, "an unpriced model");
  for (const speed of ["standard", "fast", "ultrafast", "unknown"]) {
    assert.ok(everything.bySpeed[speed].events > 0, `observed speed ${speed}`);
  }
  const declared = Object.values(everything.declaredSpeedWeighting)
    .flatMap((row) => Object.values(row));
  assert.ok(declared.some((cell) => cell.events > 0), "the declared ledger covered events");
  assert.ok(golden.layers.ledger.weeklyCalibrationInput.retainedUsageEvents > 1_000);
});
