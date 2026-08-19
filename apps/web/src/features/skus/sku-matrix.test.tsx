// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { SkuMatrixResponse, SkusApi } from './api.js';
import { SkuMatrix } from './sku-matrix.js';

const productId = '0198f0a0-0000-7000-8000-000000000001';
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('SkuMatrix', () => {
  it('renders combinations and explicitly disables a selected combination', async () => {
    const calls: Parameters<SkusApi['update']>[] = [];
    const initial = matrix(true);
    const { container, root } = await render({
      async get() {
        return initial;
      },
      async update(...args) {
        calls.push(args);
        return matrix(false);
      },
    });

    expect(container.querySelector('table')?.textContent).toContain('红 / 500ml');
    const checkbox = container.querySelector<HTMLInputElement>(
      `[aria-label="启用 ${initial.skus[0]!.signature}"]`,
    )!;
    expect(checkbox.checked).toBe(true);
    await act(async () => checkbox.click());

    expect(calls).toEqual([
      [productId, initial.skus[0]!.id, { ...initial.skus[0]!, enabled: false }],
    ]);
    expect(
      container.querySelector<HTMLInputElement>(
        `[aria-label="启用 ${initial.skus[0]!.signature}"]`,
      )!.checked,
    ).toBe(false);
    root.unmount();
  });

  it('renders the empty matrix state', async () => {
    const calls: Parameters<SkusApi['configure']>[] = [];
    const { container, root } = await render({
      async get() {
        return { dimensions: [], skus: [] };
      },
      async configure(...args) {
        calls.push(args);
        return matrix(true);
      },
    });
    expect(container.textContent).toContain('请先配置规格维度');
    const input = container.querySelector<HTMLTextAreaElement>('[aria-label="规格配置"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(input, '颜色=红\n容量=500ml');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="生成 SKU 矩阵"]')!.click(),
    );
    expect(calls).toEqual([
      [
        productId,
        [
          { name: '颜色', values: ['红'] },
          { name: '容量', values: ['500ml'] },
        ],
      ],
    ]);
    expect(container.querySelector('table')?.textContent).toContain('红 / 500ml');
    root.unmount();
  });
});

async function render(overrides: Partial<SkusApi>) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  const api: SkusApi = {
    async get() {
      throw new Error('unexpected get');
    },
    async configure() {
      throw new Error('unexpected configure');
    },
    async update() {
      throw new Error('unexpected update');
    },
    ...overrides,
  };
  await act(async () => root.render(<SkuMatrix api={api} productId={productId} />));
  return { container, root };
}

function matrix(enabled: boolean): SkuMatrixResponse {
  const dimensions = [
    {
      id: '0198f0a0-0000-7000-8000-000000000002',
      name: '颜色',
      position: 0,
      values: [{ id: '0198f0a0-0000-7000-8000-000000000003', label: '红', position: 0 }],
    },
    {
      id: '0198f0a0-0000-7000-8000-000000000004',
      name: '容量',
      position: 1,
      values: [{ id: '0198f0a0-0000-7000-8000-000000000005', label: '500ml', position: 0 }],
    },
  ] as const;
  return {
    dimensions,
    skus: [
      {
        id: '0198f0a0-0000-7000-8000-000000000006',
        signature: `${dimensions[0].values[0].id}:${dimensions[1].values[0].id}`,
        valueIds: [dimensions[0].values[0].id, dimensions[1].values[0].id],
        enabled,
        internalCode: 'RED-500',
        externalCode: null,
        barcode: null,
        weightGrams: 700,
      },
    ],
  };
}
