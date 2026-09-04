import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCompetitor,
  createCompetitorSnapshot,
  createProduct,
  createUuidV7,
  type CompetitorImportBatch,
  type CompetitorImportEntry,
} from '@eaw/domain';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, type OpenDatabase } from '../client.js';
import { migrateDatabase } from '../migrate.js';
import { DrizzleCompetitorRepository } from './competitor-repository.js';
import { DrizzleProductRepository } from './product-repository.js';

describe('DrizzleCompetitorRepository', () => {
  let directory: string;
  let database: OpenDatabase;
  let repository: DrizzleCompetitorRepository;
  let products: DrizzleProductRepository;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'eaw-competitors-'));
    database = openDatabase(join(directory, 'workbench.sqlite'));
    await migrateDatabase(database, join(process.cwd(), '../../migrations'));
    repository = new DrizzleCompetitorRepository(database);
    products = new DrizzleProductRepository(database.drizzle);
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true });
  });

  it('atomically saves an import batch and returns immutable source-preserving snapshots', async () => {
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    await products.create(product);
    const { batch, entry } = fixture(product.id);

    await repository.importBatch(batch, [entry]);
    const listed = await repository.listByProduct(product.id);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.latestSnapshot).toMatchObject({
      displayedSalesText: '10万+',
      normalizedSales: { kind: 'lower_bound', value: '100000' },
    });
    expect(await repository.listSnapshots(entry.competitor.id)).toHaveLength(1);
    expect(() =>
      database.sqlite
        .prepare('UPDATE competitor_snapshots SET displayed_sales_text = ? WHERE id = ?')
        .run('changed', entry.snapshot.id),
    ).toThrow(/immutable/i);
  });

  it('rejects cross-product references and rolls the entire batch back', async () => {
    const first = createProduct({ id: createUuidV7(), name: 'A', now: new Date() });
    const second = createProduct({ id: createUuidV7(), name: 'B', now: new Date() });
    await products.create(first);
    await products.create(second);
    const { batch, entry } = fixture(first.id);
    const crossProductEntry: CompetitorImportEntry = {
      competitor: entry.competitor,
      snapshot: createCompetitorSnapshot({ ...entry.snapshot, productId: second.id }),
    };

    await expect(repository.importBatch(batch, [crossProductEntry])).rejects.toThrow();
    expect(
      database.sqlite.prepare('SELECT count(*) AS count FROM competitors').get(),
    ).toMatchObject({ count: 0 });
    expect(
      database.sqlite.prepare('SELECT count(*) AS count FROM competitor_import_batches').get(),
    ).toMatchObject({ count: 0 });
  });
});

function fixture(productId: ReturnType<typeof createUuidV7>): {
  batch: CompetitorImportBatch;
  entry: CompetitorImportEntry;
} {
  const importedAt = new Date('2026-09-03T00:00:00.000Z');
  const batch: CompetitorImportBatch = {
    id: createUuidV7(),
    productId,
    source: 'csv',
    sourceName: 'competitors.csv',
    snapshotCount: 1,
    importedAt,
  };
  const competitor = createCompetitor({
    id: createUuidV7(),
    productId,
    name: '竞品 A',
    sourceUrl: 'https://example.com/a',
    now: importedAt,
  });
  return {
    batch,
    entry: {
      competitor,
      snapshot: createCompetitorSnapshot({
        id: createUuidV7(),
        competitorId: competitor.id,
        productId,
        importBatchId: batch.id,
        source: 'csv',
        sourceUrl: competitor.sourceUrl,
        displayedPriceText: '¥99.00',
        normalizedPriceMinorUnits: '9900',
        displayedSalesText: '10万+',
        normalizedSales: { kind: 'lower_bound', value: '100000' },
        displayedReviewText: null,
        normalizedReviews: null,
        skuTexts: [],
        sellingPoints: ['304不锈钢'],
        imageReferences: [],
        rawPayload: { sales: '10万+' },
        capturedAt: importedAt,
        importedAt,
      }),
    },
  };
}
