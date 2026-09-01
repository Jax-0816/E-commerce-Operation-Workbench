import { describe, expect, it } from 'vitest';

import { moneyFromMinorUnits } from '@eaw/calculation-engine';
import {
  parseUuidV7,
  type CostProfile,
  type CostProfileRepository,
  type PricingRepository,
  type PricingResultRecord,
  type PricingScenario,
  type Product,
  type ProductRepository,
  type SkuMatrix,
  type SkuMatrixRepository,
} from '@eaw/domain';

import { createPricingApplication } from './index.js';

const productId = id(1);
const skuId = id(2);

describe('cost and pricing use cases', () => {
  it('saves a revisioned SKU cost profile and appends immutable calculation history', async () => {
    let nextId = 10;
    let now = new Date('2026-08-31T04:00:00.000Z');
    const costs = new MemoryCostRepository();
    const pricing = new MemoryPricingRepository();
    const application = createPricingApplication({
      costs,
      pricing,
      products: new MemoryProductRepository(),
      skus: new MemorySkuRepository(),
      idFactory: () => id(nextId++),
      now: () => now,
      engineVersion: '0.1.0',
    });

    const created = await application.saveCostProfile(productId, skuId, {
      currency: 'CNY',
      items: [costItem('materials', '2000')],
    });
    now = new Date('2026-08-31T05:00:00.000Z');
    const revised = await application.saveCostProfile(productId, skuId, {
      currency: 'CNY',
      expectedRevisionNo: created.revisionNo,
      items: [costItem('materials', '2200')],
    });
    const calculation = await application.calculate(productId, skuId, {
      name: '目标利润 10 元',
      goal: { type: 'target_unit_profit', amount: moneyFromMinorUnits(1_000n) },
      search: { minimumMinorUnits: 0n, maximumMinorUnits: 100_000n },
    });

    expect(revised.revisionNo).toBe(2);
    expect(calculation.pricing.prices.target?.minorUnits).toBe(3_200n);
    expect(calculation.scenario.costProfileRevisionNo).toBe(2);
    expect(calculation.record.resultSnapshot).toMatchObject({
      prices: { target: { currency: 'CNY', minorUnits: '3200' } },
    });
    expect(await application.listHistory(productId, skuId)).toEqual([
      { scenario: calculation.scenario, results: [calculation.record] },
    ]);
  });

  it('rejects stale profile saves and SKU ownership mismatches', async () => {
    const application = createPricingApplication({
      costs: new MemoryCostRepository(),
      pricing: new MemoryPricingRepository(),
      products: new MemoryProductRepository(),
      skus: new MemorySkuRepository(),
    });
    const created = await application.saveCostProfile(productId, skuId, {
      currency: 'CNY',
      items: [costItem('materials', '2000')],
    });

    await expect(
      application.saveCostProfile(productId, skuId, {
        currency: 'CNY',
        expectedRevisionNo: created.revisionNo + 1,
        items: [costItem('materials', '2100')],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(application.getCostProfile(productId, id(99))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

function costItem(key: string, amountMinorUnits: string) {
  return {
    key,
    label: '材料',
    kind: 'per_unit' as const,
    classification: 'cost_of_goods' as const,
    critical: true,
    status: 'confirmed' as const,
    amountMinorUnits,
    allocationUnits: null,
    unitsPerOrder: null,
    rateBasisPoints: null,
    percentageBase: null,
    formula: null,
  };
}

class MemoryCostRepository implements CostProfileRepository {
  profile: CostProfile | undefined;
  async findBySkuId() {
    return this.profile;
  }
  async create(profile: CostProfile) {
    this.profile = profile;
    return profile;
  }
  async update(profile: CostProfile, expectedRevisionNo: number) {
    if (this.profile?.revisionNo !== expectedRevisionNo) return undefined;
    this.profile = profile;
    return profile;
  }
}

class MemoryPricingRepository implements PricingRepository {
  scenarios: PricingScenario[] = [];
  results: PricingResultRecord[] = [];
  async appendCalculation(scenario: PricingScenario, result: PricingResultRecord) {
    this.scenarios.push(scenario);
    this.results.push(result);
    return { scenario, result };
  }
  async listScenarios() {
    return this.scenarios;
  }
  async listResults(scenarioId: PricingScenario['id']) {
    return this.results.filter((result) => result.scenarioId === scenarioId);
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
    skus: [
      {
        id: skuId,
        productId,
        signature: 'default',
        valueIds: [],
        enabled: true,
        internalCode: null,
        externalCode: null,
        barcode: null,
        weightGrams: null,
      },
    ],
  };
  async load() {
    return this.matrix;
  }
  async replace(_productId: Product['id'], matrix: SkuMatrix) {
    this.matrix = matrix;
    return matrix;
  }
  async updateSku() {
    return undefined;
  }
}

function id(value: number) {
  return parseUuidV7(`0198f0a0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
