import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createCostProfile,
  createPricingResultRecord,
  createPricingScenario,
  parseUuidV7,
} from '@eaw/domain';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzleCostProfileRepository } from './cost-profile-repository.js';
import { DrizzlePricingRepository } from './pricing-repository.js';

const directories: string[] = [];
const migrationsDirectory = fileURLToPath(new URL('../../../../migrations/', import.meta.url));
const productId = id(1);
const skuId = id(2);

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('cost and pricing repositories', () => {
  it('persists one revisioned cost profile per SKU with one optimistic update winner', async () => {
    const { database, costs } = await fixture();
    const created = await costs.create(profile());
    const first = { ...created, revisionNo: 2, updatedAt: new Date('2026-08-31T05:00:00.000Z') };
    const second = { ...created, revisionNo: 2, updatedAt: new Date('2026-08-31T06:00:00.000Z') };

    const updates = await Promise.all([costs.update(first, 1), costs.update(second, 1)]);

    expect(updates.filter(Boolean)).toHaveLength(1);
    expect(await costs.findBySkuId(skuId)).toEqual(updates.find(Boolean));
    database.close();
  });

  it('appends immutable pricing scenarios and results with exact JSON snapshots', async () => {
    const { database, costs, pricing } = await fixture();
    const costProfile = await costs.create(profile());
    const scenario = createPricingScenario({
      id: id(4),
      skuId,
      costProfileId: costProfile.id,
      costProfileRevisionNo: costProfile.revisionNo,
      name: '目标利润 10 元',
      goalSnapshot: { type: 'target_unit_profit', amountMinorUnits: '1000' },
      createdAt: new Date('2026-08-31T05:00:00.000Z'),
    });
    const result = createPricingResultRecord({
      id: id(5),
      scenarioId: scenario.id,
      skuId,
      status: 'verified',
      inputSnapshot: { currency: 'CNY', costs: costProfile.items },
      resultSnapshot: { targetMinorUnits: '3722', netProfitMinorUnits: '1000' },
      engineVersion: '0.1.0',
      createdAt: new Date('2026-08-31T05:00:01.000Z'),
    });

    await pricing.appendCalculation(scenario, result);

    expect(await pricing.listScenarios(skuId)).toEqual([scenario]);
    expect(await pricing.listResults(scenario.id)).toEqual([result]);
    expect(() =>
      database.sqlite
        .prepare('UPDATE pricing_results SET status=? WHERE id=?')
        .run('warning', result.id),
    ).toThrow(/immutable/i);
    expect(() =>
      database.sqlite.prepare('DELETE FROM pricing_scenarios WHERE id=?').run(scenario.id),
    ).toThrow(/immutable/i);
    database.close();
  });

  it('rolls back the scenario when its result cannot be appended', async () => {
    const { database, costs, pricing } = await fixture();
    const costProfile = await costs.create(profile());
    const existingScenario = createPricingScenario({
      id: id(8),
      skuId,
      costProfileId: costProfile.id,
      costProfileRevisionNo: costProfile.revisionNo,
      name: '已有计算',
      goalSnapshot: { type: 'break_even' },
      createdAt: new Date('2026-08-31T05:00:00.000Z'),
    });
    const existingResult = createPricingResultRecord({
      id: id(7),
      scenarioId: existingScenario.id,
      skuId,
      status: 'verified',
      inputSnapshot: {},
      resultSnapshot: {},
      engineVersion: '0.1.0',
      createdAt: new Date('2026-08-31T05:00:01.000Z'),
    });
    await pricing.appendCalculation(existingScenario, existingResult);
    const scenario = createPricingScenario({
      id: id(6),
      skuId,
      costProfileId: costProfile.id,
      costProfileRevisionNo: costProfile.revisionNo,
      name: '不可分割的计算',
      goalSnapshot: { type: 'break_even' },
      createdAt: new Date('2026-08-31T06:00:00.000Z'),
    });
    const mismatchedResult = createPricingResultRecord({
      id: id(7),
      scenarioId: scenario.id,
      skuId,
      status: 'verified',
      inputSnapshot: {},
      resultSnapshot: {},
      engineVersion: '0.1.0',
      createdAt: new Date('2026-08-31T06:00:01.000Z'),
    });

    await expect(pricing.appendCalculation(scenario, mismatchedResult)).rejects.toThrow();
    expect(await pricing.listScenarios(skuId)).toEqual([existingScenario]);
    database.close();
  });
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-cost-pricing-'));
  directories.push(directory);
  const database = openDatabase(join(directory, 'database.sqlite'));
  await migrateDatabase(database, migrationsDirectory);
  database.sqlite
    .prepare('INSERT INTO products (id,name,active_name) VALUES (?,?,?)')
    .run(productId, '保温杯', '保温杯');
  database.sqlite
    .prepare('INSERT INTO skus VALUES (?,?,?,?,?,?,?,?)')
    .run(skuId, productId, 'default', 1, null, null, null, null);
  return {
    database,
    costs: new DrizzleCostProfileRepository(database),
    pricing: new DrizzlePricingRepository(database),
  };
}

function profile() {
  return createCostProfile({
    id: id(3),
    skuId,
    currency: 'CNY',
    now: new Date('2026-08-31T04:00:00.000Z'),
    items: [
      {
        key: 'materials',
        label: '材料',
        kind: 'per_unit',
        classification: 'cost_of_goods',
        critical: true,
        status: 'confirmed',
        amountMinorUnits: '2000',
        allocationUnits: null,
        unitsPerOrder: null,
        rateBasisPoints: null,
        percentageBase: null,
        formula: null,
      },
    ],
  });
}

function id(value: number) {
  return parseUuidV7(`0198f0a0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
