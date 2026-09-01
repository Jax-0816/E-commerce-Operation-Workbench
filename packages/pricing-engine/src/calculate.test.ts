import { describe, expect, it } from 'vitest';

import { moneyFromMinorUnits, roundingPolicy, type FormulaNode } from '@eaw/calculation-engine';

import { calculatePricing, evaluatePercentageCost } from './calculate.js';
import type {
  AmountCostItem,
  CostItem,
  PercentageBase,
  PercentageCostItem,
  PricingInput,
} from './types.js';

describe('calculatePricing', () => {
  it('calculates traceable break-even and target unit profit across every cost base', () => {
    const result = calculatePricing(
      input(
        [
          amountCost('materials', 'per_unit', 2_000, 'cost_of_goods'),
          { ...amountCost('overhead', 'fixed', 10_000, 'operating'), allocationUnits: 100n },
          { ...amountCost('fulfilment', 'per_order', 500, 'operating'), unitsPerOrder: 2n },
          percentageCost('commission', 1_000, 'recognized_revenue', 'operating'),
        ],
        { type: 'target_unit_profit', amount: moneyFromMinorUnits(1_000n) },
      ),
    );

    expect(result.status).toBe('verified');
    expect(result.prices.breakEven?.minorUnits).toBe(2_611n);
    expect(result.prices.minimumSafe?.minorUnits).toBe(2_611n);
    expect(result.prices.target?.minorUnits).toBe(3_722n);
    expect(result.prices.recommended?.minorUnits).toBe(3_722n);
    expect(result.outcome.netProfit.minorUnits).toBe(1_000n);
    expect(result.trace.map(({ operation }) => operation)).toEqual(
      expect.arrayContaining([
        'cost:materials',
        'cost:overhead',
        'cost:fulfilment',
        'cost:commission',
        'pricing:cost-of-goods',
        'pricing:operating-costs',
        'pricing:gross-profit',
        'pricing:net-profit',
        'pricing:net-margin-basis-points',
        'goal:break_even',
        'goal:target_unit_profit',
      ]),
    );
    expect(
      result.trace
        .filter(({ operation }) => operation === 'cost:commission')
        .map(({ inputs: values }) => values),
    ).toEqual([
      expect.objectContaining({
        base: 'recognized_revenue',
        baseMinorUnits: '2611',
        rateBasisPoints: '1000',
        roundingMode: 'half-up',
      }),
      expect.objectContaining({
        base: 'recognized_revenue',
        baseMinorUnits: '3722',
        rateBasisPoints: '1000',
        roundingMode: 'half-up',
      }),
    ]);
  });

  it.each([
    [{ type: 'gross_margin', basisPoints: 5_000n }, 4_000n],
    [{ type: 'net_margin', basisPoints: 2_500n }, 3_334n],
    [{ type: 'break_even' }, 2_500n],
  ] as const)('solves the %s goal', (goal, expectedPrice) => {
    const result = calculatePricing(
      input(
        [
          amountCost('materials', 'per_unit', 2_000, 'cost_of_goods'),
          amountCost('operations', 'per_unit', 500, 'operating'),
        ],
        goal,
      ),
    );

    expect(result.prices.target?.minorUnits).toBe(expectedPrice);
  });

  it('marks estimates as warning and critical missing costs as incomplete without safe prices', () => {
    const warning = calculatePricing(
      input(
        [{ ...amountCost('materials', 'per_unit', 2_000, 'cost_of_goods'), status: 'estimated' }],
        { type: 'break_even' },
      ),
    );
    const incomplete = calculatePricing(
      input(
        [
          {
            key: 'materials',
            label: '材料成本',
            kind: 'per_unit',
            classification: 'cost_of_goods',
            status: 'missing',
            critical: true,
            amount: null,
          },
        ],
        { type: 'break_even' },
      ),
    );

    expect(warning.status).toBe('warning');
    expect(warning.inputSummary.estimated).toEqual(['materials']);
    expect(incomplete.status).toBe('incomplete');
    expect(incomplete.inputSummary.missing).toEqual(['materials']);
    expect(incomplete.prices).toEqual({
      breakEven: null,
      minimumSafe: null,
      target: null,
      recommended: null,
    });
  });

  it('finds the earliest valid price before a formula breakpoint and verifies the candidate', () => {
    const thresholdCost: FormulaNode = {
      type: 'if',
      condition: {
        type: 'compare',
        operator: 'gte',
        left: { type: 'variable', name: 'campaign_price' },
        right: literal('3000'),
      },
      then: literal('1000'),
      else: literal('0'),
    };
    const result = calculatePricing(
      input(
        [
          amountCost('materials', 'per_unit', 2_500, 'cost_of_goods'),
          {
            key: 'threshold_fee',
            label: '门槛费用',
            kind: 'formula',
            classification: 'operating',
            status: 'confirmed',
            critical: true,
            formula: thresholdCost,
          },
        ],
        { type: 'break_even' },
      ),
    );

    expect(result.prices.breakEven?.minorUnits).toBe(2_500n);
    expect(result.outcome.netProfit.minorUnits).toBe(0n);
  });

  it('finds a one-price valid window created by a non-monotonic conditional formula', () => {
    const fee: FormulaNode = {
      type: 'if',
      condition: {
        type: 'compare',
        operator: 'lte',
        left: { type: 'variable', name: 'campaign_price' },
        right: literal('100'),
      },
      then: literal('0'),
      else: literal('1000'),
    };
    const result = calculatePricing(
      input(
        [
          amountCost('materials', 'per_unit', 100, 'cost_of_goods'),
          {
            key: 'step_fee',
            label: '阶梯费用',
            kind: 'formula',
            classification: 'operating',
            status: 'confirmed',
            critical: true,
            formula: fee,
          },
        ],
        { type: 'break_even' },
      ),
    );

    expect(result.prices.breakEven?.minorUnits).toBe(100n);
    expect(result.outcome.netProfit.minorUnits).toBe(0n);
  });

  it('selects the declared percentage base from distinct cash-flow values', () => {
    const flows = {
      campaign_price: moneyFromMinorUnits(1_000n),
      consumer_payment: moneyFromMinorUnits(800n),
      recognized_revenue: moneyFromMinorUnits(700n),
      merchant_settlement: moneyFromMinorUnits(600n),
    } as const;
    const expected: Record<PercentageBase, bigint> = {
      campaign_price: 100n,
      consumer_payment: 80n,
      recognized_revenue: 70n,
      merchant_settlement: 60n,
    };

    for (const base of Object.keys(expected) as PercentageBase[]) {
      const cost: PercentageCostItem = {
        ...percentageCost('fee', 1_000, base, 'operating'),
        kind: 'percentage',
      };
      expect(evaluatePercentageCost(cost, flows, 'CNY', roundingPolicy('half-up')).minorUnits).toBe(
        expected[base],
      );
    }
  });

  it('rejects a maximum-range complex formula before synchronous work can exhaust the server', () => {
    const expensiveFormula: FormulaNode = {
      type: 'max',
      operands: Array.from({ length: 240 }, (_, index) => literal(String(index))),
    };
    expect(() =>
      calculatePricing(
        input(
          [
            amountCost('materials', 'per_unit', 100, 'cost_of_goods'),
            {
              key: 'complex_fee',
              label: '复杂费用',
              kind: 'formula',
              classification: 'operating',
              status: 'confirmed',
              critical: true,
              formula: expensiveFormula,
            },
          ],
          { type: 'target_unit_profit', amount: moneyFromMinorUnits(100_000n) },
        ),
      ),
    ).toThrow(/work budget/i);
  });
});

function input(costs: readonly CostItem[], goal: PricingInput['goal']): PricingInput {
  return {
    currency: 'CNY',
    costs,
    goal,
    rounding: roundingPolicy('half-up'),
    search: { minimumMinorUnits: 0n, maximumMinorUnits: 100_000n },
  };
}

function amountCost(
  key: string,
  kind: 'fixed' | 'per_order' | 'per_unit',
  minorUnits: number,
  classification: CostItem['classification'],
): AmountCostItem {
  return {
    key,
    label: key,
    kind,
    classification,
    status: 'confirmed',
    critical: true,
    amount: moneyFromMinorUnits(BigInt(minorUnits)),
  };
}

function percentageCost(
  key: string,
  rateBasisPoints: number,
  base: 'campaign_price' | 'consumer_payment' | 'merchant_settlement' | 'recognized_revenue',
  classification: CostItem['classification'],
): PercentageCostItem {
  return {
    key,
    label: key,
    kind: 'percentage',
    classification,
    status: 'confirmed',
    critical: true,
    rateBasisPoints: BigInt(rateBasisPoints),
    base,
  };
}

function literal(numerator: string): FormulaNode {
  return { type: 'literal', numerator, denominator: '1' };
}
