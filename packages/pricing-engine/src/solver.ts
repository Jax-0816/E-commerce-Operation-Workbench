import { moneyFromMinorUnits, type FormulaNode } from '@eaw/calculation-engine';

import { evaluatePricingCandidate } from './calculate.js';
import type {
  BreakEvenResult,
  PricingGoal,
  PricingInput,
  PricingOutcome,
  PricingTraceStep,
} from './types.js';

export const MAX_EXHAUSTIVE_SEARCH_WIDTH = 100_000n;
const MAX_PRICING_WORK_UNITS = 2_000_000n;
const PRICING_VARIABLES = new Set([
  'campaign_price',
  'consumer_payment',
  'merchant_settlement',
  'recognized_revenue',
]);

export function solveBreakEven(input: PricingInput): BreakEvenResult {
  return solvePricingGoal(input, { type: 'break_even' });
}

export function solvePricingGoal(input: PricingInput, goal: PricingGoal): BreakEvenResult {
  const width = input.search.maximumMinorUnits - input.search.minimumMinorUnits;
  if (width < 0n || width > MAX_EXHAUSTIVE_SEARCH_WIDTH) {
    throw new RangeError('Pricing search range is invalid or too large.');
  }
  assertPricingWorkBudget(input, 1n);

  let selected: bigint | undefined;
  let selectedEvaluation: ReturnType<typeof evaluatePricingCandidate> | undefined;
  for (
    let candidate = input.search.minimumMinorUnits;
    candidate <= input.search.maximumMinorUnits;
    candidate += 1n
  ) {
    const evaluated = evaluatePricingCandidate(input, candidate);
    if (meetsGoal(evaluated.outcome, goal)) {
      selected = candidate;
      selectedEvaluation = evaluated;
      break;
    }
  }

  if (selected === undefined || selectedEvaluation === undefined) {
    throw new RangeError('Pricing goal is outside the configured range.');
  }
  const previousOutcome =
    selected > input.search.minimumMinorUnits
      ? evaluatePricingCandidate(input, selected - 1n).outcome
      : null;
  const goalTrace: PricingTraceStep = {
    operation: `goal:${goal.type}`,
    inputs: goalInputs(goal, selectedEvaluation.outcome),
    outputMinorUnits: selected,
  };
  return {
    price: moneyFromMinorUnits(selected, input.currency),
    outcome: selectedEvaluation.outcome,
    previousOutcome,
    trace: [...selectedEvaluation.trace, goalTrace],
  };
}

export function assertPricingWorkBudget(
  input: PricingInput,
  solveCount: bigint,
  candidateEvaluationOverride?: bigint,
): void {
  let costUnits = 0n;
  for (const cost of input.costs) {
    if (cost.kind !== 'formula' || cost.formula === null || cost.status === 'missing') {
      costUnits += 1n;
      continue;
    }
    costUnits += BigInt(formulaNodeCount(cost.formula));
  }
  if (costUnits === 0n) costUnits = 1n;
  const candidateCount = input.search.maximumMinorUnits - input.search.minimumMinorUnits + 1n;
  const candidateEvaluations = candidateEvaluationOverride ?? candidateCount * solveCount;
  if (candidateEvaluations * costUnits > MAX_PRICING_WORK_UNITS) {
    throw new RangeError('Pricing calculation exceeds the synchronous work budget.');
  }
}

function formulaNodeCount(formula: FormulaNode): number {
  let count = 0;
  const pending: FormulaNode[] = [formula];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) break;
    count += 1;
    if (count > 256) throw new RangeError('Pricing formula exceeds the supported work budget.');
    switch (node.type) {
      case 'literal':
        break;
      case 'variable':
        if (!PRICING_VARIABLES.has(node.name)) {
          throw new TypeError(`Formula variable ${node.name} is not supported for pricing.`);
        }
        break;
      case 'add':
      case 'subtract':
      case 'multiply':
      case 'divide':
        pending.push(node.left, node.right);
        break;
      case 'min':
      case 'max':
        pending.push(...node.operands);
        break;
      case 'round':
      case 'ceil':
      case 'floor':
        pending.push(node.operand);
        break;
      case 'if':
        pending.push(node.condition.left, node.condition.right, node.then, node.else);
        break;
    }
  }
  return count;
}

function meetsGoal(outcome: PricingOutcome, goal: PricingGoal): boolean {
  switch (goal.type) {
    case 'break_even':
      return outcome.netProfit.minorUnits >= 0n;
    case 'target_unit_profit':
      if (goal.amount.currency !== outcome.netProfit.currency) {
        throw new TypeError('Target profit currency does not match pricing input.');
      }
      return outcome.netProfit.minorUnits >= goal.amount.minorUnits;
    case 'gross_margin':
      return (
        outcome.grossProfit.minorUnits * 10_000n >=
        outcome.recognizedRevenue.minorUnits * goal.basisPoints
      );
    case 'net_margin':
      return (
        outcome.netProfit.minorUnits * 10_000n >=
        outcome.recognizedRevenue.minorUnits * goal.basisPoints
      );
  }
}

function goalInputs(goal: PricingGoal, outcome: PricingOutcome): Readonly<Record<string, string>> {
  const common = {
    selectedPriceMinorUnits: outcome.campaignPrice.minorUnits.toString(),
    grossProfitMinorUnits: outcome.grossProfit.minorUnits.toString(),
    netProfitMinorUnits: outcome.netProfit.minorUnits.toString(),
    recognizedRevenueMinorUnits: outcome.recognizedRevenue.minorUnits.toString(),
  };
  if (goal.type === 'target_unit_profit') {
    return { ...common, targetProfitMinorUnits: goal.amount.minorUnits.toString() };
  }
  if (goal.type === 'gross_margin' || goal.type === 'net_margin') {
    return { ...common, targetMarginBasisPoints: goal.basisPoints.toString() };
  }
  return common;
}
