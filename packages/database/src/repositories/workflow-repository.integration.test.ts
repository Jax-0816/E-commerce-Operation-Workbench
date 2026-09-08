import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProduct, createUuidV7 } from '@eaw/domain';
import { contentWorkflowDefinition } from '@eaw/workflow-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type OpenDatabase } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { DrizzleProductRepository } from './product-repository.js';
import { SqliteWorkflowRepository } from './workflow-repository.js';

describe('SQLite workflow repository', () => {
  let directory: string;
  let database: OpenDatabase;
  let productId: ReturnType<typeof createUuidV7>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'eaw-workflow-'));
    database = openDatabase(join(directory, 'workbench.sqlite'));
    await migrateDatabase(database, join(process.cwd(), '../../migrations'));
    const product = createProduct({ id: createUuidV7(), name: '工作流商品', now: new Date() });
    productId = product.id;
    await new DrizzleProductRepository(database.drizzle).create(product);
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true });
  });

  it('atomically creates a run, six nodes, and the first durable event', async () => {
    const repository = new SqliteWorkflowRepository(database);
    const now = new Date('2026-09-08T01:00:00.000Z');
    const run = await repository.create({
      id: createUuidV7(now),
      productId,
      platformId: 'pinduoduo',
      definition: contentWorkflowDefinition,
      createdAt: now,
    });

    expect(run).toMatchObject({ status: 'not_started', revision: 1 });
    expect(run.nodes.map(({ key, status }) => [key, status])).toEqual(
      contentWorkflowDefinition.nodes.map(({ key }) => [key, 'not_started']),
    );
    expect(await repository.findById(run.id)).toEqual(run);
    expect(await repository.listEvents(run.id, 0)).toEqual([
      expect.objectContaining({ sequence: 1, type: 'workflow_created', runRevision: 1 }),
    ]);
    expect(() =>
      database.sqlite
        .prepare('UPDATE workflow_events SET event_type = ? WHERE workflow_run_id = ?')
        .run('tampered', run.id),
    ).toThrow(/immutable/u);
  });

  it('commits node state, attempt history, events, and revision checks together', async () => {
    const repository = new SqliteWorkflowRepository(database);
    const now = new Date('2026-09-08T01:00:00.000Z');
    const created = await repository.create({
      id: createUuidV7(now),
      productId,
      platformId: 'pinduoduo',
      definition: contentWorkflowDefinition,
      createdAt: now,
    });
    const running = await repository.markRunning(created.id, created.revision);
    const dependencyHash = 'a'.repeat(64);
    const claimed = await repository.claimNode(
      running.id,
      'competitor_analysis',
      dependencyHash,
      running.revision,
    );
    const output = {
      assetType: 'competitor_analysis',
      assetId: createUuidV7(),
      revisionNo: 1,
    } as const;
    const completed = await repository.completeNode(
      claimed.id,
      'competitor_analysis',
      { status: 'completed', output },
      claimed.revision,
    );

    expect(completed).toMatchObject({ revision: 4, status: 'running' });
    expect(completed.nodes[0]).toMatchObject({
      status: 'completed',
      dependencyHash,
      output,
      error: null,
    });
    expect(
      database.sqlite
        .prepare(
          'SELECT attempt_no, dependency_hash, status, finished_at FROM workflow_attempts WHERE workflow_run_id = ? AND node_key = ?',
        )
        .all(created.id, 'competitor_analysis'),
    ).toEqual([
      expect.objectContaining({
        attempt_no: 1,
        dependency_hash: dependencyHash,
        status: 'completed',
        finished_at: expect.any(Number),
      }),
    ]);
    expect(
      (await repository.listEvents(created.id, 0)).map(({ sequence, type }) => [sequence, type]),
    ).toEqual([
      [1, 'workflow_created'],
      [2, 'workflow_started'],
      [3, 'node_claimed'],
      [4, 'node_completed'],
    ]);
    await expect(
      repository.claimNode(created.id, 'market_insight', 'b'.repeat(64), running.revision),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('fails closed on malformed output references and non-contiguous event history', async () => {
    const repository = new SqliteWorkflowRepository(database);
    const malformedRun = await repository.create({
      id: createUuidV7(),
      productId,
      platformId: 'pinduoduo',
      definition: contentWorkflowDefinition,
      createdAt: new Date('2026-09-08T03:00:00.000Z'),
    });
    database.sqlite
      .prepare(
        "UPDATE workflow_nodes SET status = 'completed', dependency_hash = ?, output_json = '{}' WHERE workflow_run_id = ? AND node_key = 'competitor_analysis'",
      )
      .run('d'.repeat(64), malformedRun.id);

    await expect(repository.findById(malformedRun.id)).rejects.toThrow(/output reference/u);

    const eventGapRun = await repository.create({
      id: createUuidV7(),
      productId,
      platformId: 'taobao',
      definition: contentWorkflowDefinition,
      createdAt: new Date('2026-09-08T03:01:00.000Z'),
    });
    database.sqlite
      .prepare(
        'INSERT INTO workflow_events (workflow_run_id,event_sequence,event_type,run_revision,node_key,payload_json,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(eventGapRun.id, 3, 'invalid_gap', 2, null, '{}', Date.now());

    await expect(repository.listEvents(eventGapRun.id, 0)).rejects.toThrow(/sequence/u);
  });

  it('lists only the product workflow runs in newest-first order', async () => {
    const repository = new SqliteWorkflowRepository(database);
    const older = await repository.create({
      id: createUuidV7(new Date('2026-09-08T05:00:00.000Z')),
      productId,
      platformId: 'pinduoduo',
      definition: contentWorkflowDefinition,
      createdAt: new Date('2026-09-08T05:00:00.000Z'),
    });
    const newer = await repository.create({
      id: createUuidV7(new Date('2026-09-08T05:01:00.000Z')),
      productId,
      platformId: 'taobao',
      definition: contentWorkflowDefinition,
      createdAt: new Date('2026-09-08T05:01:00.000Z'),
    });

    expect((await repository.listByProduct(productId)).map(({ id }) => id)).toEqual([
      newer.id,
      older.id,
    ]);
    expect(await repository.listByProduct(createUuidV7())).toEqual([]);
  });
});
