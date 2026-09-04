import {
  createCompetitor,
  createCompetitorSnapshot,
  parseUuidV7,
  type Competitor,
  type CompetitorImportBatch,
  type CompetitorImportEntry,
  type CompetitorRepository,
  type CompetitorSnapshot,
  type CompetitorWithLatestSnapshot,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type Row = Record<string, unknown>;

export class DrizzleCompetitorRepository implements CompetitorRepository {
  constructor(private readonly database: OpenDatabase) {}

  async importBatch(
    batch: CompetitorImportBatch,
    entries: readonly CompetitorImportEntry[],
  ): Promise<readonly CompetitorImportEntry[]> {
    const validated = validateBatch(batch, entries);
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      this.database.sqlite
        .prepare(
          'INSERT INTO competitor_import_batches (id, product_id, source, source_name, snapshot_count, imported_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          validated.batch.id,
          validated.batch.productId,
          validated.batch.source,
          validated.batch.sourceName,
          validated.batch.snapshotCount,
          validated.batch.importedAt.getTime(),
        );
      const insertCompetitor = this.database.sqlite.prepare(
        'INSERT INTO competitors (id, product_id, name, source_url, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      const insertSnapshot = this.database.sqlite.prepare(
        'INSERT INTO competitor_snapshots (id, competitor_id, product_id, import_batch_id, source, source_url, displayed_price_text, normalized_price_minor_units, displayed_sales_text, normalized_sales_json, displayed_review_text, normalized_reviews_json, sku_texts_json, selling_points_json, image_references_json, raw_payload_json, captured_at, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const { competitor, snapshot } of validated.entries) {
        insertCompetitor.run(
          competitor.id,
          competitor.productId,
          competitor.name,
          competitor.sourceUrl,
          competitor.createdAt.getTime(),
          competitor.updatedAt.getTime(),
          competitor.archivedAt?.getTime() ?? null,
        );
        insertSnapshot.run(
          snapshot.id,
          snapshot.competitorId,
          snapshot.productId,
          snapshot.importBatchId,
          snapshot.source,
          snapshot.sourceUrl,
          snapshot.displayedPriceText,
          snapshot.normalizedPriceMinorUnits,
          snapshot.displayedSalesText,
          JSON.stringify(snapshot.normalizedSales),
          snapshot.displayedReviewText,
          JSON.stringify(snapshot.normalizedReviews),
          JSON.stringify(snapshot.skuTexts),
          JSON.stringify(snapshot.sellingPoints),
          JSON.stringify(snapshot.imageReferences),
          JSON.stringify(snapshot.rawPayload),
          snapshot.capturedAt.getTime(),
          snapshot.importedAt.getTime(),
        );
      }
      this.database.sqlite.exec('COMMIT;');
      return validated.entries;
    } catch (error) {
      this.database.sqlite.exec('ROLLBACK;');
      throw error;
    }
  }

  async findCompetitor(id: UuidV7): Promise<Competitor | undefined> {
    const row = this.database.sqlite.prepare('SELECT * FROM competitors WHERE id = ?').get(id) as
      Row | undefined;
    return row === undefined ? undefined : toCompetitor(row);
  }

  async listByProduct(productId: UuidV7): Promise<readonly CompetitorWithLatestSnapshot[]> {
    const rows = this.database.sqlite
      .prepare(
        `SELECT c.*, s.id AS snapshot_id, s.competitor_id AS snapshot_competitor_id,
         s.import_batch_id AS snapshot_import_batch_id, s.source AS snapshot_source,
         s.source_url AS snapshot_source_url,
         s.normalized_price_minor_units AS snapshot_normalized_price_minor_units,
         s.displayed_price_text AS snapshot_displayed_price_text,
         s.displayed_sales_text AS snapshot_displayed_sales_text,
         s.normalized_sales_json AS snapshot_normalized_sales_json,
         s.displayed_review_text AS snapshot_displayed_review_text,
         s.normalized_reviews_json AS snapshot_normalized_reviews_json,
         s.sku_texts_json AS snapshot_sku_texts_json,
         s.selling_points_json AS snapshot_selling_points_json,
         s.image_references_json AS snapshot_image_references_json,
         s.raw_payload_json AS snapshot_raw_payload_json,
         s.captured_at AS snapshot_captured_at, s.imported_at AS snapshot_imported_at
         FROM competitors c
         JOIN competitor_snapshots s ON s.id = (
           SELECT id FROM competitor_snapshots latest
           WHERE latest.competitor_id = c.id
           ORDER BY captured_at DESC, imported_at DESC, id DESC LIMIT 1
         )
         WHERE c.product_id = ? AND c.archived_at IS NULL
         ORDER BY c.created_at ASC, c.id ASC`,
      )
      .all(productId) as Row[];
    return rows.map((row) => ({
      competitor: toCompetitor(row),
      latestSnapshot: toSnapshot(row, 'snapshot_'),
    }));
  }

  async listSnapshots(competitorId: UuidV7): Promise<readonly CompetitorSnapshot[]> {
    const rows = this.database.sqlite
      .prepare(
        'SELECT * FROM competitor_snapshots WHERE competitor_id = ? ORDER BY captured_at ASC, imported_at ASC, id ASC',
      )
      .all(competitorId) as Row[];
    return rows.map((row) => toSnapshot(row));
  }
}

function validateBatch(batch: CompetitorImportBatch, entries: readonly CompetitorImportEntry[]) {
  const sourceName = batch.sourceName.trim();
  if (
    !sourceName ||
    sourceName.length > 255 ||
    !Number.isSafeInteger(batch.importedAt.getTime()) ||
    batch.snapshotCount !== entries.length ||
    entries.length === 0 ||
    entries.length > 1_000
  ) {
    throw new TypeError('Competitor import batch is invalid.');
  }
  const validatedEntries = entries.map(({ competitor, snapshot }) => {
    if (
      competitor.productId !== batch.productId ||
      competitor.createdAt.getTime() !== competitor.updatedAt.getTime() ||
      competitor.archivedAt !== null ||
      snapshot.productId !== batch.productId ||
      snapshot.competitorId !== competitor.id ||
      snapshot.importBatchId !== batch.id ||
      snapshot.source !== batch.source ||
      snapshot.importedAt.getTime() !== batch.importedAt.getTime()
    ) {
      throw new TypeError('Competitor import product ownership is invalid.');
    }
    return {
      competitor: createCompetitor({
        id: competitor.id,
        productId: competitor.productId,
        name: competitor.name,
        sourceUrl: competitor.sourceUrl,
        now: competitor.createdAt,
      }),
      snapshot: createCompetitorSnapshot({ ...snapshot, expectedProductId: batch.productId }),
    };
  });
  return {
    batch: { ...batch, sourceName, importedAt: new Date(batch.importedAt) },
    entries: validatedEntries,
  };
}

function toCompetitor(row: Row): Competitor {
  const createdAt = timestamp(row.created_at);
  const competitor = createCompetitor({
    id: uuid(row.id),
    productId: uuid(row.product_id),
    name: text(row.name),
    sourceUrl: nullableText(row.source_url),
    now: createdAt,
  });
  return Object.freeze({
    ...competitor,
    updatedAt: timestamp(row.updated_at),
    archivedAt: nullableTimestamp(row.archived_at),
  });
}

function toSnapshot(row: Row, prefix = ''): CompetitorSnapshot {
  const get = (name: string) => row[`${prefix}${name}`];
  return createCompetitorSnapshot({
    id: uuid(get('id')),
    competitorId: uuid(get('competitor_id')),
    productId: uuid(row.product_id),
    importBatchId: uuid(get('import_batch_id')),
    source: importSource(get('source')),
    sourceUrl: nullableText(get('source_url')),
    displayedPriceText: nullableText(get('displayed_price_text')),
    normalizedPriceMinorUnits: nullableText(get('normalized_price_minor_units')),
    displayedSalesText: nullableText(get('displayed_sales_text')),
    normalizedSales: parseJson(
      get('normalized_sales_json'),
    ) as CompetitorSnapshot['normalizedSales'],
    displayedReviewText: nullableText(get('displayed_review_text')),
    normalizedReviews: parseJson(
      get('normalized_reviews_json'),
    ) as CompetitorSnapshot['normalizedReviews'],
    skuTexts: parseJson(get('sku_texts_json')) as string[],
    sellingPoints: parseJson(get('selling_points_json')) as string[],
    imageReferences: parseJson(get('image_references_json')) as string[],
    rawPayload: parseJson(get('raw_payload_json')),
    capturedAt: timestamp(get('captured_at')),
    importedAt: timestamp(get('imported_at')),
  });
}

function importSource(value: unknown): CompetitorSnapshot['source'] {
  if (
    value === 'manual' ||
    value === 'paste' ||
    value === 'csv' ||
    value === 'xlsx' ||
    value === 'url'
  ) {
    return value;
  }
  throw new TypeError('Competitor source is invalid.');
}

function uuid(value: unknown): UuidV7 {
  if (typeof value !== 'string') throw new TypeError('Competitor UUID is invalid.');
  return parseUuidV7(value);
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Competitor text is invalid.');
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value;
  throw new TypeError('Competitor nullable text is invalid.');
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') throw new TypeError('Competitor JSON is invalid.');
  return JSON.parse(value) as unknown;
}

function timestamp(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError('Competitor timestamp is invalid.');
  }
  return new Date(value);
}

function nullableTimestamp(value: unknown): Date | null {
  return value === null ? null : timestamp(value);
}
