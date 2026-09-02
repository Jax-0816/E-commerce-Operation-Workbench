import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createPromotionResultRecord, createPromotionScenario, parseUuidV7 } from '@eaw/domain';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzlePromotionRepository } from './promotion-repository.js';

const directories: string[] = [];
const migrationsDirectory = fileURLToPath(new URL('../../../../migrations/', import.meta.url));
const productId = id(1);
const skuOne = id(2);
const skuTwo = id(3);
const snapshotId = id(4);

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('promotion repository', () => {
  it('persists immutable scenario, snapshot binding, trace and multi-SKU rows', async () => {
    const { database, promotions } = await fixture();
    const scenario = await promotions.createScenario(scenarioRecord());
    const results = [resultRecord(6, skuOne, scenario.id), resultRecord(7, skuTwo, scenario.id)];

    await promotions.appendResults(scenario.id, results);

    expect(await promotions.findScenario(scenario.id)).toEqual(scenario);
    expect(await promotions.listScenarios(productId)).toEqual([scenario]);
    expect(await promotions.listResults(scenario.id)).toEqual(results);
    expect(() =>
      database.sqlite
        .prepare('UPDATE promotion_results SET status=? WHERE id=?')
        .run('warning', results[0]!.id),
    ).toThrow(/immutable/i);
    expect(() =>
      database.sqlite.prepare('DELETE FROM promotion_scenarios WHERE id=?').run(scenario.id),
    ).toThrow(/immutable/i);
    database.close();
  });

  it('rolls back every row when one batch result conflicts', async () => {
    const { database, promotions } = await fixture();
    const scenario = await promotions.createScenario(scenarioRecord());
    const duplicateId = id(8);
    const results = [
      resultRecord(8, skuOne, scenario.id),
      { ...resultRecord(9, skuTwo, scenario.id), id: duplicateId },
    ];

    await expect(promotions.appendResults(scenario.id, results)).rejects.toThrow();
    expect(await promotions.listResults(scenario.id)).toEqual([]);
    database.close();
  });
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-promotion-'));
  directories.push(directory);
  const database = openDatabase(join(directory, 'database.sqlite'));
  await migrateDatabase(database, migrationsDirectory);
  database.sqlite
    .prepare('INSERT INTO products (id,name,active_name) VALUES (?,?,?)')
    .run(productId, '保温杯', '保温杯');
  const insertSku = database.sqlite.prepare('INSERT INTO skus VALUES (?,?,?,?,?,?,?,?)');
  insertSku.run(skuOne, productId, 'red', 1, null, null, null, null);
  insertSku.run(skuTwo, productId, 'blue', 1, null, null, null, null);
  database.sqlite
    .prepare(
      'INSERT INTO rule_packs (id,platform_id,region,version,checksum,manifest_json,rules_json,installed_at,activated_at,active) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    .run(id(10), 'pinduoduo', 'CN', '1.0.0', 'b'.repeat(64), '{}', '[]', 1, 1, 1);
  database.sqlite
    .prepare(
      'INSERT INTO rule_snapshots (id,rule_pack_id,platform_id,region,category_code,snapshot_hash,snapshot_json,created_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(snapshotId, id(10), 'pinduoduo', 'CN', null, 'a'.repeat(64), '{}', 2);
  return { database, promotions: new DrizzlePromotionRepository(database) };
}

function scenarioRecord() {
  return createPromotionScenario({
    id: id(5),
    productId,
    name: '全店大促',
    platformId: 'pinduoduo',
    region: 'CN',
    ruleSnapshotId: snapshotId,
    ruleSnapshotHash: 'a'.repeat(64),
    configurationSnapshot: { components: [], search: { minimum: '0', maximum: '10000' } },
    createdAt: new Date('2026-09-02T00:00:00.000Z'),
  });
}

function resultRecord(
  value: number,
  skuId: ReturnType<typeof id>,
  scenarioId: ReturnType<typeof id>,
) {
  return createPromotionResultRecord({
    id: id(value),
    scenarioId,
    skuId,
    costProfileId: null,
    costProfileRevisionNo: null,
    status: 'incomplete',
    inputSnapshot: { campaignPriceMinorUnits: '10000' },
    resultSnapshot: { financial: null, trace: [] },
    engineVersion: '0.1.0',
    createdAt: new Date(`2026-09-02T00:00:${String(value).padStart(2, '0')}.000Z`),
  });
}

function id(value: number) {
  return parseUuidV7(`0198f0b0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
