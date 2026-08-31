import { describe, expect, it } from 'vitest';

import { FormulaNodeSchema, MAX_FORMULA_INTEGER_DIGITS } from './schema.js';

describe('formula schema', () => {
  it('parses a whitelisted add expression without coercing exact integers', () => {
    const formula = {
      type: 'add',
      left: { type: 'variable', name: 'consumer_payment' },
      right: { type: 'literal', numerator: '25', denominator: '2' },
    };

    expect(FormulaNodeSchema.parse(formula)).toEqual(formula);
  });

  it.each([
    { type: 'subtract', left: literal('10'), right: literal('3') },
    { type: 'multiply', left: literal('10'), right: literal('3', '2') },
    { type: 'divide', left: literal('10'), right: literal('3') },
    { type: 'min', operands: [literal('10'), literal('3')] },
    { type: 'max', operands: [literal('10'), literal('3')] },
    { type: 'round', operand: literal('3', '2') },
    { type: 'ceil', operand: literal('3', '2') },
    { type: 'floor', operand: literal('3', '2') },
    {
      type: 'if',
      condition: {
        type: 'compare',
        operator: 'gte',
        left: literal('10'),
        right: literal('3'),
      },
      then: literal('1'),
      else: literal('0'),
    },
  ])('parses the whitelisted $type operator', (formula) => {
    expect(FormulaNodeSchema.parse(formula)).toEqual(formula);
  });

  it('rejects operators and fields outside the inert formula grammar', () => {
    expect(() => FormulaNodeSchema.parse({ type: 'call', function: 'process.exit' })).toThrow();
    expect(() =>
      FormulaNodeSchema.parse({ ...literal('1'), executable: 'return process.env' }),
    ).toThrow();
  });

  it('rejects invalid exact rational literals', () => {
    expect(() => FormulaNodeSchema.parse(literal('-1'))).toThrow();
    expect(() => FormulaNodeSchema.parse(literal('1.5'))).toThrow();
    expect(() => FormulaNodeSchema.parse(literal('1', '0'))).toThrow();
  });

  it('returns a detached inert data tree and strips input identity', () => {
    const formula = literal('25') as { denominator: string; numerator: string; type: 'literal' };
    Object.defineProperty(formula, 'toJSON', {
      enumerable: false,
      value: () => ({ type: 'call' }),
    });

    expect(() => FormulaNodeSchema.parse(formula)).toThrow(/data|property|plain/i);

    const safeInput = literal('25') as { denominator: string; numerator: string; type: 'literal' };
    const parsed = FormulaNodeSchema.parse(safeInput);
    safeInput.numerator = '999';

    expect(parsed).not.toBe(safeInput);
    expect(parsed).toEqual(literal('25'));
    expect(JSON.stringify(parsed)).toBe('{"type":"literal","numerator":"25","denominator":"1"}');
  });

  it('rejects exact integers beyond the resource budget', () => {
    expect(() =>
      FormulaNodeSchema.parse(literal('9'.repeat(MAX_FORMULA_INTEGER_DIGITS + 1))),
    ).toThrow(/digits|integer/i);
  });

  it('rejects comparison operators outside the whitelist', () => {
    const formula = {
      type: 'if',
      condition: {
        type: 'compare',
        operator: 'execute',
        left: literal('1'),
        right: literal('1'),
      },
      then: literal('1'),
      else: literal('0'),
    };

    expect(() => FormulaNodeSchema.parse(formula)).toThrow(/compare/i);
  });

  it('rejects aggregate expressions without operands', () => {
    expect(() => FormulaNodeSchema.parse({ type: 'max', operands: [] })).toThrow(/operand/i);
  });

  it('rejects formulas whose nesting can exhaust the evaluator', () => {
    let formula: unknown = literal('1');
    for (let index = 0; index < 40; index += 1) {
      formula = { type: 'add', left: formula, right: literal('1') };
    }

    expect(() => FormulaNodeSchema.parse(formula)).toThrow(/depth/i);
  });

  it('rejects formulas with an excessive number of nodes', () => {
    const formula = {
      type: 'max',
      operands: Array.from({ length: 300 }, () => literal('1')),
    };

    expect(() => FormulaNodeSchema.parse(formula)).toThrow(/nodes/i);
  });
});

function literal(numerator: string, denominator = '1') {
  return { type: 'literal', numerator, denominator } as const;
}
