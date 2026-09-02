import { describe, expect, it } from 'vitest';

import { moneyFromMinorUnits } from '@eaw/calculation-engine';
import {
  createCostProfile,
  parseUuidV7,
  type CostProfile,
  type CostProfileRepository,
  type Product,
  type ProductRepository,
  type PromotionRepository,
  type PromotionResultRecord,
  type PromotionScenario,
  type SkuMatrix,
  type SkuMatrixRepository,
} from '@eaw/domain';
import type { RuleSnapshot } from '@eaw/rule-engine';

import { createPromotionApplication } from './index.js';

const productId = id(1);
const skuOne = id(2);
const skuTwo = id(3);

describe('promotion use cases', () => {
  it('binds an immutable rule snapshot and persists one result per selected SKU', async () => {
    let nextId = 20;
    const promotions = new MemoryPromotionRepository();
    const application = createPromotionApplication({
      costs: new MemoryCostRepository(),
      promotions,
      products: new MemoryProductRepository(),
      rules: {
        async createSnapshot() {
          return {
            id: id(10),
            rulePackId: id(11),
            region: 'CN',
            snapshot: verifiedSnapshot(),
            createdAt: new Date(),
          };
        },
        async getSnapshot() {
          return {
            id: id(10),
            rulePackId: id(11),
            region: 'CN',
            snapshot: verifiedSnapshot(),
            createdAt: new Date(),
          };
        },
      },
      skus: new MemorySkuRepository(),
      idFactory: () => id(nextId++),
      now: () => new Date('2026-09-02T01:00:00.000Z'),
    });
    const scenario = await application.createScenario(productId, {
      name: '两款 SKU 大促',
      region: 'CN',
      categoryCode: null,
      components: [
        {
          key: 'merchant-coupon',
          kind: 'coupon',
          funder: 'merchant',
          priority: 1,
          threshold: moneyFromMinorUnits(0n),
          amount: moneyFromMinorUnits(1_000n),
        },
      ],
      search: { minimumMinorUnits: 5_000n, maximumMinorUnits: 12_000n },
    });
    const batch = await application.calculate(scenario.id, [
      { skuId: skuOne, campaignPrice: moneyFromMinorUnits(10_000n) },
      { skuId: skuTwo, campaignPrice: moneyFromMinorUnits(9_000n) },
    ]);

    expect(scenario.ruleSnapshotHash).toBe('a'.repeat(64));
    expect(batch.rows).toHaveLength(2);
    expect(batch.rows[0]).toMatchObject({ skuId: skuOne, status: 'verified' });
    expect(batch.rows[0]!.simulation.financial?.netProfit.minorUnits).toBe(2_650n);
    expect(batch.rows[1]).toMatchObject({ skuId: skuTwo, status: 'incomplete' });
    expect(batch.rows[1]!.simulation.financial).toBeNull();
    expect(promotions.results).toHaveLength(2);
    expect(promotions.results[0]!.resultSnapshot).toMatchObject({
      ruleSnapshotHash: 'a'.repeat(64),
    });
  });
});

class MemoryPromotionRepository implements PromotionRepository {
  scenarios: PromotionScenario[] = [];
  results: PromotionResultRecord[] = [];
  async createScenario(scenario: PromotionScenario) {
    this.scenarios.push(scenario);
    return scenario;
  }
  async appendResults(
    _scenarioId: PromotionScenario['id'],
    results: readonly PromotionResultRecord[],
  ) {
    this.results.push(...results);
    return results;
  }
  async findScenario(idValue: PromotionScenario['id']) {
    return this.scenarios.find(({ id }) => id === idValue);
  }
  async listScenarios() {
    return this.scenarios;
  }
  async listResults() {
    return this.results;
  }
}

class MemoryCostRepository implements CostProfileRepository {
  profile: CostProfile = createCostProfile({
    id: id(4),
    skuId: skuOne,
    currency: 'CNY',
    now: new Date(),
    items: [
      {
        key: 'materials',
        label: '材料',
        kind: 'per_unit',
        classification: 'cost_of_goods',
        critical: true,
        status: 'confirmed',
        amountMinorUnits: '5000',
        allocationUnits: null,
        unitsPerOrder: null,
        rateBasisPoints: null,
        percentageBase: null,
        formula: null,
      },
    ],
  });
  async findBySkuId(skuId: typeof skuOne) {
    return skuId === skuOne ? this.profile : undefined;
  }
  async create(profile: CostProfile) {
    return profile;
  }
  async update() {
    return undefined;
  }
}

class MemoryProductRepository implements ProductRepository {
  product: Product = {
    id: productId,
    name: '保温杯',
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
  async create(product: Product) {
    return product;
  }
  async findActiveByName() {
    return undefined;
  }
  async findById() {
    return this.product;
  }
  async list() {
    return [this.product];
  }
  async archive() {
    return undefined;
  }
}

class MemorySkuRepository implements SkuMatrixRepository {
  matrix: SkuMatrix = {
    dimensions: [],
    skus: [skuOne, skuTwo].map((skuId, index) => ({
      id: skuId,
      productId,
      signature: String(index),
      valueIds: [],
      enabled: true,
      internalCode: null,
      externalCode: null,
      barcode: null,
      weightGrams: null,
    })),
  };
  async load() {
    return this.matrix;
  }
  async replace() {
    return this.matrix;
  }
  async updateSku() {
    return undefined;
  }
}

function verifiedSnapshot(): RuleSnapshot {
  const rule = (key: string, config: Record<string, string>) => ({
    key,
    type: key.startsWith('promotion.') ? ('promotion' as const) : ('financial' as const),
    scope: { level: 'platform' as const },
    provenance: { url: 'https://example.com', title: '规则', type: 'official' as const },
    verifiedAt: '2026-09-02T00:00:00.000Z',
    effectiveFrom: '2026-09-02T00:00:00.000Z',
    expiresAt: null,
    status: 'verified' as const,
    summary: '规则',
    implementationNote: '规则',
    config,
    impact: 'financial' as const,
  });
  return {
    platformId: 'pinduoduo',
    categoryCode: null,
    resolvedAt: '2026-09-02T00:00:00.000Z',
    status: 'verified',
    issues: [],
    rules: [
      rule('platform.commission_rate', { rateBasisPoints: '1000' }),
      rule('platform.service_fee_rate', { rateBasisPoints: '500' }),
      rule('promotion.platform_subsidy_attribution', { defaultBearer: 'platform' }),
    ],
    hash: 'a'.repeat(64),
  };
}

function id(value: number) {
  return parseUuidV7(`0198f0c0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
