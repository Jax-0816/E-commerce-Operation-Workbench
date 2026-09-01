// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { SkusApi } from '../skus/api.js';
import type { PricingApi } from './api.js';
import { PricingLaboratory } from './pricing-laboratory.js';

const productId = '0198f0a0-0000-7000-8000-000000000001';
const skuId = '0198f0a0-0000-7000-8000-000000000002';
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('PricingLaboratory', () => {
  it('calculates a target price and exposes status, signed profit, and trace', async () => {
    const calls: Parameters<PricingApi['calculate']>[] = [];
    const { container, root } = await render({
      async calculate(...args) {
        calls.push(args);
        return calculation();
      },
      async history() {
        return { items: [] };
      },
    });

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="执行定价计算"]')!.click(),
    );

    expect(calls).toEqual([
      [
        productId,
        skuId,
        {
          name: '目标单件利润',
          goal: { type: 'target_unit_profit', amountMinorUnits: '1000' },
          minimumMinorUnits: '0',
          maximumMinorUnits: '100000',
        },
      ],
    ]);
    expect(container.textContent).toContain('已验证');
    expect(container.textContent).toContain('¥32.00');
    expect(container.textContent).toContain('¥10.00');
    expect(container.textContent).toContain('汇总成本');
    root.unmount();
  });

  it('formats exact values beyond the JavaScript safe integer range', async () => {
    const response = calculation();
    const exact = '900719925474099301';
    const { container, root } = await render({
      async calculate() {
        return {
          ...response,
          pricing: {
            ...response.pricing,
            prices: {
              ...response.pricing.prices,
              target: { currency: 'CNY', minorUnits: exact },
              recommended: { currency: 'CNY', minorUnits: exact },
            },
          },
        };
      },
      async history() {
        return { items: [] };
      },
    });

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="执行定价计算"]')!.click(),
    );
    expect(container.textContent).toContain('¥9007199254740993.01');
    root.unmount();
  });

  it('ignores history that resolves after the user switches SKU', async () => {
    const secondSkuId = '0198f0a0-0000-7000-8000-000000000009';
    const first = deferred<Awaited<ReturnType<PricingApi['history']>>>();
    const second = deferred<Awaited<ReturnType<PricingApi['history']>>>();
    const response = calculation();
    const { container, root } = await render(
      {
        async calculate() {
          throw new Error('unexpected calculate');
        },
        async history(_productId, requestedSkuId) {
          return requestedSkuId === skuId ? first.promise : second.promise;
        },
      },
      [sku(), { ...sku(), id: secondSkuId, internalCode: 'SKU-002' }],
    );

    await select(
      container.querySelector<HTMLSelectElement>('.pricing-controls select')!,
      secondSkuId,
    );
    await act(async () =>
      second.resolve({
        items: [
          {
            scenario: {
              ...response.scenario,
              id: secondSkuId,
              skuId: secondSkuId,
              name: '第二 SKU 历史',
            },
            results: [{ ...response.record, scenarioId: secondSkuId, skuId: secondSkuId }],
          },
        ],
      }),
    );
    await act(async () =>
      first.resolve({
        items: [
          { scenario: { ...response.scenario, name: '过期历史' }, results: [response.record] },
        ],
      }),
    );

    expect(container.textContent).toContain('第二 SKU 历史');
    expect(container.textContent).not.toContain('过期历史');
    root.unmount();
  });

  it('ignores a late SKU list after the routed product changes', async () => {
    const nextProductId = '0198f0a0-0000-7000-8000-000000000008';
    const nextSkuId = '0198f0a0-0000-7000-8000-000000000009';
    const oldList = deferred<Awaited<ReturnType<SkusApi['get']>>>();
    const skusApi: SkusApi = {
      async get(requestedProductId) {
        return requestedProductId === productId
          ? oldList.promise
          : { dimensions: [], skus: [{ ...sku(), id: nextSkuId, internalCode: 'SKU-NEW' }] };
      },
      async configure() {
        throw new Error('unexpected configure');
      },
      async update() {
        throw new Error('unexpected update');
      },
    };
    const pricingApi: PricingApi = {
      async calculate() {
        throw new Error('unexpected calculate');
      },
      async history() {
        return { items: [] };
      },
    };
    const { container, root } = await render(pricingApi, [], skusApi);
    await act(async () =>
      root.render(
        <PricingLaboratory pricingApi={pricingApi} productId={nextProductId} skusApi={skusApi} />,
      ),
    );
    await act(async () => oldList.resolve({ dimensions: [], skus: [sku()] }));

    expect(container.querySelector<HTMLSelectElement>('.pricing-controls select')?.value).toBe(
      nextSkuId,
    );
    expect(container.textContent).toContain('SKU-NEW');
    root.unmount();
  });
});

async function render(pricingApi: PricingApi, skus = [sku()], skusApiOverride?: SkusApi) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  const skusApi: SkusApi =
    skusApiOverride ??
    ({
      async get() {
        return {
          dimensions: [],
          skus,
        };
      },
      async configure() {
        throw new Error('unexpected configure');
      },
      async update() {
        throw new Error('unexpected update');
      },
    } satisfies SkusApi);
  await act(async () =>
    root.render(
      <PricingLaboratory pricingApi={pricingApi} productId={productId} skusApi={skusApi} />,
    ),
  );
  return { container, root };
}

async function select(input: HTMLSelectElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function sku() {
  return {
    id: skuId,
    signature: 'default',
    valueIds: [] as string[],
    enabled: true,
    internalCode: 'SKU-001',
    externalCode: null,
    barcode: null,
    weightGrams: null,
  };
}

function calculation(): Awaited<ReturnType<PricingApi['calculate']>> {
  return {
    scenario: {
      id: '0198f0a0-0000-7000-8000-000000000010',
      skuId,
      costProfileId: '0198f0a0-0000-7000-8000-000000000003',
      costProfileRevisionNo: 2,
      name: '目标单件利润',
      goalSnapshot: { type: 'target_unit_profit', amountMinorUnits: '1000' },
      createdAt: '2026-08-31T05:00:00.000Z',
    },
    record: {
      id: '0198f0a0-0000-7000-8000-000000000011',
      scenarioId: '0198f0a0-0000-7000-8000-000000000010',
      skuId,
      status: 'verified',
      inputSnapshot: {},
      resultSnapshot: {},
      engineVersion: '0.1.0',
      createdAt: '2026-08-31T05:00:01.000Z',
    },
    pricing: {
      status: 'verified',
      inputSummary: { confirmed: ['materials'], estimated: [], missing: [] },
      prices: {
        breakEven: { currency: 'CNY', minorUnits: '2200' },
        minimumSafe: { currency: 'CNY', minorUnits: '2200' },
        target: { currency: 'CNY', minorUnits: '3200' },
        recommended: { currency: 'CNY', minorUnits: '3200' },
      },
      outcome: {
        campaignPrice: { currency: 'CNY', minorUnits: '3200' },
        consumerPayment: { currency: 'CNY', minorUnits: '3200' },
        recognizedRevenue: { currency: 'CNY', minorUnits: '3200' },
        merchantSettlement: { currency: 'CNY', minorUnits: '3200' },
        costOfGoods: { currency: 'CNY', minorUnits: '2200' },
        operatingCosts: { currency: 'CNY', minorUnits: '0' },
        totalCosts: { currency: 'CNY', minorUnits: '2200' },
        grossProfit: { currency: 'CNY', minorUnits: '1000' },
        netProfit: { currency: 'CNY', minorUnits: '1000' },
        grossMarginBasisPoints: '3125',
        netMarginBasisPoints: '3125',
      },
      trace: [{ operation: '汇总成本', inputs: { materials: '2200' }, outputMinorUnits: '2200' }],
    },
  };
}
