// @vitest-environment jsdom

import type { DashboardResponse } from '@eaw/contracts/dashboard';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import type { DashboardApi } from './api.js';
import { OperationalDashboard } from './dashboard.js';

const containers: HTMLDivElement[] = [];
const snapshot: DashboardResponse = {
  summary: {
    productCount: 2,
    enabledSkuCount: 4,
    missingCostProfileCount: 1,
    staleAssetCount: 3,
    lossMakingResultCount: 2,
    ruleRiskCount: 1,
  },
  configuration: { aiConfigured: false, pinduoduoRulePackActive: true },
  attention: [
    {
      code: 'loss_making_results',
      severity: 'critical',
      count: 2,
      label: '检查亏损结果',
      explanation: '有 2 个最新测算结果为亏损。',
      href: '/products',
    },
    {
      code: 'ai_not_configured',
      severity: 'info',
      count: 1,
      label: '配置 DeepSeek',
      explanation: 'DeepSeek 尚未配置。',
      href: '/capabilities/ai',
    },
  ],
};

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('OperationalDashboard', () => {
  it('renders named metrics, truthful configuration, and internal actions', async () => {
    const { container, root } = await render({ get: async () => snapshot });

    expect(container.querySelector('h1')?.textContent).toBe('运营总控台');
    for (const text of [
      '商品数量',
      '启用 SKU',
      '缺失成本',
      '过期内容',
      '最新亏损',
      '待审核规则',
      'DeepSeek 未配置',
      '拼多多规则包已启用',
    ]) {
      expect(container.textContent).toContain(text);
    }
    const actions = [
      ...container.querySelectorAll<HTMLAnchorElement>('[aria-label="待处理事项"] a'),
    ];
    expect(actions.map(({ pathname }) => pathname)).toEqual(['/products', '/capabilities/ai']);
    const items = [...container.querySelectorAll('[aria-label="待处理事项"] li')];
    expect(items[0]?.textContent).toContain('严重');
    expect(items[1]?.textContent).toContain('提示');
    root.unmount();
  });

  it('shows loading without false zeroes, then a safe failure alert', async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<DashboardResponse>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const rendered = await render({ get: () => pending }, false);

    expect(rendered.container.querySelector('[role="status"]')?.textContent).toContain('正在加载');
    expect(rendered.container.textContent).not.toContain('商品数量0');
    await act(async () => reject(new Error('secret backend failure')));
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
      '无法加载运营总控台',
    );
    expect(rendered.container.textContent).not.toContain('secret backend failure');
    expect(rendered.container.querySelector('[aria-label="运营指标"]')).toBeNull();
    rendered.root.unmount();
  });

  it('guides an empty workspace to its first product', async () => {
    const empty: DashboardResponse = {
      ...snapshot,
      summary: {
        productCount: 0,
        enabledSkuCount: 0,
        missingCostProfileCount: 0,
        staleAssetCount: 0,
        lossMakingResultCount: 0,
        ruleRiskCount: 0,
      },
      configuration: { aiConfigured: true, pinduoduoRulePackActive: true },
      attention: [],
    };
    const { container, root } = await render({ get: async () => empty });

    expect(container.textContent).toContain('先创建第一个商品');
    expect(container.querySelector<HTMLAnchorElement>('a[href="/products/new"]')).not.toBeNull();
    expect(container.textContent).toContain('当前没有待处理风险');
    root.unmount();
  });
});

async function render(api: DashboardApi, settle = true) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <OperationalDashboard api={api} />
      </MemoryRouter>,
    );
    if (settle) await Promise.resolve();
  });
  return { container, root };
}
