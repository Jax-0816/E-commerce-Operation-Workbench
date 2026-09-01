// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { SkusApi } from '../skus/api.js';
import type { CostProfileResponse, CostsApi } from './api.js';
import { CostProfileEditor } from './cost-profile-editor.js';

const productId = '0198f0a0-0000-7000-8000-000000000001';
const skuId = '0198f0a0-0000-7000-8000-000000000002';
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('CostProfileEditor', () => {
  it('loads the first enabled SKU and saves an exact revisioned cost profile', async () => {
    const saves: Parameters<CostsApi['save']>[] = [];
    const { container, root } = await render({
      costsApi: {
        async get() {
          return profile();
        },
        async save(...args) {
          saves.push(args);
          return { ...profile(), revisionNo: 3 };
        },
      },
    });

    expect(container.textContent).toContain('材料');
    expect(container.textContent).toContain('第 2 版');
    await change(
      container.querySelector<HTMLInputElement>('[aria-label="材料 金额（分）"]')!,
      '2300',
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="保存成本档案"]')!.click(),
    );

    expect(saves).toEqual([
      [
        productId,
        skuId,
        {
          currency: 'CNY',
          expectedRevisionNo: 2,
          items: [{ ...profile().items[0], amountMinorUnits: '2300' }],
        },
      ],
    ]);
    expect(container.textContent).toContain('第 3 版');
    root.unmount();
  });

  it('offers an instructive state when a product has no enabled SKU', async () => {
    const { container, root } = await render({ skus: [] });
    expect(container.textContent).toContain('请先在 SKU 页面启用至少一个 SKU');
    root.unmount();
  });

  it('ignores a late profile response from the previously selected SKU', async () => {
    const secondSkuId = '0198f0a0-0000-7000-8000-000000000009';
    const first = deferred<CostProfileResponse | undefined>();
    const second = deferred<CostProfileResponse | undefined>();
    const { container, root } = await render({
      skus: [sku(), { ...sku(), id: secondSkuId, internalCode: 'SKU-002' }],
      costsApi: {
        get: async (_productId, requestedSkuId) =>
          requestedSkuId === skuId ? first.promise : second.promise,
        save: async () => {
          throw new Error('unexpected save');
        },
      },
    });

    const selector = container.querySelector<HTMLSelectElement>('select')!;
    await select(selector, secondSkuId);
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="保存成本档案"]')!.disabled,
    ).toBe(true);
    await act(async () =>
      second.resolve({
        ...profile(),
        skuId: secondSkuId,
        items: [{ ...profile().items[0]!, key: 'packaging', label: '包装' }],
      }),
    );
    await act(async () => first.resolve(profile()));

    expect(container.textContent).toContain('包装');
    expect(container.textContent).not.toContain('材料');
    root.unmount();
  });

  it('unlocks the new SKU when a save for the previous SKU finishes late', async () => {
    const secondSkuId = '0198f0a0-0000-7000-8000-000000000009';
    const oldSave = deferred<CostProfileResponse>();
    const secondProfile = {
      ...profile(),
      skuId: secondSkuId,
      items: [{ ...profile().items[0]!, key: 'packaging', label: '包装' }],
    };
    const { container, root } = await render({
      skus: [sku(), { ...sku(), id: secondSkuId, internalCode: 'SKU-002' }],
      costsApi: {
        async get(_productId, requestedSkuId) {
          return requestedSkuId === skuId ? profile() : secondProfile;
        },
        async save() {
          return oldSave.promise;
        },
      },
    });
    const save = container.querySelector<HTMLButtonElement>('[aria-label="保存成本档案"]')!;
    await act(async () => save.click());
    expect(save.disabled).toBe(true);

    await select(container.querySelector<HTMLSelectElement>('select')!, secondSkuId);
    expect(save.disabled).toBe(false);
    await act(async () => oldSave.resolve({ ...profile(), revisionNo: 3 }));

    expect(save.disabled).toBe(false);
    expect(container.textContent).toContain('包装');
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
    const costsApi: CostsApi = {
      async get() {
        return { ...profile(), skuId: nextSkuId };
      },
      async save() {
        throw new Error('unexpected save');
      },
    };
    const { container, root } = await render({ costsApi, skusApi });
    await act(async () =>
      root.render(
        <CostProfileEditor costsApi={costsApi} productId={nextProductId} skusApi={skusApi} />,
      ),
    );
    await act(async () => oldList.resolve({ dimensions: [], skus: [sku()] }));

    expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe(nextSkuId);
    expect(container.textContent).toContain('SKU-NEW');
    root.unmount();
  });
});

async function render({
  costsApi,
  skusApi: skusApiOverride,
  skus = [sku()],
}: {
  costsApi?: CostsApi;
  skusApi?: SkusApi;
  skus?: ReturnType<typeof sku>[];
} = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  const skusApi: SkusApi =
    skusApiOverride ??
    ({
      async get() {
        return { dimensions: [], skus };
      },
      async configure() {
        throw new Error('unexpected configure');
      },
      async update() {
        throw new Error('unexpected update');
      },
    } satisfies SkusApi);
  const resolvedCostsApi: CostsApi =
    costsApi ??
    ({
      async get() {
        return undefined;
      },
      async save() {
        throw new Error('unexpected save');
      },
    } satisfies CostsApi);
  await act(async () =>
    root.render(
      <CostProfileEditor costsApi={resolvedCostsApi} productId={productId} skusApi={skusApi} />,
    ),
  );
  return { container, root };
}

async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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

function profile(): CostProfileResponse {
  return {
    id: '0198f0a0-0000-7000-8000-000000000003',
    skuId,
    currency: 'CNY',
    revisionNo: 2,
    createdAt: '2026-08-31T04:00:00.000Z',
    updatedAt: '2026-08-31T05:00:00.000Z',
    items: [
      {
        key: 'materials',
        label: '材料',
        kind: 'per_unit',
        classification: 'cost_of_goods',
        critical: true,
        status: 'confirmed',
        amountMinorUnits: '2200',
        allocationUnits: null,
        unitsPerOrder: null,
        rateBasisPoints: null,
        percentageBase: null,
        formula: null,
      },
    ],
  };
}
