import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createProduct,
  createUuidV7,
  type CreativeItem,
  type DetailPageSection,
} from '@eaw/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type OpenDatabase } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { DrizzleCreativePlanRepository } from './creative-plan-repository.js';
import { DrizzleDetailPageRepository } from './detail-page-repository.js';
import { DrizzleProductRepository } from './product-repository.js';

describe('creative and detail repositories', () => {
  let directory: string;
  let database: OpenDatabase;
  let productId: ReturnType<typeof createUuidV7>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'eaw-creative-detail-'));
    database = openDatabase(join(directory, 'workbench.sqlite'));
    await migrateDatabase(database, join(process.cwd(), '../../migrations'));
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    productId = product.id;
    await new DrizzleProductRepository(database.drizzle).create(product);
  });
  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true });
  });

  it('appends creative item regeneration without mutating the earlier plan', async () => {
    const repository = new DrizzleCreativePlanRepository(database);
    const lineageId = createUuidV7();
    const first = await repository.append({
      id: createUuidV7(),
      lineageId,
      productId,
      platformId: 'pinduoduo',
      origin: 'reordered',
      status: 'verified',
      items: creativeItems(),
      dependencyHashes: { facts: 'a'.repeat(64) },
      validationIssues: [],
      generationId: null,
      createdAt: new Date(),
    });
    const second = await repository.append({
      ...first,
      id: createUuidV7(),
      origin: 'locked_item',
      generationId: null,
      items: first.items.map((item, index) => (index === 0 ? { ...item, locked: true } : item)),
    });

    expect(second).toMatchObject({ revisionNo: 2, supersedesRevisionId: first.id });
    expect((await repository.list(productId, 'pinduoduo'))[1]?.items[0]?.locked).toBe(false);
    expect(() =>
      database.sqlite.prepare('UPDATE creative_plan_revisions SET status = ?').run('verified'),
    ).toThrow(/immutable/i);
  });

  it('appends reordered detail sections and preserves their stable ids', async () => {
    const repository = new DrizzleDetailPageRepository(database);
    const lineageId = createUuidV7();
    const sections = detailSections();
    const first = await repository.append({
      id: createUuidV7(),
      lineageId,
      productId,
      platformId: 'pinduoduo',
      origin: 'reordered',
      status: 'verified',
      sections,
      dependencyHashes: { facts: 'a'.repeat(64) },
      validationIssues: [],
      generationId: null,
      createdAt: new Date(),
    });
    const second = await repository.append({
      ...first,
      id: createUuidV7(),
      sections: [
        { ...sections[1]!, order: 1 },
        { ...sections[0]!, order: 2 },
      ],
    });

    expect(second.sections.map(({ id }) => id)).toEqual([sections[1]!.id, sections[0]!.id]);
    expect(await repository.list(productId, 'pinduoduo')).toHaveLength(2);
    expect(() => database.sqlite.prepare('DELETE FROM detail_page_revisions').run()).toThrow(
      /immutable/i,
    );
  });

  function creativeItems(): CreativeItem[] {
    return Array.from({ length: 5 }, (_, index) => ({
      id: createUuidV7(),
      order: index + 1,
      role: index === 0 ? 'hero' : 'supporting',
      headline: `图片 ${index + 1}`,
      body: '画面说明',
      promptZh: '中文提示词',
      promptEn: 'English prompt',
      negativePromptZh: '中文负面提示词',
      negativePromptEn: 'English negative prompt',
      evidenceRefs: [{ kind: 'product_fact', id: createUuidV7(), productId }],
      reviewTerms: [],
      locked: false,
    }));
  }

  function detailSections(): DetailPageSection[] {
    return [1, 2].map((order) => ({
      id: createUuidV7(),
      order,
      kind: order === 1 ? 'hero' : 'benefit',
      headline: `区块 ${order}`,
      body: '区块正文',
      evidenceRefs: [{ kind: 'product_fact', id: createUuidV7(), productId }],
      reviewTerms: [],
      locked: false,
    }));
  }
});
