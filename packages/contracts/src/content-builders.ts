import { z } from 'zod';

const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const Platform = z.enum(['pinduoduo', 'taobao', 'douyin']);
const Evidence = z
  .object({
    kind: z.enum(['product_fact', 'strategy_asset', 'title_revision']),
    id: Uuid,
    productId: Uuid,
  })
  .strict();
const Issue = z
  .object({
    itemId: Uuid,
    code: z.enum(['unsupported_evidence', 'review_term']),
    detail: z.string(),
  })
  .strict();
const CreativeItem = z
  .object({
    id: Uuid,
    order: z.number().int().min(1).max(5),
    role: z.enum(['hero', 'supporting']),
    headline: z.string(),
    body: z.string(),
    promptZh: z.string(),
    promptEn: z.string(),
    negativePromptZh: z.string(),
    negativePromptEn: z.string(),
    evidenceRefs: z.array(Evidence),
    reviewTerms: z.array(z.string()),
    locked: z.boolean(),
  })
  .strict();
const DetailSection = z
  .object({
    id: Uuid,
    order: z.number().int().min(1).max(30),
    kind: z.enum([
      'hero',
      'benefit',
      'specification',
      'scenario',
      'trust',
      'faq',
      'call_to_action',
    ]),
    headline: z.string(),
    body: z.string(),
    evidenceRefs: z.array(Evidence),
    reviewTerms: z.array(z.string()),
    locked: z.boolean(),
  })
  .strict();
const common = {
  id: Uuid,
  lineageId: Uuid,
  productId: Uuid,
  platformId: Platform,
  revisionNo: z.number().int().min(1),
  status: z.enum(['verified', 'needs_review']),
  dependencyHashes: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/u)),
  validationIssues: z.array(Issue),
  generationId: Uuid.nullable(),
  supersedesRevisionId: Uuid.nullable(),
  createdAt: z.string().datetime(),
};
const CreativeRevision = z
  .object({
    ...common,
    origin: z.enum(['generated', 'regenerated_item', 'locked_item', 'reordered']),
    items: z.array(CreativeItem).length(5),
  })
  .strict();
const DetailRevision = z
  .object({
    ...common,
    origin: z.enum(['generated', 'locked_section', 'reordered']),
    sections: z.array(DetailSection).min(1).max(30),
  })
  .strict();

export const ContentParamsSchema = z.object({ productId: Uuid }).strict();
export const ContentItemParamsSchema = z.object({ productId: Uuid, itemId: Uuid }).strict();
export const ContentSectionParamsSchema = z.object({ productId: Uuid, sectionId: Uuid }).strict();
export const ContentQuerySchema = z.object({ platformId: Platform }).strict();
export const ContentReorderInputSchema = z
  .object({ orderedIds: z.array(Uuid).min(1).max(30) })
  .strict();
export const CreativePlanViewResponseSchema = z
  .object({ revision: CreativeRevision, stale: z.boolean(), staleReasons: z.array(z.string()) })
  .strict();
export const CreativePlanListResponseSchema = z
  .object({ items: z.array(CreativePlanViewResponseSchema) })
  .strict();
export const DetailPageViewResponseSchema = z
  .object({ revision: DetailRevision, stale: z.boolean(), staleReasons: z.array(z.string()) })
  .strict();
export const DetailPageListResponseSchema = z
  .object({ items: z.array(DetailPageViewResponseSchema) })
  .strict();
