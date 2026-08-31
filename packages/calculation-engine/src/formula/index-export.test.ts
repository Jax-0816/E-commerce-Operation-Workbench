import { describe, expect, it } from 'vitest';

import { FormulaNodeSchema, evaluateFormula, orderDependencies, roundingPolicy } from '../index.js';

describe('formula public API', () => {
  it('exposes parsing, evaluation, and dependency ordering from the package entry point', () => {
    const formula = FormulaNodeSchema.parse({
      type: 'literal',
      numerator: '15',
      denominator: '2',
    });

    expect(evaluateFormula(formula, new Map(), roundingPolicy('half-up')).minorUnits).toBe(8n);
    expect(orderDependencies([{ key: 'fee', formula }]).map(({ key }) => key)).toEqual(['fee']);
  });
});
