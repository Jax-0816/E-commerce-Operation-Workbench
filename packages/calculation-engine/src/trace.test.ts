import { describe, expect, it } from 'vitest';

import { calculationTraceStep } from './trace.js';

describe('calculation trace', () => {
  it('records immutable, serializable calculation evidence', () => {
    const step = calculationTraceStep({
      expression: '3990 × 3 / 2',
      inputs: { priceMinorUnits: 3990, rateNumerator: 3, rateDenominator: 2 },
      operation: 'multiply-rational',
      outputMinorUnits: 5985,
      roundingMode: 'half-up',
    });

    expect(Object.isFrozen(step)).toBe(true);
    expect(JSON.parse(JSON.stringify(step))).toEqual(step);
  });
});
