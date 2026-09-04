import {
  createLocalCompetitorDataProvider,
  type CompetitorDataProvider,
  type CompetitorImportIssue,
  type CompetitorImportPreviewRow,
  type DelimitedImportFormat,
} from '@eaw/competitor-engine';
import {
  createCompetitor,
  createCompetitorSnapshot,
  createUuidV7,
  DomainError,
  parseUuidV7,
  type CompetitorImportEntry,
  type CompetitorRepository,
  type CompetitorSnapshot,
  type CompetitorWithLatestSnapshot,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';

export type CompetitorPreviewInput =
  | {
      readonly format: DelimitedImportFormat;
      readonly sourceName: string;
      readonly content: string;
    }
  | {
      readonly format: 'xlsx';
      readonly sourceName: string;
      readonly content: Uint8Array;
    };

export interface ProductCompetitorImportPreview {
  readonly productId: UuidV7;
  readonly format: 'csv' | 'paste' | 'xlsx';
  readonly sourceName: string;
  readonly valid: boolean;
  readonly rows: readonly CompetitorImportPreviewRow[];
  readonly issues: readonly CompetitorImportIssue[];
}

export interface ConfirmCompetitorImportInput {
  readonly previewProductId: string;
  readonly format: 'csv' | 'paste' | 'xlsx';
  readonly sourceName: string;
  readonly rows: readonly CompetitorImportPreviewRow[];
}

export interface CompetitorsApplication {
  preview(
    productId: string,
    input: CompetitorPreviewInput,
  ): Promise<ProductCompetitorImportPreview>;
  confirm(
    productId: string,
    input: ConfirmCompetitorImportInput,
  ): Promise<readonly CompetitorImportEntry[]>;
  list(productId: string): Promise<readonly CompetitorWithLatestSnapshot[]>;
  listSnapshots(productId: string, competitorId: string): Promise<readonly CompetitorSnapshot[]>;
}

export function createCompetitorsApplication(dependencies: {
  readonly products: ProductRepository;
  readonly repository: CompetitorRepository;
  readonly dataProvider?: CompetitorDataProvider;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
}): CompetitorsApplication {
  const idFactory = dependencies.idFactory ?? createUuidV7;
  const now = dependencies.now ?? (() => new Date());
  const dataProvider = dependencies.dataProvider ?? createLocalCompetitorDataProvider();
  const owner = async (value: string): Promise<UuidV7> => {
    const product = await dependencies.products.findById(parseUuidV7(value));
    if (!product || product.archivedAt !== null) {
      throw new DomainError('NOT_FOUND', 'Product was not found.');
    }
    return product.id;
  };
  return {
    async preview(productIdValue, input) {
      const productId = await owner(productIdValue);
      const sourceName = validSourceName(input.sourceName);
      const result = await dataProvider.preview(input);
      return Object.freeze({
        productId,
        format: input.format,
        sourceName,
        valid: result.valid,
        rows: result.rows,
        issues: result.issues,
      });
    },
    async confirm(productIdValue, input) {
      const productId = await owner(productIdValue);
      if (parseUuidV7(input.previewProductId) !== productId || input.rows.length === 0) {
        throw invalidImport();
      }
      const sourceName = validSourceName(input.sourceName);
      const importedAt = validDate(now());
      const batchId = idFactory();
      const entries = input.rows.map((row): CompetitorImportEntry => {
        const competitorId = idFactory();
        const competitor = createCompetitor({
          id: competitorId,
          productId,
          name: row.name,
          sourceUrl: row.sourceUrl,
          now: importedAt,
        });
        return {
          competitor,
          snapshot: createCompetitorSnapshot({
            id: idFactory(),
            competitorId,
            productId,
            importBatchId: batchId,
            source: input.format,
            sourceUrl: row.sourceUrl,
            displayedPriceText: row.displayedPriceText,
            normalizedPriceMinorUnits: row.normalizedPriceMinorUnits,
            displayedSalesText: row.displayedSalesText,
            normalizedSales: row.normalizedSales,
            displayedReviewText: row.displayedReviewText,
            normalizedReviews: row.normalizedReviews,
            skuTexts: row.skuTexts,
            sellingPoints: row.sellingPoints,
            imageReferences: row.imageReferences,
            rawPayload: row.rawPayload,
            capturedAt:
              row.capturedAtText === null ? importedAt : validDate(new Date(row.capturedAtText)),
            importedAt,
            expectedProductId: productId,
          }),
        };
      });
      return dependencies.repository.importBatch(
        {
          id: batchId,
          productId,
          source: input.format,
          sourceName,
          snapshotCount: entries.length,
          importedAt,
        },
        entries,
      );
    },
    async list(productId) {
      return dependencies.repository.listByProduct(await owner(productId));
    },
    async listSnapshots(productIdValue, competitorIdValue) {
      const productId = await owner(productIdValue);
      const competitor = await dependencies.repository.findCompetitor(
        parseUuidV7(competitorIdValue),
      );
      if (!competitor || competitor.productId !== productId || competitor.archivedAt !== null) {
        throw new DomainError('NOT_FOUND', 'Competitor was not found.');
      }
      return dependencies.repository.listSnapshots(competitor.id);
    },
  };
}

function validSourceName(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) throw invalidImport();
  return normalized;
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) throw invalidImport();
  return new Date(value);
}

function invalidImport(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Competitor import is invalid.');
}
