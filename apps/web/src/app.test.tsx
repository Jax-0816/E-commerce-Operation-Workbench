// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './app.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
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
    expect(container.textContent).toContain('产品库');
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

    expect(container.textContent).toContain('当前产品');
    expect(container.textContent).toContain('SKU');
    expect(container.textContent).toContain('平台');
    expect(container.textContent).toContain('规则包');
    expect(container.textContent).toContain('AI 提供商');
    root.unmount();
  });
});
