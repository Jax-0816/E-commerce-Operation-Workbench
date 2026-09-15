import { describe, expect, it } from 'vitest';

import { DashboardResponseSchema } from './dashboard.js';

const validDashboard = {
  summary: {
    productCount: 2,
    enabledSkuCount: 4,
    missingCostProfileCount: 1,
    staleAssetCount: 3,
    lossMakingResultCount: 2,
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
} as const;

describe('DashboardResponseSchema', () => {
  it('accepts the closed operational dashboard response', () => {
    expect(DashboardResponseSchema.parse(validDashboard)).toEqual(validDashboard);
  });

  it.each([
    { ...validDashboard, extra: true },
    {
      ...validDashboard,
      summary: { ...validDashboard.summary, productCount: -1 },
    },
    {
      ...validDashboard,
      summary: { ...validDashboard.summary, enabledSkuCount: Number.MAX_SAFE_INTEGER + 1 },
    },
    {
      ...validDashboard,
      attention: [{ ...validDashboard.attention[0], code: 'unknown' }],
    },
    {
      ...validDashboard,
      attention: [{ ...validDashboard.attention[0], severity: 'danger' }],
    },
    {
      ...validDashboard,
      attention: [{ ...validDashboard.attention[0], href: 'https://example.com' }],
    },
    {
      ...validDashboard,
      attention: [{ ...validDashboard.attention[0], href: 'products' }],
    },
    {
      ...validDashboard,
      attention: [{ ...validDashboard.attention[0], href: '//example.com/products' }],
    },
  ])('rejects invalid or open-ended data', (input) => {
    expect(DashboardResponseSchema.safeParse(input).success).toBe(false);
  });
});
