// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { SkusApi } from '../skus/api.js';
import type { PromotionApi } from './api.js';
import { PromotionSimulator } from './promotion-simulator.js';

const productId = '0198f0e0-0000-7000-8000-000000000001';
const skuOne = '0198f0e0-0000-7000-8000-000000000002';
const skuTwo = '0198f0e0-0000-7000-8000-000000000003';
const scenarioId = '0198f0e0-0000-7000-8000-000000000004';
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('PromotionSimulator', () => {
  it('creates one immutable scenario, batch-calculates selected SKUs and exposes every answer', async () => {
    const calls: string[] = [];
    const promotionApi: PromotionApi = {
      async create(_productId, input) {
        calls.push(`create:${input.name}:${input.components.length}`);
        return scenario();
      },
      async calculate(id, input) {
        calls.push(`calculate:${id}:${input.rows.length}`);
        return batch();
      },
      async history() {
        return { items: [] };
      },
    };
    const { container, root } = await render(promotionApi);

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="运行活动批算"]')!.click(),
    );

    expect(calls).toEqual([`create:拼多多活动模拟:2`, `calculate:${scenarioId}:2`]);
    expect(container.textContent).toContain('到手价');
    expect(container.textContent).toContain('商家实收');
    expect(container.textContent).toContain('平台承担');
    expect(container.textContent).toContain('净利润');
    expect(container.textContent).toContain('净利率');
    expect(container.textContent).toContain('保本价');
    expect(container.textContent).toContain('¥70.00');
    expect(container.textContent).toContain('¥26.50');
    expect(container.textContent).toContain('信息不完整');
    expect(container.textContent).toContain('promotion:merchant-coupon');
    root.unmount();
  });
});

async function render(promotionApi: PromotionApi) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  const skusApi: SkusApi = {
    async get() {
      return {
        dimensions: [],
        skus: [sku(skuOne, 'SKU-RED'), sku(skuTwo, 'SKU-BLUE')],
      };
    },
    async configure() {
      throw new Error('unexpected configure');
    },
    async update() {
      throw new Error('unexpected update');
    },
  };
  await act(async () =>
    root.render(
      <PromotionSimulator promotionApi={promotionApi} productId={productId} skusApi={skusApi} />,
    ),
  );
  return { container, root };
}

function batch(): Awaited<ReturnType<PromotionApi['calculate']>> {
  const verified = simulation('verified');
  const incomplete = { ...simulation('incomplete'), financial: null, breakEvenCampaignPrice: null };
  return {
    scenario: scenario(),
    rows: [
      {
        skuId: skuOne,
        status: 'verified',
        simulation: verified,
        record: record(skuOne, 'verified'),
      },
      {
        skuId: skuTwo,
        status: 'incomplete',
        simulation: incomplete,
        record: record(skuTwo, 'incomplete'),
      },
    ],
  };
}

function simulation(status: 'verified' | 'incomplete') {
  const money = (minorUnits: string) => ({ currency: 'CNY', minorUnits });
  return {
    status,
    ruleSnapshotHash: 'a'.repeat(64),
    issues: status === 'incomplete' ? ['COST_MISSING:cost-profile'] : [],
    breakEvenCampaignPrice: money('7000'),
    promotion: {
      campaignPrice: money('10000'),
      consumerPayment: money('7000'),
      merchantSettlement: money('9000'),
      recognizedRevenue: money('9000'),
      merchantFundedDiscount: money('1000'),
      platformFundedDiscount: money('2000'),
      totalDiscount: money('3000'),
      trace: [],
    },
    financial: {
      campaignPrice: money('10000'),
      consumerPayment: money('7000'),
      merchantSettlement: money('9000'),
      recognizedRevenue: money('9000'),
      costOfGoods: money('5000'),
      operatingCosts: money('1350'),
      totalCosts: money('6350'),
      grossProfit: money('4000'),
      netProfit: money('2650'),
      grossMarginBasisPoints: '4444',
      netMarginBasisPoints: '2944',
    },
    trace: [{ operation: 'promotion:merchant-coupon', inputs: {}, outputMinorUnits: '1000' }],
  };
}

function scenario() {
  return {
    id: scenarioId,
    productId,
    name: '拼多多活动模拟',
    platformId: 'pinduoduo' as const,
    region: 'CN',
    ruleSnapshotId: '0198f0e0-0000-7000-8000-000000000005',
    ruleSnapshotHash: 'a'.repeat(64),
    configurationSnapshot: {},
    createdAt: '2026-09-02T00:00:00.000Z',
  };
}

function record(skuId: string, status: 'verified' | 'incomplete') {
  return {
    id: skuId,
    scenarioId,
    skuId,
    costProfileId: null,
    costProfileRevisionNo: null,
    status,
    inputSnapshot: {},
    resultSnapshot: {},
    engineVersion: '0.1.0',
    createdAt: '2026-09-02T00:00:01.000Z',
  };
}

function sku(id: string, internalCode: string) {
  return {
    id,
    signature: internalCode,
    valueIds: [] as string[],
    enabled: true,
    internalCode,
    externalCode: null,
    barcode: null,
    weightGrams: null,
  };
}
