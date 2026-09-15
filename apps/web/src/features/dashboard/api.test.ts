import { describe, expect, it, vi } from 'vitest';

import { createBrowserDashboardApi } from './api.js';

const snapshot = {
  summary: {
    productCount: 1,
    enabledSkuCount: 2,
    missingCostProfileCount: 1,
    staleAssetCount: 3,
    lossMakingResultCount: 2,
    ruleRiskCount: 1,
  },
  configuration: { aiConfigured: false, pinduoduoRulePackActive: true },
  attention: [],
};

describe('createBrowserDashboardApi', () => {
  it('loads and strictly parses the dashboard snapshot', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 }));

    await expect(createBrowserDashboardApi(fetcher).get()).resolves.toEqual(snapshot);
    expect(fetcher).toHaveBeenCalledWith('/api/v1/dashboard');
  });

  it('rejects failed requests and malformed successful responses', async () => {
    await expect(
      createBrowserDashboardApi(async () => new Response('', { status: 503 })).get(),
    ).rejects.toThrow('无法加载运营总控台');
    await expect(
      createBrowserDashboardApi(
        async () => new Response(JSON.stringify({ ...snapshot, workspacePath: '/secret' })),
      ).get(),
    ).rejects.toThrow();
  });
});
