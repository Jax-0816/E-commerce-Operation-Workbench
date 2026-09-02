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
  it('turns the dashboard into an actionable product readiness ledger', async () => {
    const { container, root } = await render('/');

    expect(container.querySelector('nav[aria-label="主导航"]')).not.toBeNull();
    expect(
      [...container.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('新建商品'),
      ),
    ).toBeDefined();

    const readiness = container.querySelector('[aria-label="商品工作流入口"]');
    expect(readiness?.textContent).toContain('商品事实');
    expect(readiness?.textContent).toContain('SKU');
    expect(readiness?.textContent).toContain('平台档案');
    expect(readiness?.textContent).toContain('成本（Phase 3）');

    const ledger = container.querySelector('table');
    expect(ledger?.querySelector('caption')?.textContent).toBe('商品任务账本');
    expect(ledger?.textContent).toContain('保温杯');
    expect(ledger?.textContent).toContain('SKU 与规格');
    expect(container.querySelector('aside[aria-label="快捷入口"]')?.textContent).toMatch(
      /进入\s*保温杯\s*的平台档案/u,
    );
    root.unmount();
  });

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

  it('opens the implemented platform rule manager from global navigation', async () => {
    const { container, root } = await render('/capabilities/rules');

    expect(container.querySelector('h1')?.textContent).toBe('平台与规则');
    expect(container.querySelector('[aria-label="规则包上下文"]')).not.toBeNull();
    expect(container.textContent).not.toContain('当前能力尚未实现');
    root.unmount();
  });

  it('opens the implemented Pinduoduo promotion simulator', async () => {
    const { container, root } = await render(`/products/${product.id}/promotion`);

    expect(container.querySelector('h1')?.textContent).toBe('拼多多活动模拟');
    expect(container.textContent).not.toContain('当前能力尚未实现');
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
          costsApi={{
            get: async () => undefined,
            save: async () => undefined as never,
          }}
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
            getCapabilities: async () => capabilityResponse('douyin'),
            save: async () => undefined as never,
          }}
          productsApi={{
            archive: async () => undefined,
            create: async () => undefined,
            list: async () => [product],
          }}
          pricingApi={{
            calculate: async () => undefined as never,
            history: async () => ({ items: [] }),
          }}
          promotionApi={{
            calculate: async () => undefined as never,
            create: async () => undefined as never,
            history: async () => ({ items: [] }),
          }}
          rulesApi={{
            activate: async () => undefined as never,
            diff: async () => ({ added: [], removed: [], changed: [] }),
            importJson: async () => undefined as never,
            list: async () => [],
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

  function capabilityResponse(platformId: 'pinduoduo' | 'taobao' | 'douyin') {
    const state = { status: 'supported' as const, available: true, message: '已支持' };
    return {
      platformId:
        platformId === 'taobao'
          ? ('taobao_tmall' as const)
          : platformId === 'douyin'
            ? ('douyin_ecommerce' as const)
            : ('pinduoduo' as const),
      profilePlatformId: platformId,
      displayName: '平台',
      capabilities: {
        content: state,
        creative: state,
        pricing: state,
        promotion: state,
        fee_model: state,
      },
    };
  }
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
