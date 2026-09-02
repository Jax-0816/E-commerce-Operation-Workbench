import {
  divideAndRound,
  evaluateFormula,
  moneyFromMinorUnits,
  type Money,
  type RoundingPolicy,
} from '@eaw/calculation-engine';

import {
  MAX_EXHAUSTIVE_SEARCH_WIDTH,
  assertPricingWorkBudget,
  solveBreakEven,
  solvePricingGoal,
} from './solver.js';
import type {
  CostItem,
  PercentageBase,
  PercentageCostItem,
  PricingCashFlowInput,
  PricingCashFlowResult,
  PricingInput,
  PricingOutcome,
  PricingResult,
  PricingTraceStep,
} from './types.js';

export function calculatePricing(input: PricingInput): PricingResult {
  validatePricingInput(input);
  const inputSummary = summarizeInputs(input.costs);
  const hasCriticalMissing = input.costs.some(
    ({ critical, status }) => critical && status === 'missing',
  );
  const status =
    inputSummary.missing.length > 0
      ? 'incomplete'
      : inputSummary.estimated.length > 0
        ? 'warning'
        : 'verified';

  if (hasCriticalMissing) {
    const { outcome, trace } = evaluatePricingCandidate(input, input.search.minimumMinorUnits);
    return {
      status,
      inputSummary,
      outcome,
      trace,
      prices: { breakEven: null, minimumSafe: null, target: null, recommended: null },
    };
  }

  const breakEven = solveBreakEven(input);
  const target = input.goal.type === 'break_even' ? breakEven : solvePricingGoal(input, input.goal);
  const trace =
    input.goal.type === 'break_even' ? target.trace : [...breakEven.trace, ...target.trace];
  return {
    status,
    inputSummary,
    outcome: target.outcome,
    trace,
    prices: {
      breakEven: breakEven.price,
      minimumSafe: breakEven.price,
      target: target.price,
      recommended: target.price,
    },
  };
}

export function evaluatePricingCandidate(
  input: PricingInput,
  priceMinorUnits: bigint,
): { readonly outcome: PricingOutcome; readonly trace: readonly PricingTraceStep[] } {
  const price = moneyFromMinorUnits(priceMinorUnits, input.currency);
  const cashFlows: CandidateCashFlows = {
    campaign_price: price,
    consumer_payment: price,
    recognized_revenue: price,
    merchant_settlement: price,
  };
  return evaluateCashFlows(input.costs, input.currency, input.rounding, cashFlows);
}

export function evaluatePricingCashFlows(input: PricingCashFlowInput): PricingCashFlowResult {
  validatePricingInput({
    costs: input.costs,
    currency: input.currency,
    goal: { type: 'break_even' },
    rounding: input.rounding,
    search: { minimumMinorUnits: 0n, maximumMinorUnits: 0n },
  });
  for (const money of Object.values(input.cashFlows)) {
    if (money.currency !== input.currency) {
      throw new TypeError('Pricing cash-flow currency is invalid.');
    }
  }
  const inputSummary = summarizeInputs(input.costs);
  const status =
    inputSummary.missing.length > 0
      ? 'incomplete'
      : inputSummary.estimated.length > 0
        ? 'warning'
        : 'verified';
  return {
    status,
    inputSummary,
    ...evaluateCashFlows(input.costs, input.currency, input.rounding, input.cashFlows),
  };
}

function evaluateCashFlows(
  costs: readonly CostItem[],
  currency: string,
  rounding: RoundingPolicy,
  cashFlows: CandidateCashFlows,
): { readonly outcome: PricingOutcome; readonly trace: readonly PricingTraceStep[] } {
  let costOfGoods = 0n;
  let operatingCosts = 0n;
  const trace: PricingTraceStep[] = [];
  const evaluatedCosts: { readonly cost: CostItem; readonly amount: Money }[] = [];

  const evaluationInput = {
    costs,
    currency,
    goal: { type: 'break_even' },
    rounding,
    search: { minimumMinorUnits: 0n, maximumMinorUnits: 0n },
  } as const;
  for (const cost of costs) {
    const amount = evaluateCost(cost, evaluationInput, cashFlows);
    evaluatedCosts.push({ cost, amount });
    if (cost.classification === 'cost_of_goods') costOfGoods += amount.minorUnits;
    else operatingCosts += amount.minorUnits;
    trace.push({
      operation: `cost:${cost.key}`,
      inputs: costTraceInputs(cost, evaluationInput, cashFlows),
      outputMinorUnits: amount.minorUnits,
    });
  }

  const totalCosts = costOfGoods + operatingCosts;
  const grossProfit = cashFlows.recognized_revenue.minorUnits - costOfGoods;
  const netProfit = cashFlows.recognized_revenue.minorUnits - totalCosts;
  const outcome: PricingOutcome = {
    campaignPrice: cashFlows.campaign_price,
    consumerPayment: cashFlows.consumer_payment,
    recognizedRevenue: cashFlows.recognized_revenue,
    merchantSettlement: cashFlows.merchant_settlement,
    costOfGoods: moneyFromMinorUnits(costOfGoods, currency),
    operatingCosts: moneyFromMinorUnits(operatingCosts, currency),
    totalCosts: moneyFromMinorUnits(totalCosts, currency),
    grossProfit: { currency, minorUnits: grossProfit },
    netProfit: { currency, minorUnits: netProfit },
    grossMarginBasisPoints:
      cashFlows.recognized_revenue.minorUnits === 0n
        ? null
        : (grossProfit * 10_000n) / cashFlows.recognized_revenue.minorUnits,
    netMarginBasisPoints:
      cashFlows.recognized_revenue.minorUnits === 0n
        ? null
        : (netProfit * 10_000n) / cashFlows.recognized_revenue.minorUnits,
  };
  trace.push(
    {
      operation: 'pricing:cost-of-goods',
      inputs: aggregationInputs(evaluatedCosts, 'cost_of_goods'),
      outputMinorUnits: costOfGoods,
    },
    {
      operation: 'pricing:operating-costs',
      inputs: aggregationInputs(evaluatedCosts, 'operating'),
      outputMinorUnits: operatingCosts,
    },
    {
      operation: 'pricing:gross-profit',
      inputs: {
        recognizedRevenueMinorUnits: cashFlows.recognized_revenue.minorUnits.toString(),
        costOfGoodsMinorUnits: costOfGoods.toString(),
      },
      outputMinorUnits: grossProfit,
    },
  );
  trace.push({
    operation: 'pricing:net-profit',
    inputs: {
      recognizedRevenueMinorUnits: cashFlows.recognized_revenue.minorUnits.toString(),
      totalCostsMinorUnits: String(totalCosts),
    },
    outputMinorUnits: netProfit,
  });
  trace.push(
    {
      operation: 'pricing:gross-margin-basis-points',
      inputs: {
        grossProfitMinorUnits: grossProfit.toString(),
        recognizedRevenueMinorUnits: cashFlows.recognized_revenue.minorUnits.toString(),
      },
      outputMinorUnits: outcome.grossMarginBasisPoints ?? 0n,
    },
    {
      operation: 'pricing:net-margin-basis-points',
      inputs: {
        netProfitMinorUnits: netProfit.toString(),
        recognizedRevenueMinorUnits: cashFlows.recognized_revenue.minorUnits.toString(),
      },
      outputMinorUnits: outcome.netMarginBasisPoints ?? 0n,
    },
  );
  return { outcome, trace };
}

function summarizeInputs(costs: readonly CostItem[]): PricingResult['inputSummary'] {
  return {
    confirmed: costs.filter(({ status }) => status === 'confirmed').map(({ key }) => key),
    estimated: costs.filter(({ status }) => status === 'estimated').map(({ key }) => key),
    missing: costs.filter(({ status }) => status === 'missing').map(({ key }) => key),
  };
}

export type CandidateCashFlows = Readonly<Record<PercentageBase, Money>>;

export function evaluatePercentageCost(
  cost: PercentageCostItem,
  cashFlows: CandidateCashFlows,
  currency: string,
  rounding: RoundingPolicy,
): Money {
  if (cost.rateBasisPoints === null || cost.rateBasisPoints < 0n) {
    throw new RangeError(`Percentage cost ${cost.key} requires a non-negative rate.`);
  }
  const base = cashFlows[cost.base];
  if (base.currency !== currency) {
    throw new TypeError(`Percentage cost ${cost.key} base currency is invalid.`);
  }
  return moneyFromMinorUnits(
    divideAndRound(base.minorUnits * cost.rateBasisPoints, 10_000n, rounding),
    currency,
  );
}

function evaluateCost(cost: CostItem, input: PricingInput, cashFlows: CandidateCashFlows): Money {
  if (cost.status === 'missing') return moneyFromMinorUnits(0n, input.currency);
  switch (cost.kind) {
    case 'per_unit':
      return requiredAmount(cost, input.currency);
    case 'fixed': {
      const units = cost.allocationUnits;
      if (units === undefined || units <= 0n) {
        throw new RangeError(`Fixed cost ${cost.key} requires positive allocation units.`);
      }
      const amount = requiredAmount(cost, input.currency);
      return moneyFromMinorUnits(
        divideAndRound(amount.minorUnits, units, input.rounding),
        input.currency,
      );
    }
    case 'per_order': {
      const units = cost.unitsPerOrder;
      if (units === undefined || units <= 0n) {
        throw new RangeError(`Per-order cost ${cost.key} requires positive units per order.`);
      }
      const amount = requiredAmount(cost, input.currency);
      return moneyFromMinorUnits(
        divideAndRound(amount.minorUnits, units, input.rounding),
        input.currency,
      );
    }
    case 'percentage': {
      return evaluatePercentageCost(cost, cashFlows, input.currency, input.rounding);
    }
    case 'formula': {
      if (cost.formula === null) throw new TypeError(`Formula cost ${cost.key} is missing.`);
      const variables = new Map([
        ['campaign_price', cashFlows.campaign_price],
        ['consumer_payment', cashFlows.consumer_payment],
        ['recognized_revenue', cashFlows.recognized_revenue],
        ['merchant_settlement', cashFlows.merchant_settlement],
      ]);
      return evaluateFormula(cost.formula, variables, input.rounding);
    }
  }
}

function costTraceInputs(
  cost: CostItem,
  input: PricingInput,
  cashFlows: CandidateCashFlows,
): Readonly<Record<string, string>> {
  const common = {
    classification: cost.classification,
    critical: String(cost.critical),
    kind: cost.kind,
    status: cost.status,
    roundingMode: input.rounding.mode,
  };
  if (cost.status === 'missing') return common;
  if (cost.kind === 'percentage') {
    return {
      ...common,
      base: cost.base,
      baseMinorUnits: cashFlows[cost.base].minorUnits.toString(),
      rateBasisPoints: cost.rateBasisPoints?.toString() ?? '',
    };
  }
  if (cost.kind === 'formula') {
    return {
      ...common,
      formula: JSON.stringify(cost.formula),
      campaignPriceMinorUnits: cashFlows.campaign_price.minorUnits.toString(),
      consumerPaymentMinorUnits: cashFlows.consumer_payment.minorUnits.toString(),
      recognizedRevenueMinorUnits: cashFlows.recognized_revenue.minorUnits.toString(),
      merchantSettlementMinorUnits: cashFlows.merchant_settlement.minorUnits.toString(),
    };
  }
  return {
    ...common,
    amountMinorUnits: cost.amount?.minorUnits.toString() ?? '',
    ...(cost.kind === 'fixed' ? { allocationUnits: cost.allocationUnits?.toString() ?? '' } : {}),
    ...(cost.kind === 'per_order' ? { unitsPerOrder: cost.unitsPerOrder?.toString() ?? '' } : {}),
  };
}

function aggregationInputs(
  evaluatedCosts: readonly { readonly cost: CostItem; readonly amount: Money }[],
  classification: CostItem['classification'],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    evaluatedCosts
      .filter(({ cost }) => cost.classification === classification)
      .map(({ amount, cost }) => [cost.key, amount.minorUnits.toString()]),
  );
}

function requiredAmount(
  cost: CostItem & { readonly amount?: Money | null },
  currency: string,
): Money {
  const amount = cost.amount;
  if (!amount) throw new TypeError(`Cost ${cost.key} amount is missing.`);
  if (amount.currency !== currency) throw new TypeError(`Cost ${cost.key} currency is invalid.`);
  return amount;
}

function validatePricingInput(input: PricingInput): void {
  if (!/^[A-Z]{3}$/u.test(input.currency)) throw new TypeError('Pricing currency is invalid.');
  if (
    input.search.minimumMinorUnits < 0n ||
    input.search.maximumMinorUnits < input.search.minimumMinorUnits ||
    input.search.maximumMinorUnits - input.search.minimumMinorUnits > MAX_EXHAUSTIVE_SEARCH_WIDTH
  ) {
    throw new RangeError('Pricing search range is invalid or too large.');
  }
  if (new Set(input.costs.map(({ key }) => key)).size !== input.costs.length) {
    throw new TypeError('Pricing cost keys must be unique.');
  }
  const hasCriticalMissing = input.costs.some(
    ({ critical, status }) => critical && status === 'missing',
  );
  assertPricingWorkBudget(
    input,
    hasCriticalMissing || input.goal.type === 'break_even' ? 1n : 2n,
    hasCriticalMissing ? 1n : undefined,
  );
}
