import { describe, expect, it } from 'vitest';

import {
  createProduct,
  createUuidV7,
  type Competitor,
  type CompetitorImportBatch,
  type CompetitorImportEntry,
  type CompetitorRepository,
  type CompetitorSnapshot,
  type CompetitorWithLatestSnapshot,
  type Product,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';

import { createCompetitorsApplication } from './index.js';

describe('competitors application', () => {
  it('previews then confirms an auditable product-owned import batch', async () => {
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    const products = new MemoryProductRepository(product);
    const competitors = new MemoryCompetitorRepository();
    const ids = Array.from({ length: 3 }, () => createUuidV7());
    const application = createCompetitorsApplication({
      products,
      repository: competitors,
      idFactory: () => ids.shift()!,
      now: () => new Date('2026-09-03T08:00:00.000Z'),
    });

    const preview = await application.preview(product.id, {
      format: 'csv',
      sourceName: 'competitors.csv',
      content: 'name,price,sales\n竞品 A,¥99,10万+',
    });
    expect(preview).toMatchObject({ productId: product.id, valid: true });
    expect(preview.rows[0]).toMatchObject({ displayedSalesText: '10万+' });

    const imported = await application.confirm(product.id, {
      previewProductId: preview.productId,
      format: preview.format,
      sourceName: preview.sourceName,
      rows: preview.rows,
    });
    expect(imported).toHaveLength(1);
    expect(competitors.batch).toMatchObject({ productId: product.id, snapshotCount: 1 });
    expect((await application.list(product.id))[0]?.latestSnapshot.displayedSalesText).toBe(
      '10万+',
    );
  });

  it('rejects missing products, cross-product confirmations and invalid previews', async () => {
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    const application = createCompetitorsApplication({
      products: new MemoryProductRepository(product),
      repository: new MemoryCompetitorRepository(),
    });
    await expect(
      application.preview(createUuidV7(), {
        format: 'paste',
        sourceName: 'paste',
        content: 'name\nA',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      application.confirm(product.id, {
        previewProductId: createUuidV7(),
        format: 'paste',
        sourceName: 'paste',
        rows: [],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const invalid = await application.preview(product.id, {
      format: 'paste',
      sourceName: 'paste',
      content: 'name\n',
    });
    await expect(
      application.confirm(product.id, {
        previewProductId: product.id,
        format: 'paste',
        sourceName: 'paste',
        rows: invalid.rows,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

class MemoryProductRepository implements ProductRepository {
  constructor(private readonly product: Product) {}
  async create(product: Product) {
    return product;
  }
  async findById(id: UuidV7) {
    return id === this.product.id ? this.product : undefined;
  }
  async findActiveByName(name: string) {
    return name === this.product.name ? this.product : undefined;
  }
  async list() {
    return [this.product];
  }
  async archive() {
    return undefined;
  }
}

class MemoryCompetitorRepository implements CompetitorRepository {
  batch: CompetitorImportBatch | undefined;
  entries: readonly CompetitorImportEntry[] = [];
  async importBatch(batch: CompetitorImportBatch, entries: readonly CompetitorImportEntry[]) {
    this.batch = batch;
    this.entries = entries;
    return entries;
  }
  async findCompetitor(id: UuidV7): Promise<Competitor | undefined> {
    return this.entries.find(({ competitor }) => competitor.id === id)?.competitor;
  }
  async listByProduct(productId: UuidV7): Promise<readonly CompetitorWithLatestSnapshot[]> {
    return this.entries
      .filter(({ competitor }) => competitor.productId === productId)
      .map(({ competitor, snapshot }) => ({ competitor, latestSnapshot: snapshot }));
  }
  async listSnapshots(competitorId: UuidV7): Promise<readonly CompetitorSnapshot[]> {
    return this.entries
      .filter(({ competitor }) => competitor.id === competitorId)
      .map(({ snapshot }) => snapshot);
  }
}
