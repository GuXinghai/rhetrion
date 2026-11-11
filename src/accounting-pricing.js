import {
  ACCOUNTING_AGENT_SCOPES as AGENT_SCOPES,
  ACCOUNTING_API_TIERS as API_TIERS,
  ACCOUNTING_COMPONENT_KEYS as COMPONENT_KEYS,
  ACCOUNTING_LINEAGE_KINDS as LINEAGE,
  ACCOUNTING_SPARK_MODEL as SPARK_MODEL,
  ACCOUNTING_SPEED_MODES as SPEEDS,
  ACCOUNTING_SURFACES as SURFACES,
  accountingError as fixedError,
  accountingModel as safeModel,
  accountingTokenTotal as tokenTotal,
  addAccountingComponents as addComponents,
  canonicalAccountingInstant as canonicalInstant,
  emptyAccountingComponents as emptyComponents,
} from "./accounting-values.js";
import {
  codexModelAllowanceTrack,
  codexModelApiPriceEquivalentApplicable,
  codexModelPricingStatus,
} from "./export/index.js";
import {
  APP_OFFICIAL_PRICE_CARDS,
  priceCodexUsageEvent,
  speedModeModelFamilyKey,
} from "@app-usagemonitor/accounting";

// Shared accounting pricing; exact scaled evidence has one private owner.

const FAST_PRICE_SCALE = 1_000_000_000;

function scaledUsdString(value) {
  if (!Number.isSafeInteger(value) || value <= 0) return "0";
  const whole = Math.floor(value / FAST_PRICE_SCALE);
  const fraction = String(value % FAST_PRICE_SCALE).padStart(9, "0");
  return `${whole}.${fraction}`.replace(/\.?0+$/u, "");
}

const SCALED_TOTAL = Symbol("pricedUsdScaledTotals");

function safeEnum(value, allowed) {
  return allowed.has(value) ? value : "unknown";
}

// Exported for the unified-index companion read: one memoized unit-price plan
// per (model, context band, effective date), integer-scaled per event, falling
// back to the full pricer whenever a plan cannot be proven exact. This is the
// same pricer the replay-safe cache itself accounts with.
function createAccountingPricer({ apiServiceTier = "standard" } = {}) {
  const plans = new Map();
  const contextFloors = new Map();
  const priceObservedComponents = (event, components) => {
    // Incomplete observations need the full ledger's coverage and context
    // checks. Zero-filled display totals cannot establish an exact unit plan.
    if (COMPONENT_KEYS.some((name) => (
      components[name] === null
      || event.componentAvailability?.[name] === false
      || (name.startsWith("input_") && !Number.isSafeInteger(components[name]))
    ))) {
      return priceCodexUsageEvent({ ...event, components }, {
        apiServiceTier, priceEpochBasis: "event_time",
      });
    }
    // Derive the threshold across the model's public reviewed cards. A tier
    // can omit a long-context card; that missing band must still reach the
    // kernel rather than reusing the tier's short-context template.
    // Older models begin
    // the long band at 272,000; GPT6 models begin at 272,001. The representative
    // template must itself belong to the keyed band.
    if (!contextFloors.has(event.model)) {
      const floors = new Set(APP_OFFICIAL_PRICE_CARDS
        .filter((card) => card.provider === "openai"
          && (card.model === event.model || card.aliases?.includes(event.model)))
        .flatMap((card) => card.components
          .filter((component) => component.unit === "token")
          .map((component) => component.conditions?.min_total_input_tokens)
          .filter((floor) => floor !== undefined)
          .map(Number)));
      contextFloors.set(event.model, floors.size === 1
        ? [...floors][0] : floors.size === 0 ? Infinity : null);
    }
    const contextFloor = contextFloors.get(event.model);
    if (contextFloor === null) {
      return priceCodexUsageEvent({ ...event, components }, {
        apiServiceTier, priceEpochBasis: "event_time",
      });
    }
    const suppliedTotal = event.totalInputContextTokens
      ?? (event.rawAvailability === undefined || event.rawAvailability?.input_tokens === true
        ? event.raw?.input_tokens : null);
    const reportedTotal = suppliedTotal === undefined || suppliedTotal === null
      ? null : Number(suppliedTotal);
    if (reportedTotal !== null && (!Number.isSafeInteger(reportedTotal) || reportedTotal < 0)) {
      return priceCodexUsageEvent({ ...event, components }, {
        apiServiceTier, priceEpochBasis: "event_time",
      });
    }
    const inputSum = (components.input_uncached_tokens ?? 0)
      + (components.input_cache_read_tokens ?? 0)
      + (components.input_cache_write_tokens ?? 0);
    const contextBand =
      (reportedTotal ?? inputSum) >= contextFloor
        ? "long"
        : "short";
    // Keep the effective date in the fast-plan key: official price cards may
    // change by date, and a later plan must never price an earlier event.
    const effectiveDate = canonicalInstant(event.timestamp)?.slice(0, 10)
      ?? "missing_timestamp";
    const key = `${event.model}\0${contextBand}\0${effectiveDate}`;
    let plan = plans.get(key);
    if (plan === undefined) {
      const templateComponents = Object.fromEntries(
        COMPONENT_KEYS.filter(name => name !== "output_combined_tokens")
          .map((name) => [name, 1]),
      );
      const template = priceCodexUsageEvent({
        ...event,
        totalInputContextTokens:
          contextBand === "long" ? contextFloor : 0,
        components: templateComponents,
      }, {
        apiServiceTier,
        priceEpochBasis: "event_time",
      });
      // Keep only rows whose unit price is proven exact. The per-event loop
      // below falls back to the full pricer the moment an event actually USES
      // a component that has no such row, so a partially priced card — Codex
      // never prices cache writes, for example — still yields a fast plan for
      // the events that never touch the unpriced component. The previous
      // all-components gate nullified every Codex plan and silently sent the
      // entire corpus down the slow path.
      const rows = new Map(template.components
        .filter((row) => (
          typeof row.unitPriceUsd === "string"
          && /^\d+(?:\.\d{1,9})?$/u.test(row.unitPriceUsd)
        ))
        .map((row) => [row.name, row]));
      plan = ["fully_priced", "partially_priced"].includes(
        template.coverageStatus,
      ) && rows.size > 0
        ? {
          rows,
          // A fast-priced event uses only fully priced components, so the
          // template's unpriced-component warnings do not describe it. The
          // coverage list mirrors the full pricer's warnings object; identity
          // provenance such as an explicit alias remains informative.
          warnings: template.coverageStatus === "fully_priced"
            ? template.warnings
            : { coverage: [], informational: template.warnings.informational },
          selectedPriceCardIds: template.selectedPriceCardIds,
        }
        : null;
      plans.set(key, plan);
    }
    if (plan === null) {
      return priceCodexUsageEvent({
        ...event,
        components,
      }, {
        apiServiceTier,
        priceEpochBasis: "event_time",
      });
    }
    const pricedComponents = [];
    const priceCardBreakdown = new Map();
    const cardScaled = new Map();
    let totalUsdScaled = 0;
    for (const name of COMPONENT_KEYS) {
      const quantity = components[name] ?? 0;
      if (!Number.isSafeInteger(quantity) || quantity <= 0) continue;
      const template = plan.rows.get(name);
      if (!template || typeof template.unitPriceUsd !== "string") {
        return priceCodexUsageEvent({
          ...event,
          components,
        }, {
          apiServiceTier,
          priceEpochBasis: "event_time",
        });
      }
      const unitPriceScaled = Math.round(
        Number(template.unitPriceUsd) * FAST_PRICE_SCALE,
      );
      const costUsdScaled = unitPriceScaled * quantity;
      if (!Number.isSafeInteger(costUsdScaled)
          || !Number.isSafeInteger(
            totalUsdScaled + costUsdScaled,
          )) {
        return priceCodexUsageEvent({
          ...event,
          components,
        }, {
          apiServiceTier,
          priceEpochBasis: "event_time",
        });
      }
      totalUsdScaled += costUsdScaled;
      pricedComponents.push({
        name,
        pricedAs: template.pricedAs,
        quantity: String(quantity),
        unit: template.unit,
        pricingStatus: "priced",
        unitPriceUsd: template.unitPriceUsd,
        costUsd: scaledUsdString(costUsdScaled),
        priceCardId: template.priceCardId,
      });
      // Per-card cost is the exact sum of this event's integer-scaled
      // component costs; format it once instead of folding decimal strings.
      // (totalUsdScaled is proven safe above, and each card's sum is a part
      // of it.)
      cardScaled.set(
        template.priceCardId,
        (cardScaled.get(template.priceCardId) ?? 0) + costUsdScaled,
      );
      if (!priceCardBreakdown.has(template.priceCardId)) {
        priceCardBreakdown.set(template.priceCardId, {
          priceCardId: template.priceCardId,
          events: 1,
          costUsd: "0",
        });
      }
    }
    for (const [priceCardId, scaled] of cardScaled) {
      priceCardBreakdown.get(priceCardId).costUsd = scaledUsdString(scaled);
    }
    const priced = {
      totalUsd: scaledUsdString(totalUsdScaled),
      coverageStatus: "fully_priced",
      components: pricedComponents,
      selectedPriceCardIds: plan.selectedPriceCardIds,
      priceCardBreakdown: [...priceCardBreakdown.values()].sort(
        (left, right) => left.priceCardId.localeCompare(right.priceCardId),
      ),
      warnings: plan.warnings,
    };
    // Integer-scaled totals for the exact-ledger fast lane (see addExactUsd).
    // Non-enumerable: the priced shape callers see and serialize is unchanged.
    Object.defineProperty(priced, SCALED_TOTAL, {
      value: { totalUsd: totalUsdScaled, byCard: cardScaled },
      enumerable: false,
    });
    return priced;
  };
  const price = (event, components) => {
    const priced = priceObservedComponents(event, components);
    if (!event.pricingEvidenceIncomplete || priced.coverageStatus !== "fully_priced") return priced;
    return {
      ...priced,
      coverageStatus: priced.components.some(row => row.pricingStatus === "priced" && Number(row.quantity) > 0)
        ? "partially_priced" : "unpriced",
      warnings: {
        ...priced.warnings,
        coverage: [...(priced.warnings?.coverage ?? []), {
          code: "component_observation_unavailable",
          message: "Source component evidence was partial or contradictory; observed component estimates remain additive.",
        }],
      },
    };
  };
  const tierPricers = new Map();
  price.forApiTier = (tier, event, components) => {
    if (tier === apiServiceTier) return price(event, components);
    if (!tierPricers.has(tier)) tierPricers.set(tier, createAccountingPricer({ apiServiceTier: tier }));
    return tierPricers.get(tier)(event, components);
  };
  return price;
}

function eventProjection(event, price) {
  // Aggregate quantities are already summed. Weight only occurrence counters;
  // pricing, components and exact-money additions still run exactly once.
  const eventCount = event.eventCount ?? 1;
  if (!Number.isSafeInteger(eventCount) || eventCount < 1) {
    throw fixedError("accounting_usage_group_invalid");
  }
  const components = emptyComponents();
  addComponents(components, event.components);
  const separatedOutput = components.output_text_tokens
    + components.output_reasoning_tokens;
  // Prefer the more informative non-overlapping split when both the split and
  // a combined alias are present. A combined-only count is preserved for
  // display, but normalized to ordinary output solely for API pricing.
  if (components.output_combined_tokens > 0 && separatedOutput > 0) {
    components.output_combined_tokens = 0;
  }
  const totalTokens = tokenTotal(components);
  if (totalTokens === 0) return null;
  const model = safeModel(event.model);
  const combinedOnly = components.output_combined_tokens > 0;
  const pricingComponents = { ...event.components };
  const pricingAvailability = { ...event.componentAvailability };
  // An unselected aggregate alias is not a missing independent quantity.
  delete pricingComponents.output_combined_tokens;
  delete pricingAvailability.output_combined_tokens;
  if (combinedOnly) {
    pricingComponents.output_text_tokens = components.output_combined_tokens;
    pricingComponents.output_reasoning_tokens = 0;
    pricingAvailability.output_text_tokens = true;
    pricingAvailability.output_reasoning_tokens = true;
  }
  let priced;
  try {
    priced = price({
      ...event,
      model,
      componentAvailability: pricingAvailability,
    }, pricingComponents);
    if (combinedOnly) {
      priced = {
        ...priced,
        components: priced.components.map((row) => (
          row.name === "output_text_tokens"
            ? {
              ...row,
              name: "output_combined_tokens",
              pricedAs: "output_text_tokens",
            }
            : row
        )),
      };
    }
  } catch {
    priced = {
      totalUsd: "0",
      coverageStatus: "unpriced",
      components: [],
    };
  }
  const cost = Number(priced.totalUsd);
  return {
    timestamp: event.timestamp,
    eventCount,
    model,
    fastModeFamily: speedModeModelFamilyKey(model, event.tierSemantics?.codexSpeedMode, {
      eventTime: event.timestamp,
      standardPriceCardIds: priced.selectedPriceCardIds ?? [],
    }),
    modelPricingStatus: codexModelPricingStatus(event.model),
    modelAllowanceTrack: codexModelAllowanceTrack(event.model),
    modelApiPriceEquivalentApplicable:
      codexModelApiPriceEquivalentApplicable(event.model),
    isSpark: model === SPARK_MODEL,
    components,
    totalTokens,
    priced,
    speedPricingEvent: { ...event, model, componentAvailability: pricingAvailability },
    speedPricingComponents: pricingComponents,
    speedPricer: price.forApiTier,
    combinedOnly,
    apiPriceEquivalentUsd: Number.isFinite(cost) && cost >= 0 ? cost : 0,
    pricingCoverageStatus: ["fully_priced", "partially_priced"].includes(
      priced.coverageStatus,
    )
      ? priced.coverageStatus
      : "unpriced",
    speed: safeEnum(event.tierSemantics?.codexSpeedMode, SPEEDS),
    apiServiceTier: safeEnum(
      event.tierSemantics?.apiServiceTier,
      API_TIERS,
    ),
    surface: safeEnum(event.surfaceClassification?.surface, SURFACES),
    agentScope: safeEnum(
      event.surfaceClassification?.agentScope,
      AGENT_SCOPES,
    ),
    lineage: safeEnum(
      event.surfaceClassification?.lineageDisposition,
      LINEAGE,
    ),
  };
}

function pricedAccountingScaledTotals(priced) {
  return priced?.[SCALED_TOTAL] ?? null;
}

export {
  createAccountingPricer,
  eventProjection as projectAccountingUsageEvent,
  pricedAccountingScaledTotals,
};
