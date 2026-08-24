// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './app.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  window.history.replaceState(null, '', '/');
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

describe('workbench shell', () => {
  it('renders the Chinese global navigation', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    expect(container.textContent).toContain('工作台');
    expect(container.textContent).toContain('商品库');
    expect(container.textContent).toContain('内容资产');
    expect(container.textContent).toContain('平台与规则');
    expect(container.textContent).toContain('AI 设置');
    expect(container.textContent).toContain('数据管理');
    expect(container.textContent).toContain('系统设置');
    root.unmount();
  });

  it('renders the five-field work context bar', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    expect(container.textContent).toContain('当前商品');
    expect(container.textContent).toContain('SKU');
    expect(container.textContent).toContain('平台');
    expect(container.textContent).toContain('规则包');
    expect(container.textContent).toContain('AI Provider');
    root.unmount();
  });

  it('opens platform profiles for the selected product', async () => {
    window.history.replaceState(null, '', '/products');
    const product = {
      id: '0198f255-6a84-7000-8000-000000000001',
      name: '防晒衣',
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
    };
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <App
          factsApi={{
            confirm: async () => undefined as never,
            create: async () => undefined as never,
            list: async () => [],
            update: async () => undefined as never,
          }}
          platformProfilesApi={{ get: async () => undefined, save: async () => undefined as never }}
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
        />,
      );
    });

    const manageButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '进入商品工作区',
    );
    expect(manageButton).toBeDefined();
    await act(async () => {
      manageButton?.click();
    });

    const platformLink = [...container.querySelectorAll('a')].find(
      (link) => link.textContent === '平台档案',
    );
    expect(platformLink).toBeDefined();
    await act(async () => {
      platformLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[aria-label="平台档案"]')).not.toBeNull();
    root.unmount();
  });
});
