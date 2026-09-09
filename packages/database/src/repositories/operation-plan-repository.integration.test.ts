import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createOperationPlanRevision,
  createProduct,
  createUuidV7,
  lockOperationPlanRevision,
  type OperationPlanRevision,
} from '@eaw/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type OpenDatabase } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { SqliteOperationPlanRepository } from './operation-plan-repository.js';
import { DrizzleProductRepository } from './product-repository.js';

describe('operation plan repository', () => {
  let directory: string;
  let database: OpenDatabase;
  let productId: ReturnType<typeof createUuidV7>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'eaw-operation-plans-'));
    database = openDatabase(join(directory, 'workbench.sqlite'));
    await migrateDatabase(database, join(process.cwd(), '../../migrations'));
    const product = createProduct({ id: createUuidV7(), name: '运营方案商品', now: new Date() });
    productId = product.id;
    await new DrizzleProductRepository(database.drizzle).create(product);
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true });
  });

  it('appends, reopens, and reconstructs exact immutable revisions', async () => {
    let repository = new SqliteOperationPlanRepository(database);
    const draft = createOperationPlanRevision(revision(productId));
    expect(await repository.append(draft, null)).toEqual(draft);
    const locked = lockOperationPlanRevision(
      draft,
      createUuidV7(),
      new Date('2026-09-09T02:00:00.000Z'),
    );
    expect(await repository.append(locked, 1)).toEqual(locked);
    expect((await repository.list(productId)).map(({ revisionNo }) => revisionNo)).toEqual([2, 1]);

    database.close();
    database = openDatabase(join(directory, 'workbench.sqlite'));
    repository = new SqliteOperationPlanRepository(database);
    expect(await repository.findById(locked.id)).toEqual(locked);
    expect(await repository.latest(draft.lineageId)).toEqual(locked);

    expect(() =>
      database.sqlite.prepare('UPDATE operation_plan_revisions SET status = ?').run('draft'),
    ).toThrow(/immutable/i);
    expect(() => database.sqlite.prepare('DELETE FROM operation_plan_node_sources').run()).toThrow(
      /immutable/i,
    );
  });

  it('rejects stale expected revisions atomically', async () => {
    const repository = new SqliteOperationPlanRepository(database);
    const draft = createOperationPlanRevision(revision(productId));
    await repository.append(draft, null);
    const locked = lockOperationPlanRevision(draft, createUuidV7(), new Date());

    await expect(repository.append(locked, 2)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await repository.list(productId)).toHaveLength(1);
  });
});

function revision(productId: ReturnType<typeof createUuidV7>): OperationPlanRevision {
  const id = createUuidV7();
  const nodeKeys = [
    'competitor_analysis',
    'market_insight',
    'selling_points',
    'titles',
    'creative',
    'detail_page',
  ] as const;
  const assetTypes = [
    'competitor_analysis',
    'market_insight',
    'selling_point_set',
    'title_asset',
    'creative_plan',
    'detail_page',
  ] as const;
  return {
    id,
    lineageId: id,
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    status: 'draft',
    lockedAt: null,
    sources: {
      workflowRunId: createUuidV7(),
      workflowRunRevision: 12,
      nodes: nodeKeys.map((nodeKey, index) => ({
        nodeKey,
        assetType: assetTypes[index]!,
        assetId: createUuidV7(),
        revisionNo: index + 1,
        dependencyHash: 'a'.repeat(64),
      })),
      competitorSnapshotIds: [createUuidV7(), createUuidV7()],
      pricing: {
        resultId: createUuidV7(),
        scenarioId: createUuidV7(),
        skuId: createUuidV7(),
        costProfileId: createUuidV7(),
        costProfileRevisionNo: 3,
      },
      promotion: {
        scenarioId: createUuidV7(),
        resultIds: [createUuidV7()],
        ruleSnapshotHash: 'b'.repeat(64),
      },
    },
    sourceHash: 'c'.repeat(64),
    blockers: [],
    supersedesRevisionId: null,
    createdAt: new Date('2026-09-09T01:00:00.000Z'),
  };
}
