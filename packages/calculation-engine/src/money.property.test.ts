import { describe, expect, it } from 'vitest';

import { moneyFromMinorUnits, multiplyMoney } from './money.js';
import { rational } from './rate.js';
import { divideAndRound, roundingPolicy } from './rounding.js';

describe('money arithmetic properties', () => {
  it('matches exact integer rational multiplication across a deterministic input range', () => {
    for (let amount = 0n; amount <= 500n; amount += 7n) {
      for (let numerator = 0n; numerator <= 17n; numerator += 1n) {
        for (let denominator = 1n; denominator <= 11n; denominator += 1n) {
          const expected = divideAndRound(
            amount * numerator,
            denominator,
            roundingPolicy('half-even'),
          );
          expect(
            multiplyMoney(
              moneyFromMinorUnits(amount),
              rational(numerator, denominator),
              roundingPolicy('half-even'),
            ).minorUnits,
          ).toBe(expected);
        }
      }
    }
  });
});
