import { describe, expect, it } from 'vitest';

import { moneyFromMinorUnits } from '@eaw/calculation-engine';

import { calculatePromotion } from './calculate.js';

describe('promotion money-flow invariants', () => {
  it('preserves attribution and non-negative balances across a deterministic range', () => {
    for (let price = 0n; price <= 20_000n; price += 317n) {
      const input = {
        campaignPrice: moneyFromMinorUnits(price),
        components: [
          {
            key: 'merchant-fixed',
            kind: 'fixed_reduction' as const,
            priority: 1,
            amount: moneyFromMinorUnits((price * 3n) / 5n),
            threshold: moneyFromMinorUnits(price / 3n),
            funder: 'merchant' as const,
          },
          {
            key: 'platform-percent',
            kind: 'percentage_discount' as const,
            priority: 2,
            payRateBasisPoints: 7_500n,
            maximumReduction: moneyFromMinorUnits(2_000n),
            threshold: moneyFromMinorUnits(0n),
            funder: 'platform' as const,
          },
        ],
        rounding: { mode: 'half-even' as const },
      };
      const first = calculatePromotion(input);
      const second = calculatePromotion(input);

      expect(second).toEqual(first);
      expect(first.consumerPayment.minorUnits).toBeGreaterThanOrEqual(0n);
      expect(first.consumerPayment.minorUnits).toBeLessThanOrEqual(price);
      expect(first.merchantSettlement.minorUnits).toBeGreaterThanOrEqual(
        first.consumerPayment.minorUnits,
      );
      expect(first.merchantSettlement.minorUnits).toBeLessThanOrEqual(price);
      expect(first.merchantSettlement.minorUnits).toBe(
        first.consumerPayment.minorUnits + first.platformFundedDiscount.minorUnits,
      );
      expect(first.recognizedRevenue).toEqual(first.merchantSettlement);
      expect(first.totalDiscount.minorUnits).toBe(
        first.merchantFundedDiscount.minorUnits + first.platformFundedDiscount.minorUnits,
      );
      expect(first.totalDiscount.minorUnits).toBe(price - first.consumerPayment.minorUnits);
    }
  });
});
