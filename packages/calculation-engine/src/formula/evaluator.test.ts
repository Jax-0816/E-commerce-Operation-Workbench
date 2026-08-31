import { describe, expect, it } from 'vitest';

import { moneyFromDecimal } from '../money.js';
import { roundingPolicy } from '../rounding.js';
import type { FormulaNode } from './ast.js';
import { evaluateFormula, MAX_FORMULA_INTERMEDIATE_DIGITS } from './evaluator.js';

describe('formula evaluator', () => {
  it('evaluates exact rational arithmetic over Money variables', () => {
    const formula = {
      type: 'add',
      left: {
        type: 'multiply',
        left: { type: 'variable', name: 'consumer_payment' },
        right: { type: 'literal', numerator: '3', denominator: '2' },
      },
      right: { type: 'literal', numerator: '5', denominator: '1' },
    } satisfies FormulaNode;

    const result = evaluateFormula(
      formula,
      new Map([['consumer_payment', moneyFromDecimal('39.90')]]),
      roundingPolicy('half-up'),
    );

    expect(result).toEqual({ currency: 'CNY', minorUnits: 5990n });
  });

  it('evaluates subtract, divide, min, and max without floating-point arithmetic', () => {
    const formula = {
      type: 'max',
      operands: [
        {
          type: 'divide',
          left: {
            type: 'subtract',
            left: literal('100'),
            right: literal('10'),
          },
          right: literal('3'),
        },
        { type: 'min', operands: [literal('25'), literal('40')] },
      ],
    } satisfies FormulaNode;

    expect(evaluate(formula).minorUnits).toBe(30n);
  });

  it.each([
    ['round', 'half-even', 2n],
    ['round', 'half-up', 3n],
    ['ceil', 'floor', 3n],
    ['floor', 'ceil', 2n],
  ] as const)(
    'applies %s locally and independently of final %s rounding',
    (type, mode, expected) => {
      const formula = { type, operand: literal('5', '2') } satisfies FormulaNode;

      expect(evaluateFormula(formula, new Map(), roundingPolicy(mode)).minorUnits).toBe(expected);
    },
  );

  it.each([
    ['eq', '2', '2', 1n],
    ['ne', '2', '3', 1n],
    ['lt', '2', '3', 1n],
    ['lte', '2', '2', 1n],
    ['gt', '3', '2', 1n],
    ['gte', '2', '2', 1n],
    ['gt', '2', '3', 0n],
  ] as const)(
    'evaluates the %s comparison for an if expression',
    (operator, left, right, expected) => {
      const formula = {
        type: 'if',
        condition: {
          type: 'compare',
          operator,
          left: literal(left),
          right: literal(right),
        },
        then: literal('1'),
        else: literal('0'),
      } satisfies FormulaNode;

      expect(evaluate(formula).minorUnits).toBe(expected);
    },
  );

  it('evaluates only the selected conditional branch', () => {
    const formula = {
      type: 'if',
      condition: {
        type: 'compare',
        operator: 'eq',
        left: literal('1'),
        right: literal('1'),
      },
      then: literal('25'),
      else: { type: 'variable', name: 'not_available' },
    } satisfies FormulaNode;

    expect(evaluate(formula).minorUnits).toBe(25n);
  });

  it('rejects division by zero and negative monetary results', () => {
    expect(() => evaluate({ type: 'divide', left: literal('10'), right: literal('0') })).toThrow(
      /zero/i,
    );
    expect(() => evaluate({ type: 'subtract', left: literal('1'), right: literal('2') })).toThrow(
      RangeError,
    );
  });

  it('rejects unknown variables and mixed currencies', () => {
    expect(() => evaluate({ type: 'variable', name: 'missing' })).toThrow(ReferenceError);

    const formula = {
      type: 'add',
      left: { type: 'variable', name: 'cny' },
      right: { type: 'variable', name: 'usd' },
    } satisfies FormulaNode;
    const variables = new Map([
      ['cny', moneyFromDecimal('1.00', 'CNY')],
      ['usd', moneyFromDecimal('1.00', 'USD')],
    ]);

    expect(() => evaluateFormula(formula, variables, roundingPolicy('half-up'))).toThrow(
      /currency/i,
    );
  });

  it('rejects intermediate exact values beyond the calculation budget', () => {
    let level: FormulaNode[] = Array.from({ length: 40 }, () => literal('9'.repeat(128)));
    while (level.length > 1) {
      const next: FormulaNode[] = [];
      for (let index = 0; index < level.length; index += 2) {
        const left = level[index];
        const right = level[index + 1];
        if (!left) continue;
        next.push(right ? { type: 'multiply', left, right } : left);
      }
      level = next;
    }
    const formula = level[0];
    if (!formula) throw new Error('Expected a generated formula.');

    expect(MAX_FORMULA_INTERMEDIATE_DIGITS).toBeGreaterThan(128);
    expect(() => evaluate(formula)).toThrow(/budget|digits|large/i);
  });
});

function evaluate(formula: FormulaNode) {
  return evaluateFormula(formula, new Map(), roundingPolicy('half-up'));
}

function literal(numerator: string, denominator = '1') {
  return { type: 'literal', numerator, denominator } as const;
}
