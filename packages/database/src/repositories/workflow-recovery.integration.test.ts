import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProduct, createUuidV7 } from '@eaw/domain';
import { contentWorkflowDefinition } from '@eaw/workflow-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type OpenDatabase } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { DrizzleProductRepository } from './product-repository.js';
import { recoverInterruptedWorkflows } from './workflow-recovery.js';
import { SqliteWorkflowRepository } from './workflow-repository.js';

describe('workflow startup recovery', () => {
  let directory: string;
  let path: string;
  let database: OpenDatabase;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'eaw-workflow-recovery-'));
    path = join(directory, 'workbench.sqlite');
    database = openDatabase(path);
    await migrateDatabase(database, join(process.cwd(), '../../migrations'));
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true });
  });

  it('marks persisted running work interrupted without executing a handler', async () => {
    const product = createProduct({ id: createUuidV7(), name: '恢复测试商品', now: new Date() });
    await new DrizzleProductRepository(database.drizzle).create(product);
    const repository = new SqliteWorkflowRepository(database);
    const created = await repository.create({
      id: createUuidV7(),
      productId: product.id,
      platformId: 'pinduoduo',
      definition: contentWorkflowDefinition,
      createdAt: new Date('2026-09-08T02:00:00.000Z'),
    });
    const running = await repository.markRunning(created.id, created.revision);
    const claimed = await repository.claimNode(
      running.id,
      'competitor_analysis',
      'c'.repeat(64),
      running.revision,
    );
    const handlerCalls = 0;

    database.close();
    database = openDatabase(path);
    const recovered = await recoverInterruptedWorkflows(
      database,
      new Date('2026-09-08T02:05:00.000Z'),
    );

    expect(recovered).toBe(1);
    expect(handlerCalls).toBe(0);
    const reopenedRepository = new SqliteWorkflowRepository(database);
    const interrupted = await reopenedRepository.findById(claimed.id);
    expect(interrupted).toMatchObject({ status: 'interrupted', revision: 4 });
    expect(interrupted?.nodes[0]).toMatchObject({
      status: 'failed',
      error: {
        code: 'WORKFLOW_INTERRUPTED',
        message: 'Workflow execution was interrupted by a process restart.',
      },
    });
    expect(await reopenedRepository.listEvents(claimed.id, 3)).toEqual([
      expect.objectContaining({
        sequence: 4,
        type: 'workflow_interrupted',
        runRevision: 4,
      }),
    ]);
    expect(
      database.sqlite
        .prepare(
          'SELECT status, error_json FROM workflow_attempts WHERE workflow_run_id = ? AND node_key = ?',
        )
        .all(claimed.id, 'competitor_analysis'),
    ).toEqual([
      expect.objectContaining({
        status: 'failed',
        error_json: expect.stringContaining('WORKFLOW_INTERRUPTED'),
      }),
    ]);
  });
});
