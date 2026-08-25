import { describe, expect, it } from 'vitest';

import { basisPoints, basisPointsAsRational, rational } from './rate.js';

describe('exact rates', () => {
  it('normalizes rational values', () => {
    expect(rational(20n, 30n)).toEqual({ numerator: 2n, denominator: 3n });
  });

  it('represents basis points as an exact rational', () => {
    expect(basisPointsAsRational(basisPoints(125))).toEqual({
      numerator: 1n,
      denominator: 80n,
    });
  });

  it('rejects negative, non-integral, and zero-denominator rates', () => {
    expect(() => rational(-1n, 2n)).toThrow(RangeError);
    expect(() => rational(1n, 0n)).toThrow(RangeError);
    expect(() => basisPoints(-1)).toThrow(RangeError);
    expect(() => basisPoints(1.5)).toThrow(TypeError);
  });
});
