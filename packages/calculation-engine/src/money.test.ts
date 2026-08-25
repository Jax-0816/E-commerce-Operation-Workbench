import { describe, expect, it } from 'vitest';

import {
  addMoney,
  formatMoney,
  moneyFromDecimal,
  moneyFromMinorUnits,
  multiplyMoney,
  serializeMinorUnits,
  subtractMoney,
} from './money.js';
import { rational } from './rate.js';
import { roundingPolicy } from './rounding.js';

describe('exact money', () => {
  it('represents ¥39.90 exactly in minor units', () => {
    const money = moneyFromDecimal('39.90', 'CNY');

    expect(money).toEqual({ currency: 'CNY', minorUnits: 3990n });
    expect(formatMoney(money)).toBe('39.90');
    expect(serializeMinorUnits(money)).toBe(3990);
  });

  it('performs checked addition and subtraction for one currency', () => {
    expect(addMoney(moneyFromDecimal('20.10'), moneyFromDecimal('19.80')).minorUnits).toBe(3990n);
    expect(subtractMoney(moneyFromDecimal('40.00'), moneyFromDecimal('0.10')).minorUnits).toBe(
      3990n,
    );
    expect(() =>
      addMoney(moneyFromDecimal('1.00', 'CNY'), moneyFromDecimal('1.00', 'USD')),
    ).toThrow(/currency/i);
  });

  it('multiplies by a rational without floating-point arithmetic', () => {
    const result = multiplyMoney(
      moneyFromDecimal('39.90'),
      rational(3n, 2n),
      roundingPolicy('half-up'),
    );

    expect(result.minorUnits).toBe(5985n);
  });

  it('rejects negative values, invalid decimals, and negative results', () => {
    expect(() => moneyFromMinorUnits(-1n)).toThrow(RangeError);
    expect(() => moneyFromDecimal('-0.01')).toThrow(RangeError);
    expect(() => moneyFromDecimal('39.9')).toThrow(TypeError);
    expect(() => subtractMoney(moneyFromDecimal('1.00'), moneyFromDecimal('1.01'))).toThrow(
      RangeError,
    );
  });

  it('rejects unsafe minor-unit serialization overflow', () => {
    const overflow = moneyFromMinorUnits(BigInt(Number.MAX_SAFE_INTEGER) + 1n);

    expect(() => serializeMinorUnits(overflow)).toThrow(RangeError);
  });
});
