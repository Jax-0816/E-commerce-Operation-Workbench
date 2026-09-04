import { z } from 'zod';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const Uuid = z.string().regex(UUID_V7);
const Platform = z.enum(['pinduoduo', 'taobao', 'douyin']);
const Evidence = z.object({ kind: z.literal('product_fact'), id: Uuid, productId: Uuid }).strict();
export const TitleCandidateSchema = z
  .object({
    variant: z.enum(['recommended', 'search', 'selling_point', 'scenario']),
    text: z.string().trim().min(1).max(300),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20),
    claims: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(160),
            evidenceRefs: z.array(Evidence).max(20),
          })
          .strict(),
      )
      .max(20),
    reviewTerms: z.array(z.string().trim().min(1).max(80)).max(20),
  })
  .strict();
export const TitleParamsSchema = z.object({ productId: Uuid }).strict();
export const TitleQuerySchema = z.object({ platformId: Platform }).strict();
export const EditTitlesInputSchema = z
  .object({ titles: z.array(TitleCandidateSchema).length(4) })
  .strict();
const Revision = z
  .object({
    id: Uuid,
    lineageId: Uuid,
    productId: Uuid,
    platformId: Platform,
    revisionNo: z.number().int().min(1),
    origin: z.enum(['generated', 'edited', 'locked']),
    status: z.enum(['verified', 'needs_review']),
    locked: z.boolean(),
    titles: z.array(TitleCandidateSchema),
    validationIssues: z.array(
      z
        .object({
          candidateIndex: z.number().int().min(0),
          code: z.enum([
            'length_exceeded',
            'duplicate_title',
            'forbidden_term',
            'unsupported_claim',
            'review_term',
          ]),
          detail: z.string(),
        })
        .strict(),
    ),
    dependencyHashes: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/u)),
    generationId: Uuid.nullable(),
    supersedesRevisionId: Uuid.nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const TitleAssetViewResponseSchema = z
  .object({ revision: Revision, stale: z.boolean(), staleReasons: z.array(z.string()) })
  .strict();
export const TitleAssetListResponseSchema = z
  .object({ items: z.array(TitleAssetViewResponseSchema) })
  .strict();
