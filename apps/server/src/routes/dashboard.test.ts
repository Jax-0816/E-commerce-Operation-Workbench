import type { DashboardApplication, DashboardView } from '@eaw/application';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const snapshot: DashboardView = {
  summary: {
    productCount: 1,
    enabledSkuCount: 2,
    missingCostProfileCount: 1,
    staleAssetCount: 0,
    lossMakingResultCount: 0,
    ruleRiskCount: 1,
  },
  configuration: {
    aiConfigured: false,
    pinduoduoRulePackActive: true,
  },
  attention: [
    {
      code: 'missing_cost_profiles',
      severity: 'warning',
      count: 1,
      label: '补齐 SKU 成本',
      explanation: '有 1 个已启用 SKU 尚未设置成本。',
      href: '/products',
    },
  ],
};

describe('dashboard route', () => {
  it('returns only the strict dashboard snapshot', async () => {
    const get = vi.fn(async () => snapshot);
    const app = buildApp(createAppContext({ dashboard: { get } }));

    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(snapshot);
    expect(get).toHaveBeenCalledOnce();
    await app.close();
  });

  it('returns 503 when dashboard capability is unavailable', async () => {
    const app = buildApp(createAppContext({}));

    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'CAPABILITY_UNAVAILABLE' },
    });
    await app.close();
  });

  it.each([
    { url: '/api/v1/dashboard?include=internal' },
    { url: '/api/v1/dashboard', payload: { include: 'internal' } },
  ])('rejects query strings and request bodies', async (request) => {
    const get = vi.fn(async () => snapshot);
    const app = buildApp(createAppContext({ dashboard: { get } }));

    const response = await app.inject({ method: 'GET', ...request });

    expect(response.statusCode).toBe(400);
    expect(get).not.toHaveBeenCalled();
    await app.close();
  });

  it('fails safely when an application returns extra internal data', async () => {
    const dashboard = {
      get: vi.fn(async () => ({
        ...snapshot,
        workspacePath: '/private/secret',
        apiKey: 'sk-secret',
      })),
    } as DashboardApplication;
    const app = buildApp(createAppContext({ dashboard }));

    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('/private/secret');
    expect(response.body).not.toContain('sk-secret');
    await app.close();
  });
});
