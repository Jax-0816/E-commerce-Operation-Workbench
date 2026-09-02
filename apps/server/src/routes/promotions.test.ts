import { describe, expect, it } from 'vitest';

import type { PromotionApplication } from '@eaw/application';
import { moneyFromMinorUnits } from '@eaw/calculation-engine';
import { parseUuidV7, type PromotionScenario } from '@eaw/domain';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const productId = id(1);
const scenarioId = id(2);
const skuId = id(3);

describe('promotion routes', () => {
  it('creates a Pinduoduo scenario through strict component contracts', async () => {
    const app = buildApp(createAppContext({ promotions: fakeApplication() }));
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/promotion-scenarios`,
      payload: {
        name: '九月大促',
        region: 'CN',
        categoryCode: null,
        minimumMinorUnits: '5000',
        maximumMinorUnits: '12000',
        components: [
          {
            key: 'merchant-coupon',
            kind: 'coupon',
            funder: 'merchant',
            priority: 1,
            threshold: { currency: 'CNY', minorUnits: '0' },
            amount: { currency: 'CNY', minorUnits: '1000' },
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: scenarioId,
      platformId: 'pinduoduo',
      ruleSnapshotHash: 'a'.repeat(64),
    });
    await app.close();
  });

  it('calculates a multi-SKU batch and rejects duplicate rows', async () => {
    const app = buildApp(createAppContext({ promotions: fakeApplication() }));
    const valid = await app.inject({
      method: 'POST',
      url: `/api/v1/promotion-scenarios/${scenarioId}/calculate`,
      payload: { rows: [{ skuId, campaignPrice: { currency: 'CNY', minorUnits: '10000' } }] },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/promotion-scenarios/${scenarioId}/calculate`,
      payload: {
        rows: [
          { skuId, campaignPrice: { currency: 'CNY', minorUnits: '10000' } },
          { skuId, campaignPrice: { currency: 'CNY', minorUnits: '9000' } },
        ],
      },
    });

    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toMatchObject({
      rows: [
        {
          skuId,
          status: 'verified',
          simulation: {
            promotion: { consumerPayment: { minorUnits: '9000' } },
            financial: { netProfit: { minorUnits: '2650' } },
          },
        },
      ],
    });
    expect(duplicate.statusCode).toBe(400);
    await app.close();
  });
});

function fakeApplication(): PromotionApplication {
  const scenario: PromotionScenario = {
    id: scenarioId,
    productId,
    name: '九月大促',
    platformId: 'pinduoduo',
    region: 'CN',
    ruleSnapshotId: id(4),
    ruleSnapshotHash: 'a'.repeat(64),
    configurationSnapshot: {},
    createdAt: new Date('2026-09-02T00:00:00.000Z'),
  };
  return {
    async createScenario() {
      return scenario;
    },
    async list() {
      return [];
    },
    async calculate(_scenarioId, rows) {
      const campaignPrice = rows[0]!.campaignPrice;
      const consumerPayment = moneyFromMinorUnits(9_000n);
      const merchantSettlement = moneyFromMinorUnits(9_000n);
      const zero = moneyFromMinorUnits(0n);
      const simulation = {
        status: 'verified' as const,
        ruleSnapshotHash: 'a'.repeat(64),
        issues: [],
        breakEvenCampaignPrice: moneyFromMinorUnits(7_000n),
        promotion: {
          campaignPrice,
          consumerPayment,
          merchantSettlement,
          recognizedRevenue: merchantSettlement,
          merchantFundedDiscount: moneyFromMinorUnits(1_000n),
          platformFundedDiscount: zero,
          totalDiscount: moneyFromMinorUnits(1_000n),
          trace: [],
        },
        financial: {
          campaignPrice,
          consumerPayment,
          merchantSettlement,
          recognizedRevenue: merchantSettlement,
          costOfGoods: moneyFromMinorUnits(5_000n),
          operatingCosts: moneyFromMinorUnits(1_350n),
          totalCosts: moneyFromMinorUnits(6_350n),
          grossProfit: { currency: 'CNY', minorUnits: 4_000n },
          netProfit: { currency: 'CNY', minorUnits: 2_650n },
          grossMarginBasisPoints: 4_444n,
          netMarginBasisPoints: 2_944n,
        },
        trace: [],
      };
      const record = {
        id: id(5),
        scenarioId,
        skuId: rows[0]!.skuId,
        costProfileId: id(6),
        costProfileRevisionNo: 1,
        status: 'verified' as const,
        inputSnapshot: {},
        resultSnapshot: {},
        engineVersion: '0.1.0',
        createdAt: new Date('2026-09-02T00:00:01.000Z'),
      };
      return {
        scenario,
        rows: [{ skuId: rows[0]!.skuId, status: 'verified', simulation, record }],
      };
    },
  };
}

function id(value: number) {
  return parseUuidV7(`0198f0d0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
