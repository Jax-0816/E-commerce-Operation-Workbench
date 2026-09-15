import type { Product, SkuMatrix, UuidV7 } from '@eaw/domain';
import type { RuleDefinition } from '@eaw/rule-engine';
import { describe, expect, it, vi } from 'vitest';

import { createDashboardApplication, type DashboardApplicationDependencies } from './index.js';

const id = (suffix: number) =>
  `018f0000-0000-7000-8000-${suffix.toString().padStart(12, '0')}` as UuidV7;
const now = new Date('2026-09-15T08:00:00.000Z');
const product = (suffix: number, archived = false): Product => ({
  id: id(suffix),
  name: `产品 ${suffix}`,
  createdAt: now,
  updatedAt: now,
  archivedAt: archived ? now : null,
});
const matrix = (productId: UuidV7, entries: readonly [number, boolean][]): SkuMatrix => ({
  dimensions: [],
  skus: entries.map(([suffix, enabled]) => ({
    id: id(suffix),
    productId,
    signature: `sku-${suffix}`,
    valueIds: [],
    enabled,
    internalCode: null,
    externalCode: null,
    barcode: null,
    weightGrams: null,
  })),
});

describe('createDashboardApplication', () => {
  it('aggregates only current operational risk in stable attention order', async () => {
    const active = product(1);
    const archived = product(2, true);
    const activeMatrix = matrix(active.id, [
      [11, true],
      [12, true],
      [13, false],
    ]);
    const dependencies = dependenciesFor({ products: [active, archived], matrix: activeMatrix });

    dependencies.pricing.getCostProfile = vi.fn(async (_productId, skuId) =>
      skuId === id(11) ? { id: id(91) } : undefined,
    );
    dependencies.pricing.listHistory = vi.fn(async (_productId, skuId) => [
      {
        scenario: { id: id(60) },
        results: [
          result(id(61), skuId as UuidV7, '2026-09-15T07:00:00.000Z', {
            outcome: { netProfit: { currency: 'CNY', minorUnits: '-900' } },
          }),
          result(id(62), skuId as UuidV7, '2026-09-15T07:30:00.000Z', {
            outcome: {
              netProfit: { currency: 'CNY', minorUnits: skuId === id(11) ? '-100' : '100' },
            },
          }),
        ],
      },
    ]);
    dependencies.promotions.list = vi.fn(async () => [
      {
        scenario: { id: id(70) },
        results: [
          promotionResult(id(71), id(11), '2026-09-15T06:00:00.000Z', '-800'),
          promotionResult(id(72), id(11), '2026-09-15T07:45:00.000Z', '80'),
          promotionResult(id(73), id(12), '2026-09-15T07:40:00.000Z', '-20'),
        ],
      },
    ]);
    dependencies.titles.list = vi.fn(async (_productId, platformId) =>
      platformId === 'pinduoduo'
        ? [assetView(id(31), false, '2026-09-15T06:00:00.000Z'), assetView(id(32), true)]
        : [],
    );
    dependencies.content.listCreative = vi.fn(async (_productId, platformId) =>
      platformId === 'taobao' ? [assetView(id(41), true)] : [],
    );
    dependencies.content.listDetail = vi.fn(async (_productId, platformId) =>
      platformId === 'douyin' ? [assetView(id(51), true)] : [],
    );
    dependencies.rules.list = vi.fn(async () => [rulePackRecord(true, 2)]);
    dependencies.ai.get = vi.fn(async () => ({
      provider: 'deepseek',
      configured: false,
      model: 'deepseek-chat',
    }));

    await expect(createDashboardApplication(dependencies).get()).resolves.toEqual({
      summary: {
        productCount: 1,
        enabledSkuCount: 2,
        missingCostProfileCount: 1,
        staleAssetCount: 3,
        lossMakingResultCount: 2,
        ruleRiskCount: 2,
      },
      configuration: {
        aiConfigured: false,
        pinduoduoRulePackActive: true,
      },
      attention: [
        expect.objectContaining({ code: 'missing_cost_profiles', count: 1, href: '/products' }),
        expect.objectContaining({ code: 'loss_making_results', count: 2, href: '/products' }),
        expect.objectContaining({ code: 'stale_assets', count: 3, href: '/products' }),
        expect.objectContaining({
          code: 'rule_review_required',
          count: 2,
          href: '/capabilities/rules',
        }),
        expect.objectContaining({
          code: 'ai_not_configured',
          count: 1,
          href: '/capabilities/ai',
        }),
      ],
    });
    expect(dependencies.skus.get).not.toHaveBeenCalledWith(archived.id);
    expect(dependencies.pricing.getCostProfile).not.toHaveBeenCalledWith(active.id, id(13));
  });

  it('reports an installed but inactive rule pack separately', async () => {
    const dependencies = dependenciesFor({ products: [], matrix: matrix(id(1), []) });
    dependencies.rules.list = vi.fn(async () => [rulePackRecord(false, 3)]);

    const dashboard = await createDashboardApplication(dependencies).get();

    expect(dashboard.summary.ruleRiskCount).toBe(0);
    expect(dashboard.configuration.pinduoduoRulePackActive).toBe(false);
    expect(dashboard.attention).toEqual([
      expect.objectContaining({
        code: 'active_rule_pack_missing',
        count: 1,
        href: '/capabilities/rules',
      }),
    ]);
  });

  it('fails closed when a latest financial snapshot is malformed', async () => {
    const active = product(1);
    const dependencies = dependenciesFor({
      products: [active],
      matrix: matrix(active.id, [[11, true]]),
    });
    dependencies.pricing.listHistory = vi.fn(async () => [
      {
        scenario: { id: id(60) },
        results: [result(id(61), id(11), '2026-09-15T07:00:00.000Z', { outcome: {} })],
      },
    ]);

    await expect(createDashboardApplication(dependencies).get()).rejects.toThrow(
      'Dashboard financial snapshot is invalid.',
    );
  });
});

function dependenciesFor(input: {
  readonly products: readonly Product[];
  readonly matrix: SkuMatrix;
}): DashboardApplicationDependencies {
  return {
    products: { list: vi.fn(async () => input.products) },
    skus: { get: vi.fn(async () => input.matrix) },
    pricing: {
      getCostProfile: vi.fn(async () => ({
        id: id(90),
      })),
      listHistory: vi.fn(async () => []),
    },
    promotions: {
      list: vi.fn(async () => []),
    },
    rules: { list: vi.fn(async () => [rulePackRecord(true, 0)]) },
    ai: {
      get: vi.fn(async () => ({ provider: 'deepseek', configured: true, model: 'deepseek-chat' })),
    },
    titles: { list: vi.fn(async () => []) },
    content: {
      listCreative: vi.fn(async () => []),
      listDetail: vi.fn(async () => []),
    },
  };
}

function result(idValue: UuidV7, skuId: UuidV7, createdAt: string, resultSnapshot: unknown) {
  return {
    id: idValue,
    scenarioId: id(60),
    skuId,
    status: 'verified' as const,
    inputSnapshot: {},
    resultSnapshot,
    engineVersion: 'test',
    createdAt: new Date(createdAt),
  };
}

function promotionResult(idValue: UuidV7, skuId: UuidV7, createdAt: string, profit: string) {
  return {
    ...result(idValue, skuId, createdAt, {
      financial: { netProfit: { currency: 'CNY', minorUnits: profit } },
    }),
    costProfileId: id(90),
    costProfileRevisionNo: 1,
  };
}

function assetView(idValue: UuidV7, stale: boolean, createdAt = '2026-09-15T08:00:00.000Z') {
  return {
    revision: { id: idValue, createdAt: new Date(createdAt) },
    stale,
    staleReasons: stale ? ['dependency_changed'] : [],
  };
}

function rulePackRecord(active: boolean, reviewCount: number) {
  return {
    id: id(80),
    pack: {
      manifest: {
        schemaVersion: '1',
        platformId: 'pinduoduo',
        region: 'CN',
        version: 'test',
        publisher: 'test',
        verifiedAt: now.toISOString(),
        minimumAppVersion: '0.1.0',
        description: 'test',
        checksum: 'a'.repeat(64),
      },
      rules: Array.from({ length: reviewCount }, (_, index) => rule(index)),
    },
    installedAt: now,
    activatedAt: active ? now : null,
    active,
  };
}

function rule(index: number): RuleDefinition {
  return {
    key: `financial.rule_${index}`,
    type: 'financial',
    scope: { level: 'platform' },
    provenance: { url: 'https://example.invalid', title: 'test', type: 'documentation' },
    verifiedAt: now.toISOString(),
    effectiveFrom: now.toISOString(),
    expiresAt: null,
    status: 'needs_review',
    summary: 'review',
    implementationNote: 'review',
    config: {},
    impact: 'financial',
  };
}
