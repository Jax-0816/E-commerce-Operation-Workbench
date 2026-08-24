// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkbenchRouter } from './workbench-router.js';

const containers: HTMLDivElement[] = [];
const product = {
  id: '0198f0a0-0000-7000-8000-000000000001',
  name: '保温杯',
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('routed workbench', () => {
  it('shows real product context and navigates between completed and unavailable sections', async () => {
    const { container, factProductIds, root } = await render(
      '/products/0198f0a0-0000-7000-8000-000000000001/facts',
    );

    expect(container.querySelector('[aria-label="运营上下文"]')?.textContent).toContain('保温杯');
    expect(container.querySelector('h1')?.textContent).toBe('商品事实');
    expect(factProductIds).toEqual([product.id]);

    await click(container, 'SKU');
    expect(container.querySelector('h1')?.textContent).toBe('SKU 与规格');

    await click(container, '竞品');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Phase 7');
    expect(container.textContent).toContain('当前能力尚未实现');
    root.unmount();
  });

  it('derives the selected platform and context from the route query', async () => {
    const { container, root } = await render(
      '/products/0198f0a0-0000-7000-8000-000000000001/platforms?platform=taobao',
    );

    expect(container.querySelector<HTMLSelectElement>('[aria-label="当前平台"]')?.value).toBe(
      'taobao',
    );
    expect(container.querySelector('[aria-label="运营上下文"]')?.textContent).toContain('淘宝');
    root.unmount();
  });
});

async function render(entry: string) {
  const factProductIds: string[] = [];
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <WorkbenchRouter
          factsApi={{
            confirm: async () => undefined as never,
            create: async () => undefined as never,
            list: async (productId) => {
              factProductIds.push(productId);
              return [];
            },
            update: async () => undefined as never,
          }}
          platformProfilesApi={{
            get: async () => undefined,
            save: async () => undefined as never,
          }}
          productsApi={{
            archive: async () => undefined,
            create: async () => undefined,
            list: async () => [product],
          }}
          skusApi={{
            configure: async () => ({ dimensions: [], skus: [] }),
            get: async () => ({ dimensions: [], skus: [] }),
            update: async () => ({ dimensions: [], skus: [] }),
          }}
        />
      </MemoryRouter>,
    );
  });
  return { container, factProductIds, root };
}

async function click(container: HTMLElement, label: string): Promise<void> {
  const link = [...container.querySelectorAll('a')].find(
    (candidate) => candidate.textContent === label,
  );
  expect(link).toBeDefined();
  await act(async () =>
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
  );
}
