import { describe, expect, it } from 'vitest';

import { moneyFromMinorUnits } from '@eaw/calculation-engine';

import { solveCampaignPrice } from './solver.js';
import type { PromotionComponent } from './types.js';

describe('campaign price solver', () => {
  it('finds the lowest price that recovers merchant settlement after a threshold jump', () => {
    const component: PromotionComponent = {
      key: 'merchant-threshold',
      kind: 'fixed_reduction',
      priority: 1,
      amount: moneyFromMinorUnits(3_000n),
      threshold: moneyFromMinorUnits(10_000n),
      funder: 'merchant',
    };
    const solved = solveCampaignPrice({
      currency: 'CNY',
      components: [component],
      minimumMerchantSettlement: moneyFromMinorUnits(8_000n),
      rounding: { mode: 'half-up' },
      search: { minimumMinorUnits: 10_000n, maximumMinorUnits: 12_000n },
    });

    expect(solved.campaignPrice?.minorUnits).toBe(11_000n);
    expect(solved.promotion?.merchantSettlement.minorUnits).toBe(8_000n);
    expect(solved.evaluatedCandidates).toBe(1_001);
  });

  it('counts platform funding toward settlement but not consumer payment', () => {
    const solved = solveCampaignPrice({
      currency: 'CNY',
      components: [
        {
          key: 'platform-coupon',
          kind: 'fixed_reduction',
          priority: 1,
          amount: moneyFromMinorUnits(3_000n),
          threshold: moneyFromMinorUnits(0n),
          funder: 'platform',
        },
      ],
      minimumMerchantSettlement: moneyFromMinorUnits(10_000n),
      rounding: { mode: 'half-up' },
      search: { minimumMinorUnits: 9_000n, maximumMinorUnits: 11_000n },
    });

    expect(solved.campaignPrice?.minorUnits).toBe(10_000n);
    expect(solved.promotion?.consumerPayment.minorUnits).toBe(7_000n);
    expect(solved.promotion?.merchantSettlement.minorUnits).toBe(10_000n);
  });

  it('returns an explicit unsolved result and rejects excessive search work', () => {
    expect(
      solveCampaignPrice({
        currency: 'CNY',
        components: [],
        minimumMerchantSettlement: moneyFromMinorUnits(20_000n),
        rounding: { mode: 'half-up' },
        search: { minimumMinorUnits: 0n, maximumMinorUnits: 10_000n },
      }),
    ).toEqual({ campaignPrice: null, promotion: null, evaluatedCandidates: 10_001 });
    expect(() =>
      solveCampaignPrice({
        currency: 'CNY',
        components: [],
        minimumMerchantSettlement: moneyFromMinorUnits(1n),
        rounding: { mode: 'half-up' },
        search: { minimumMinorUnits: 0n, maximumMinorUnits: 100_001n },
      }),
    ).toThrow(/range/u);
  });
});
