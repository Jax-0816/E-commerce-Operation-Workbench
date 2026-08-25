import { describe, expect, it } from 'vitest';

import { divideAndRound, roundingPolicy } from './rounding.js';

describe('explicit rounding policy', () => {
  it.each([
    ['half-up', 3n],
    ['half-even', 2n],
    ['floor', 2n],
    ['ceil', 3n],
    ['trunc', 2n],
  ] as const)('applies %s to the tie 5 / 2', (mode, expected) => {
    expect(divideAndRound(5n, 2n, roundingPolicy(mode))).toBe(expected);
  });

  it('rounds half-even to the nearest even value on either side', () => {
    expect(divideAndRound(7n, 2n, roundingPolicy('half-even'))).toBe(4n);
  });

  it('rejects invalid divisors and negative amounts', () => {
    expect(() => divideAndRound(1n, 0n, roundingPolicy('half-up'))).toThrow(RangeError);
    expect(() => divideAndRound(-1n, 2n, roundingPolicy('half-up'))).toThrow(RangeError);
  });
});
