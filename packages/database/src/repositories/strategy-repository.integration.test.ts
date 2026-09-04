import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSanitizedGenerationLog } from '@eaw/ai-engine';
import { createProduct, createUuidV7 } from '@eaw/domain';
import type { PromptTemplate } from '@eaw/prompt-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type OpenDatabase } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { DrizzleAIGenerationRepository } from './ai-generation-repository.js';
import { DrizzleProductRepository } from './product-repository.js';
import { DrizzlePromptRepository } from './prompt-repository.js';
import { DrizzleStrategyRepository } from './strategy-repository.js';

describe('DrizzleStrategyRepository', () => {
  let directory: string;
  let database: OpenDatabase;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'eaw-strategy-'));
    database = openDatabase(join(directory, 'workbench.sqlite'));
    await migrateDatabase(database, join(process.cwd(), '../../migrations'));
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true });
  });

  it('appends immutable revisions tied to generation logs', async () => {
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    await new DrizzleProductRepository(database.drizzle).create(product);
    const prompt: PromptTemplate = {
      schemaVersion: '1',
      templateId: 'market-insight',
      task: 'market_insight',
      version: '1.0.0',
      systemRole: 'role',
      taskContract: 'contract',
      outputSchema: { type: 'object' },
    };
    await new DrizzlePromptRepository(database).install({
      id: createUuidV7(),
      template: prompt,
      installedAt: new Date(),
    });
    const repository = new DrizzleStrategyRepository(database);
    let previousId: string | null = null;
    for (let revision = 1; revision <= 2; revision += 1) {
      const generationId = createUuidV7();
      await new DrizzleAIGenerationRepository(database).append(
        createSanitizedGenerationLog({
          id: generationId,
          provider: 'fake',
          model: 'fake',
          task: prompt.task,
          promptTemplateId: prompt.templateId,
          promptVersion: prompt.version,
          inputHash: 'a'.repeat(64),
          requestSnapshot: {},
          rawResponse: '{}',
          parsedResponse: {},
          status: 'verified',
          error: null,
          inputTokens: 1,
          outputTokens: 1,
          startedAt: new Date(),
          finishedAt: new Date(),
          secretValues: [],
        }),
      );
      const asset = await repository.append({
        id: createUuidV7(),
        productId: product.id,
        kind: 'market_insight',
        generationId,
        status: 'verified',
        payload: { productId: product.id, insights: [], limitations: [] },
        createdAt: new Date(),
      });
      expect(asset).toMatchObject({ revisionNo: revision, supersedesAssetId: previousId });
      previousId = asset.id;
    }
    expect(await repository.list(product.id, 'market_insight')).toHaveLength(2);
    expect(() => database.sqlite.prepare('DELETE FROM strategy_assets').run()).toThrow(
      /immutable/i,
    );
  });
});
