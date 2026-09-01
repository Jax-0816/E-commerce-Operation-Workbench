import { describe, expect, it } from 'vitest';

import type { PricingApplication } from '@eaw/application';
import { moneyFromMinorUnits } from '@eaw/calculation-engine';
import { parseUuidV7, type CostProfile } from '@eaw/domain';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const productId = id(1);
const skuId = id(2);

describe('cost and pricing routes', () => {
  it('saves and reads a SKU cost profile through strict contracts', async () => {
    const application = fakeApplication();
    const app = buildApp(createAppContext({ pricing: application }));
    const payload = {
      currency: 'CNY',
      items: [
        {
          key: 'materials',
          label: '材料',
          kind: 'per_unit',
          classification: 'cost_of_goods',
          critical: true,
          status: 'confirmed',
          amountMinorUnits: '2000',
          allocationUnits: null,
          unitsPerOrder: null,
          rateBasisPoints: null,
          percentageBase: null,
          formula: null,
        },
      ],
    };

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/v1/products/${productId}/skus/${skuId}/cost-profile`,
      payload,
    });
    const loaded = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/skus/${skuId}/cost-profile`,
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ skuId, revisionNo: 1, items: [{ key: 'materials' }] });
    expect(loaded.json()).toEqual(saved.json());
    await app.close();
  });

  it('calculates exact pricing and rejects malformed ranges', async () => {
    const app = buildApp(createAppContext({ pricing: fakeApplication() }));
    const valid = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/skus/${skuId}/pricing-calculations`,
      payload: {
        name: '保本',
        goal: { type: 'break_even' },
        minimumMinorUnits: '0',
        maximumMinorUnits: '100000',
      },
    });
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/skus/${skuId}/pricing-calculations`,
      payload: {
        name: '错误',
        goal: { type: 'break_even' },
        minimumMinorUnits: '100',
        maximumMinorUnits: '99',
      },
    });

    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toMatchObject({
      pricing: { status: 'verified', prices: { target: { minorUnits: '2000' } } },
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });

  it('returns a stable calculation error for an unattainable pricing goal', async () => {
    const application: PricingApplication = {
      ...fakeApplication(),
      async calculate() {
        throw new RangeError('Pricing goal is outside the configured range.');
      },
    };
    const app = buildApp(createAppContext({ pricing: application }));
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/skus/${skuId}/pricing-calculations`,
      payload: {
        name: '无法达到',
        goal: { type: 'target_unit_profit', amountMinorUnits: '999999' },
        minimumMinorUnits: '0',
        maximumMinorUnits: '100000',
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'CALCULATION_INVALID' } });
    await app.close();
  });

  it('returns a stable calculation error for an unsupported formula variable', async () => {
    const application: PricingApplication = {
      ...fakeApplication(),
      async calculate() {
        throw new ReferenceError('Unknown formula variable: order_count');
      },
    };
    const app = buildApp(createAppContext({ pricing: application }));
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/skus/${skuId}/pricing-calculations`,
      payload: {
        name: '错误变量',
        goal: { type: 'break_even' },
        minimumMinorUnits: '0',
        maximumMinorUnits: '100000',
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'CALCULATION_INVALID' } });
    await app.close();
  });
});

function fakeApplication(): PricingApplication {
  let profile: CostProfile = {
    id: id(3),
    skuId,
    currency: 'CNY',
    revisionNo: 1,
    items: [],
    createdAt: new Date('2026-08-31T04:00:00.000Z'),
    updatedAt: new Date('2026-08-31T04:00:00.000Z'),
  };
  return {
    async getCostProfile() {
      return profile;
    },
    async saveCostProfile(_productId, _skuId, input) {
      profile = { ...profile, items: input.items };
      return profile;
    },
    async listHistory() {
      return [];
    },
    async calculate() {
      const price = moneyFromMinorUnits(2_000n);
      const outcome = {
        campaignPrice: price,
        consumerPayment: price,
        recognizedRevenue: price,
        merchantSettlement: price,
        costOfGoods: price,
        operatingCosts: moneyFromMinorUnits(0n),
        totalCosts: price,
        grossProfit: { currency: 'CNY', minorUnits: 0n },
        netProfit: { currency: 'CNY', minorUnits: 0n },
        grossMarginBasisPoints: 0n,
        netMarginBasisPoints: 0n,
      };
      const scenario = {
        id: id(4),
        skuId,
        costProfileId: profile.id,
        costProfileRevisionNo: 1,
        name: '保本',
        goalSnapshot: { type: 'break_even' },
        createdAt: new Date('2026-08-31T05:00:00.000Z'),
      };
      const pricing = {
        status: 'verified' as const,
        inputSummary: { confirmed: [], estimated: [], missing: [] },
        prices: { breakEven: price, minimumSafe: price, target: price, recommended: price },
        outcome,
        trace: [],
      };
      const record = {
        id: id(5),
        scenarioId: scenario.id,
        skuId,
        status: 'verified' as const,
        inputSnapshot: {},
        resultSnapshot: {},
        engineVersion: '0.1.0',
        createdAt: new Date('2026-08-31T05:00:01.000Z'),
      };
      return { scenario, pricing, record };
    },
  };
}

function id(value: number) {
  return parseUuidV7(`0198f0a0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
