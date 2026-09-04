import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProduct, createUuidV7 } from '@eaw/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type OpenDatabase } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { DrizzleProductRepository } from './product-repository.js';
import { DrizzleTitleAssetRepository } from './title-asset-repository.js';

describe('DrizzleTitleAssetRepository', () => {
  let directory: string;
  let database: OpenDatabase;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'eaw-titles-'));
    database = openDatabase(join(directory, 'workbench.sqlite'));
    await migrateDatabase(database, join(process.cwd(), '../../migrations'));
  });
  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true });
  });

  it('appends edits and locked copies without mutating earlier revisions', async () => {
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    await new DrizzleProductRepository(database.drizzle).create(product);
    const repository = new DrizzleTitleAssetRepository(database);
    const lineageId = createUuidV7();
    const titles = [
      {
        variant: 'recommended' as const,
        text: '推荐标题',
        keywords: [],
        claims: [],
        reviewTerms: [],
      },
    ];
    const first = await repository.append({
      id: createUuidV7(),
      lineageId,
      productId: product.id,
      platformId: 'pinduoduo',
      origin: 'edited',
      status: 'verified',
      locked: false,
      titles,
      validationIssues: [],
      dependencyHashes: { facts: 'a'.repeat(64) },
      generationId: null,
      createdAt: new Date(),
    });
    const locked = await repository.append({
      ...first,
      id: createUuidV7(),
      origin: 'locked',
      locked: true,
      generationId: null,
    });
    expect(locked).toMatchObject({ revisionNo: 2, supersedesRevisionId: first.id, locked: true });
    expect((await repository.list(product.id, 'pinduoduo'))[1]?.locked).toBe(false);
    expect(() =>
      database.sqlite.prepare('UPDATE title_asset_revisions SET locked = 1').run(),
    ).toThrow(/immutable/i);
  });
});
