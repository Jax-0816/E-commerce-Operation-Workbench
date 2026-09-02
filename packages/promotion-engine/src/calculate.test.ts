import { describe, expect, it } from 'vitest';

import { moneyFromMinorUnits } from '@eaw/calculation-engine';

import { calculatePromotion } from './calculate.js';
import type { FixedReductionComponent, PromotionComponent, PromotionInput } from './types.js';

describe('deterministic promotion money flow', () => {
  it('attributes merchant and platform funding without double deduction', () => {
    const result = calculatePromotion(
      input([
        fixed('merchant-coupon', 1, 2_000n, 10_000n, 'merchant'),
        fixed('platform-coupon', 2, 1_000n, 10_000n, 'platform'),
      ]),
    );

    expect(amounts(result)).toEqual({
      campaignPrice: 10_000n,
      consumerPayment: 7_000n,
      merchantSettlement: 8_000n,
      recognizedRevenue: 8_000n,
      merchantFundedDiscount: 2_000n,
      platformFundedDiscount: 1_000n,
      totalDiscount: 3_000n,
    });
    expect(
      result.trace.map(({ componentKey, appliedMinorUnits }) => [componentKey, appliedMinorUnits]),
    ).toEqual([
      ['merchant-coupon', 2_000n],
      ['platform-coupon', 1_000n],
    ]);
  });

  it('applies thresholds, percentage discounts, and reduction caps deterministically', () => {
    const result = calculatePromotion(
      input([
        {
          key: 'percent-80-off',
          kind: 'percentage_discount',
          priority: 2,
          payRateBasisPoints: 8_000n,
          maximumReduction: moneyFromMinorUnits(1_500n),
          threshold: moneyFromMinorUnits(8_000n),
          funder: 'merchant',
        },
        fixed('not-eligible', 1, 9_999n, 10_001n, 'platform'),
      ]),
    );

    expect(result.consumerPayment.minorUnits).toBe(8_500n);
    expect(result.merchantSettlement.minorUnits).toBe(8_500n);
    expect(result.trace).toMatchObject([
      { componentKey: 'not-eligible', eligible: false, appliedMinorUnits: 0n },
      {
        componentKey: 'percent-80-off',
        eligible: true,
        requestedMinorUnits: 2_000n,
        appliedMinorUnits: 1_500n,
      },
    ]);
  });

  it('never makes payment negative when stacked reductions exceed the price', () => {
    const result = calculatePromotion(
      input([
        fixed('platform', 1, 8_000n, 0n, 'platform'),
        fixed('merchant', 2, 8_000n, 0n, 'merchant'),
      ]),
    );

    expect(result.consumerPayment.minorUnits).toBe(0n);
    expect(result.platformFundedDiscount.minorUnits).toBe(8_000n);
    expect(result.merchantFundedDiscount.minorUnits).toBe(2_000n);
    expect(result.merchantSettlement.minorUnits).toBe(8_000n);
  });

  it('treats an eligible coupon as a single keyed reduction', () => {
    const result = calculatePromotion(
      input([
        {
          key: 'store-coupon',
          kind: 'coupon',
          priority: 1,
          amount: moneyFromMinorUnits(500n),
          threshold: moneyFromMinorUnits(9_000n),
          funder: 'merchant',
        },
      ]),
    );

    expect(result.consumerPayment.minorUnits).toBe(9_500n);
    expect(result.trace).toMatchObject([
      { componentKey: 'store-coupon', kind: 'coupon', appliedMinorUnits: 500n },
    ]);
  });

  it('rejects duplicate component keys, invalid rates, and currency mismatch', () => {
    expect(() =>
      calculatePromotion(input([fixed('same', 1, 100n, 0n), fixed('same', 2, 100n, 0n)])),
    ).toThrow(/unique/u);
    expect(() =>
      calculatePromotion(
        input([
          {
            key: 'invalid-rate',
            kind: 'percentage_discount',
            priority: 1,
            payRateBasisPoints: 10_001n,
            maximumReduction: null,
            threshold: moneyFromMinorUnits(0n),
            funder: 'merchant',
          },
        ]),
      ),
    ).toThrow(/rate/u);
    expect(() =>
      calculatePromotion({
        ...input([]),
        components: [
          {
            ...fixed('usd', 1, 100n, 0n),
            amount: moneyFromMinorUnits(100n, 'USD'),
          },
        ],
      }),
    ).toThrow(/currency/u);
  });
});

function input(components: readonly PromotionComponent[]): PromotionInput {
  return {
    campaignPrice: moneyFromMinorUnits(10_000n),
    components,
    rounding: { mode: 'half-up' },
  };
}

function fixed(
  key: string,
  priority: number,
  amount: bigint,
  threshold: bigint,
  funder: 'merchant' | 'platform' = 'merchant',
): FixedReductionComponent {
  return {
    key,
    kind: 'fixed_reduction',
    priority,
    amount: moneyFromMinorUnits(amount),
    threshold: moneyFromMinorUnits(threshold),
    funder,
  };
}

function amounts(result: ReturnType<typeof calculatePromotion>) {
  return {
    campaignPrice: result.campaignPrice.minorUnits,
    consumerPayment: result.consumerPayment.minorUnits,
    merchantSettlement: result.merchantSettlement.minorUnits,
    recognizedRevenue: result.recognizedRevenue.minorUnits,
    merchantFundedDiscount: result.merchantFundedDiscount.minorUnits,
    platformFundedDiscount: result.platformFundedDiscount.minorUnits,
    totalDiscount: result.totalDiscount.minorUnits,
  };
}
