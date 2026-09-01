import { describe, expect, it } from 'vitest';

import {
  moneyFromMinorUnits,
  roundingPolicy,
  type FormulaComparisonOperator,
  type FormulaNode,
} from '@eaw/calculation-engine';

import { solveBreakEven } from './solver.js';
import type { CostItem, PricingInput } from './types.js';

describe('pricing solver properties', () => {
  it('never lowers break-even when confirmed fixed cost increases', () => {
    let previous = 0n;
    for (let fixed = 0; fixed <= 20_000; fixed += 500) {
      const result = solveBreakEven(input(fixed));
      expect(result.price.minorUnits).toBeGreaterThanOrEqual(previous);
      expect(result.outcome.netProfit.minorUnits).toBeGreaterThanOrEqual(0n);
      if (result.price.minorUnits > 0n) {
        expect(result.previousOutcome?.netProfit.minorUnits ?? -1n).toBeLessThan(0n);
      }
      previous = result.price.minorUnits;
    }
  });

  it('returns identical results for identical immutable inputs', () => {
    const value = input(12_345);
    expect(solveBreakEven(value)).toEqual(solveBreakEven(value));
  });

  it.each([
    ['lt', 300n],
    ['lte', 301n],
    ['gt', 100n],
    ['gte', 100n],
    ['eq', 100n],
    ['ne', 300n],
  ] as const)('returns the global minimum across the %s formula boundary', (operator, expected) => {
    expect(
      solveBreakEven(formulaInput(stepFormula(operator, literal('300')))).price.minorUnits,
    ).toBe(expected);
  });

  it('handles a rational expression threshold without integer-boundary assumptions', () => {
    const threshold: FormulaNode = {
      type: 'divide',
      left: literal('601'),
      right: literal('2'),
    };
    expect(solveBreakEven(formulaInput(stepFormula('lte', threshold))).price.minorUnits).toBe(301n);
  });

  it('applies the composite work budget to the public solver interface', () => {
    const complex: FormulaNode = {
      type: 'max',
      operands: Array.from({ length: 240 }, (_, index) => literal(String(index))),
    };
    expect(() =>
      solveBreakEven({
        ...formulaInput(complex),
        search: { minimumMinorUnits: 0n, maximumMinorUnits: 100_000n },
      }),
    ).toThrow(/work budget/i);
  });

  it('does not bypass the public solver work budget when a critical input is missing', () => {
    const complex: FormulaNode = {
      type: 'max',
      operands: Array.from({ length: 240 }, (_, index) => literal(String(index))),
    };
    const value = formulaInput(complex);
    expect(() =>
      solveBreakEven({
        ...value,
        costs: [
          ...value.costs,
          {
            key: 'missing',
            label: '缺失成本',
            kind: 'per_unit',
            classification: 'operating',
            status: 'missing',
            critical: true,
            amount: null,
          },
        ],
        search: { minimumMinorUnits: 0n, maximumMinorUnits: 100_000n },
      }),
    ).toThrow(/work budget/i);
  });
});

function formulaInput(formula: FormulaNode): PricingInput {
  return {
    currency: 'CNY',
    costs: [
      {
        key: 'materials',
        label: '材料',
        kind: 'per_unit',
        classification: 'cost_of_goods',
        status: 'confirmed',
        critical: true,
        amount: moneyFromMinorUnits(100n),
      },
      {
        key: 'step_fee',
        label: '阶梯费用',
        kind: 'formula',
        classification: 'operating',
        status: 'confirmed',
        critical: true,
        formula,
      },
    ],
    goal: { type: 'break_even' },
    rounding: roundingPolicy('half-up'),
    search: { minimumMinorUnits: 0n, maximumMinorUnits: 1_000n },
  };
}

function stepFormula(operator: FormulaComparisonOperator, threshold: FormulaNode): FormulaNode {
  return {
    type: 'if',
    condition: {
      type: 'compare',
      operator,
      left: { type: 'variable', name: 'campaign_price' },
      right: threshold,
    },
    then: literal('500'),
    else: literal('0'),
  };
}

function literal(numerator: string): FormulaNode {
  return { type: 'literal', numerator, denominator: '1' };
}

function input(fixedMinorUnits: number): PricingInput {
  const costs: CostItem[] = [
    {
      key: 'materials',
      label: '材料',
      kind: 'per_unit',
      classification: 'cost_of_goods',
      status: 'confirmed',
      critical: true,
      amount: moneyFromMinorUnits(2_000n),
    },
    {
      key: 'overhead',
      label: '固定费用',
      kind: 'fixed',
      classification: 'operating',
      status: 'confirmed',
      critical: true,
      amount: moneyFromMinorUnits(BigInt(fixedMinorUnits)),
      allocationUnits: 100n,
    },
  ];
  return {
    currency: 'CNY',
    costs,
    goal: { type: 'break_even' },
    rounding: roundingPolicy('half-up'),
    search: { minimumMinorUnits: 0n, maximumMinorUnits: 100_000n },
  };
}
