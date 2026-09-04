import { z } from 'zod';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UuidSchema = z.string().regex(UUID_V7);
export const StrategyKindSchema = z.enum([
  'competitor_analysis',
  'market_insight',
  'selling_point_set',
]);
const EvidenceSchema = z
  .object({
    kind: z.enum(['product_fact', 'competitor_snapshot', 'market_insight']),
    id: UuidSchema,
    productId: UuidSchema,
  })
  .strict();
const Text = z.string().min(1).max(2_000);
const CompetitorPayload = z
  .object({
    productId: UuidSchema,
    conclusions: z
      .array(z.object({ summary: Text, evidenceRefs: z.array(EvidenceSchema) }).strict())
      .max(50),
    limitations: z.array(Text).max(50),
  })
  .strict();
const MarketPayload = z
  .object({
    productId: UuidSchema,
    insights: z
      .array(
        z
          .object({ headline: Text, description: Text, evidenceRefs: z.array(EvidenceSchema) })
          .strict(),
      )
      .max(50),
    limitations: z.array(Text).max(50),
  })
  .strict();
const SellingPointPayload = z
  .object({
    productId: UuidSchema,
    sellingPoints: z
      .array(
        z
          .object({
            headline: Text,
            description: Text,
            consumerPainOrBenefit: Text,
            differentiation: Text,
            risk: Text,
            priority: z.number().int().min(1).max(100),
            recommendedUsage: Text,
            evidenceRefs: z.array(EvidenceSchema),
          })
          .strict(),
      )
      .max(50),
    suggestedFacts: z
      .array(
        z.object({ label: Text, reason: Text, evidenceRefs: z.array(EvidenceSchema) }).strict(),
      )
      .max(50),
    limitations: z.array(Text).max(50),
  })
  .strict();

export const StrategyParamsSchema = z
  .object({ productId: UuidSchema, kind: StrategyKindSchema })
  .strict();
export const StrategyAssetResponseSchema = z
  .object({
    id: UuidSchema,
    productId: UuidSchema,
    kind: StrategyKindSchema,
    revisionNo: z.number().int().min(1),
    generationId: UuidSchema,
    status: z.enum(['verified', 'needs_review']),
    payload: z.union([CompetitorPayload, MarketPayload, SellingPointPayload]),
    supersedesAssetId: UuidSchema.nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const StrategyAssetListResponseSchema = z
  .object({ items: z.array(StrategyAssetResponseSchema) })
  .strict();
