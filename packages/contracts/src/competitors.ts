import { z } from 'zod';

const UUID_V7 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const Source = z.enum(['csv', 'paste', 'xlsx']);
const OptionalText = z.string().max(2_048).nullable();
const NormalizedCount = z
  .object({
    kind: z.enum(['exact', 'lower_bound', 'approximate']),
    value: z.string().regex(/^\d+$/u),
  })
  .strict();
export const CompetitorImportIssueSchema = z
  .object({
    rowNumber: z.number().int().positive(),
    field: z.string().min(1).max(100),
    code: z.enum(['invalid', 'required']),
  })
  .strict();
export const CompetitorImportRowSchema = z
  .object({
    rowNumber: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    sourceUrl: OptionalText,
    displayedPriceText: z.string().max(160).nullable(),
    normalizedPriceMinorUnits: z.string().regex(/^\d+$/u).nullable(),
    displayedSalesText: z.string().max(160).nullable(),
    normalizedSales: NormalizedCount.nullable(),
    displayedReviewText: z.string().max(160).nullable(),
    normalizedReviews: NormalizedCount.nullable(),
    skuTexts: z.array(z.string().min(1).max(300)).max(100),
    sellingPoints: z.array(z.string().min(1).max(1_000)).max(100),
    imageReferences: z.array(z.string().min(1).max(500)).max(100),
    capturedAtText: z.string().max(100).nullable(),
    rawPayload: z.record(z.string(), z.string()),
  })
  .strict();

export const PreviewCompetitorImportInputSchema = z.discriminatedUnion('format', [
  z
    .object({
      format: z.enum(['csv', 'paste']),
      sourceName: z.string().trim().min(1).max(255),
      content: z.string().min(1).max(1_000_000),
    })
    .strict(),
  z
    .object({
      format: z.literal('xlsx'),
      sourceName: z.string().trim().min(1).max(255),
      contentsBase64: z
        .string()
        .min(1)
        .max(6_700_000)
        .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u),
    })
    .strict(),
]);

export const CompetitorImportPreviewResponseSchema = z
  .object({
    productId: UUID_V7,
    format: Source,
    sourceName: z.string(),
    valid: z.boolean(),
    rows: z.array(CompetitorImportRowSchema).max(1_000),
    issues: z.array(CompetitorImportIssueSchema),
  })
  .strict();

export const ConfirmCompetitorImportInputSchema = z
  .object({
    previewProductId: UUID_V7,
    format: Source,
    sourceName: z.string().trim().min(1).max(255),
    rows: z.array(CompetitorImportRowSchema).min(1).max(1_000),
  })
  .strict();

const Competitor = z
  .object({
    id: UUID_V7,
    productId: UUID_V7,
    name: z.string(),
    sourceUrl: OptionalText,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const CompetitorSnapshotResponseSchema = z
  .object({
    id: UUID_V7,
    competitorId: UUID_V7,
    productId: UUID_V7,
    importBatchId: UUID_V7,
    source: z.enum(['manual', 'paste', 'csv', 'xlsx', 'url']),
    sourceUrl: OptionalText,
    displayedPriceText: z.string().nullable(),
    normalizedPriceMinorUnits: z.string().regex(/^\d+$/u).nullable(),
    displayedSalesText: z.string().nullable(),
    normalizedSales: NormalizedCount.nullable(),
    displayedReviewText: z.string().nullable(),
    normalizedReviews: NormalizedCount.nullable(),
    skuTexts: z.array(z.string()),
    sellingPoints: z.array(z.string()),
    imageReferences: z.array(z.string()),
    rawPayload: z.json(),
    capturedAt: z.iso.datetime(),
    importedAt: z.iso.datetime(),
  })
  .strict();
export const CompetitorListResponseSchema = z
  .object({
    items: z.array(
      z
        .object({ competitor: Competitor, latestSnapshot: CompetitorSnapshotResponseSchema })
        .strict(),
    ),
  })
  .strict();
export const ConfirmCompetitorImportResponseSchema = z
  .object({
    items: z.array(
      z.object({ competitor: Competitor, snapshot: CompetitorSnapshotResponseSchema }).strict(),
    ),
  })
  .strict();
export const CompetitorSnapshotsResponseSchema = z
  .object({ items: z.array(CompetitorSnapshotResponseSchema) })
  .strict();
export const ProductCompetitorParamsSchema = z.object({ productId: UUID_V7 }).strict();
export const CompetitorParamsSchema = z
  .object({ productId: UUID_V7, competitorId: UUID_V7 })
  .strict();

export type CompetitorImportPreviewResponse = z.infer<typeof CompetitorImportPreviewResponseSchema>;
export type CompetitorListResponse = z.infer<typeof CompetitorListResponseSchema>;
