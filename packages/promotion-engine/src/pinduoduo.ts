import { moneyFromMinorUnits, type Money, type RoundingPolicy } from '@eaw/calculation-engine';
import {
  evaluatePricingCashFlows,
  assertPricingWorkBudget,
  type CostItem,
  type PricingOutcome,
} from '@eaw/pricing-engine';
import type { RuleDefinition, RuleSnapshot } from '@eaw/rule-engine';

import { calculatePromotion } from './calculate.js';
import type { PromotionComponent, PromotionResult } from './types.js';

const MAX_SIMULATION_WORK = 2_000_000n;

export interface PinduoduoSimulationInput {
  readonly campaignPrice: Money;
  readonly components: readonly PromotionComponent[];
  readonly costs: readonly CostItem[];
  readonly rounding: RoundingPolicy;
  readonly ruleSnapshot: RuleSnapshot;
  readonly search: {
    readonly maximumMinorUnits: bigint;
    readonly minimumMinorUnits: bigint;
  };
}

export interface PinduoduoSimulationTraceStep {
  readonly inputs: Readonly<Record<string, string>>;
  readonly operation: string;
  readonly outputMinorUnits: bigint;
}

export interface PinduoduoSimulationResult {
  readonly breakEvenCampaignPrice: Money | null;
  readonly financial: PricingOutcome | null;
  readonly issues: readonly string[];
  readonly promotion: PromotionResult;
  readonly ruleSnapshotHash: string;
  readonly status: 'incomplete' | 'verified' | 'warning';
  readonly trace: readonly PinduoduoSimulationTraceStep[];
}

export function simulatePinduoduo(input: PinduoduoSimulationInput): PinduoduoSimulationResult {
  validate(input);
  const promotion = calculatePromotion({
    campaignPrice: input.campaignPrice,
    components: input.components,
    rounding: input.rounding,
  });
  const ruleCosts = platformCosts(input.ruleSnapshot);
  const issues = [
    ...input.ruleSnapshot.issues.map(({ code, key }) => `${code}:${key}`),
    ...ruleCosts.issues,
    ...input.costs
      .filter(({ status }) => status === 'missing')
      .map(({ key }) => `COST_MISSING:${key}`),
  ];
  const incomplete =
    input.ruleSnapshot.status === 'incomplete' ||
    ruleCosts.issues.length > 0 ||
    input.costs.some(({ status }) => status === 'missing');
  const promotionTrace = tracePromotion(promotion);
  if (incomplete) {
    return Object.freeze({
      status: 'incomplete',
      promotion,
      financial: null,
      breakEvenCampaignPrice: null,
      ruleSnapshotHash: input.ruleSnapshot.hash,
      issues: Object.freeze(issues),
      trace: Object.freeze(promotionTrace),
    });
  }

  const costs = [...input.costs, ...ruleCosts.costs];
  assertPricingWorkBudget(
    {
      costs,
      currency: input.campaignPrice.currency,
      goal: { type: 'break_even' },
      rounding: input.rounding,
      search: input.search,
    },
    1n,
  );
  const pricing = evaluatePromotionPricing(promotion, costs, input.rounding);
  const status =
    input.ruleSnapshot.status === 'warning' || pricing.status === 'warning'
      ? 'warning'
      : 'verified';
  const breakEvenCampaignPrice = solveBreakEven(input, costs);
  return Object.freeze({
    status,
    promotion,
    financial: pricing.outcome,
    breakEvenCampaignPrice,
    ruleSnapshotHash: input.ruleSnapshot.hash,
    issues: Object.freeze(issues),
    trace: Object.freeze([...promotionTrace, ...pricing.trace]),
  });
}

function solveBreakEven(input: PinduoduoSimulationInput, costs: readonly CostItem[]): Money | null {
  for (
    let candidate = input.search.minimumMinorUnits;
    candidate <= input.search.maximumMinorUnits;
    candidate += 1n
  ) {
    const promotion = calculatePromotion({
      campaignPrice: moneyFromMinorUnits(candidate, input.campaignPrice.currency),
      components: input.components,
      rounding: input.rounding,
    });
    const pricing = evaluatePromotionPricing(promotion, costs, input.rounding);
    if (pricing.outcome.netProfit.minorUnits >= 0n) {
      return promotion.campaignPrice;
    }
  }
  return null;
}

function evaluatePromotionPricing(
  promotion: PromotionResult,
  costs: readonly CostItem[],
  rounding: RoundingPolicy,
) {
  return evaluatePricingCashFlows({
    costs,
    currency: promotion.campaignPrice.currency,
    rounding,
    cashFlows: {
      campaign_price: promotion.campaignPrice,
      consumer_payment: promotion.consumerPayment,
      recognized_revenue: promotion.recognizedRevenue,
      merchant_settlement: promotion.merchantSettlement,
    },
  });
}

function platformCosts(snapshot: RuleSnapshot): {
  readonly costs: readonly CostItem[];
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const costs: CostItem[] = [];
  for (const [key, base, label] of [
    ['platform.commission_rate', 'recognized_revenue', '平台佣金'],
    ['platform.service_fee_rate', 'merchant_settlement', '技术服务费'],
  ] as const) {
    const rule = snapshot.rules.find((candidate) => candidate.key === key);
    const rate = rule === undefined ? null : exactRate(rule);
    if (rule === undefined || rule.status !== 'verified' || rate === null) {
      issues.push(`RULE_INCOMPLETE:${key}`);
      continue;
    }
    costs.push({
      key,
      label,
      kind: 'percentage',
      classification: 'operating',
      critical: true,
      status: 'confirmed',
      rateBasisPoints: rate,
      base,
    });
  }
  const attribution = snapshot.rules.find(
    ({ key }) => key === 'promotion.platform_subsidy_attribution',
  );
  if (
    attribution === undefined ||
    attribution.status !== 'verified' ||
    attribution.config.defaultBearer !== 'platform'
  ) {
    issues.push('RULE_INCOMPLETE:promotion.platform_subsidy_attribution');
  }
  return { costs, issues };
}

function exactRate(rule: RuleDefinition): bigint | null {
  const value = rule.config.rateBasisPoints;
  if (
    (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,4})$/u.test(value)) &&
    (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
  ) {
    return null;
  }
  const rate = BigInt(value);
  return rate <= 10_000n ? rate : null;
}

function tracePromotion(result: PromotionResult): PinduoduoSimulationTraceStep[] {
  return result.trace.map((step) => ({
    operation: `promotion:${step.componentKey}`,
    inputs: {
      kind: step.kind,
      funder: step.funder,
      eligible: String(step.eligible),
      requestedMinorUnits: step.requestedMinorUnits.toString(),
      beforeConsumerPaymentMinorUnits: step.beforeConsumerPaymentMinorUnits.toString(),
      beforeMerchantSettlementMinorUnits: step.beforeMerchantSettlementMinorUnits.toString(),
      afterMerchantSettlementMinorUnits: step.afterMerchantSettlementMinorUnits.toString(),
    },
    outputMinorUnits: step.appliedMinorUnits,
  }));
}

function validate(input: PinduoduoSimulationInput): void {
  if (input.ruleSnapshot.platformId !== 'pinduoduo') {
    throw new TypeError('Pinduoduo simulation requires a Pinduoduo rule snapshot.');
  }
  const width = input.search.maximumMinorUnits - input.search.minimumMinorUnits;
  if (
    input.search.minimumMinorUnits < 0n ||
    input.search.maximumMinorUnits < input.search.minimumMinorUnits ||
    width > 100_000n
  ) {
    throw new RangeError('Pinduoduo simulation search range is invalid or too large.');
  }
  const candidates = width + 1n;
  const work = candidates * BigInt(input.components.length + input.costs.length + 5);
  if (work > MAX_SIMULATION_WORK) {
    throw new RangeError('Pinduoduo simulation exceeds the work budget.');
  }
}
