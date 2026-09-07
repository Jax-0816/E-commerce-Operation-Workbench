import {
  parseUuidV7,
  type ContentEvidenceReference,
  type CreativeItem,
  type DetailPageSection,
  type UuidV7,
} from '@eaw/domain';
import { z } from 'zod';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UuidSchema = z.string().regex(UUID_V7).transform(parseUuidV7);
const EvidenceSchema: z.ZodType<ContentEvidenceReference> = z
  .object({
    kind: z.enum(['product_fact', 'strategy_asset', 'title_revision']),
    id: UuidSchema,
    productId: UuidSchema,
  })
  .strict();
const nonEmpty = (maximum: number) => z.string().trim().min(1).max(maximum);

const CreativeItemSchema: z.ZodType<CreativeItem> = z
  .object({
    id: UuidSchema,
    order: z.number().int().min(1).max(5),
    role: z.enum(['hero', 'supporting']),
    headline: nonEmpty(500),
    body: nonEmpty(4_000),
    promptZh: nonEmpty(4_000),
    promptEn: nonEmpty(4_000),
    negativePromptZh: nonEmpty(4_000),
    negativePromptEn: nonEmpty(4_000),
    evidenceRefs: z.array(EvidenceSchema).max(50),
    reviewTerms: z.array(nonEmpty(200)).max(50),
    locked: z.literal(false),
  })
  .strict();

const DetailSectionSchema: z.ZodType<DetailPageSection> = z
  .object({
    id: UuidSchema,
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
    headline: nonEmpty(500),
    body: nonEmpty(8_000),
    evidenceRefs: z.array(EvidenceSchema).max(50),
    reviewTerms: z.array(nonEmpty(200)).max(50),
    locked: z.literal(false),
  })
  .strict();

export interface CreativePlanOutput {
  readonly productId: UuidV7;
  readonly items: readonly CreativeItem[];
}

export interface CreativeItemOutput {
  readonly productId: UuidV7;
  readonly item: CreativeItem;
}

export interface DetailPageOutput {
  readonly productId: UuidV7;
  readonly sections: readonly DetailPageSection[];
}

export type ContentReviewIssue =
  | 'product_mismatch'
  | 'unsupported_evidence'
  | 'review_term'
  | 'invalid_order'
  | 'item_identity_mismatch';

export const CreativePlanOutputSchema: z.ZodType<CreativePlanOutput> = z
  .object({ productId: UuidSchema, items: z.array(CreativeItemSchema).length(5) })
  .strict();

export const CreativeItemOutputSchema: z.ZodType<CreativeItemOutput> = z
  .object({ productId: UuidSchema, item: CreativeItemSchema })
  .strict();

export const DetailPageOutputSchema: z.ZodType<DetailPageOutput> = z
  .object({ productId: UuidSchema, sections: z.array(DetailSectionSchema).min(1).max(30) })
  .strict();

interface ReviewContext {
  readonly productId: UuidV7;
  readonly allowedEvidenceRefs: ReadonlySet<string>;
}

export function reviewCreativePlan(
  value: CreativePlanOutput,
  context: ReviewContext & { readonly requestedItemIds: readonly UuidV7[] },
) {
  const issues = commonIssues(value.productId, value.items, context);
  if (
    value.items.some(({ order }, index) => order !== index + 1) ||
    value.items.length !== context.requestedItemIds.length ||
    value.items.some(({ id }, index) => id !== context.requestedItemIds[index]) ||
    value.items[0]?.role !== 'hero' ||
    value.items.slice(1).some(({ role }) => role !== 'supporting') ||
    new Set(value.items.map(({ id }) => id)).size !== value.items.length
  ) {
    issues.push('invalid_order');
  }
  return { value, issues: unique(issues) } as const;
}

export function reviewCreativeItem(
  value: CreativeItemOutput,
  context: ReviewContext & { readonly requestedItemId: UuidV7 },
) {
  const issues = commonIssues(value.productId, [value.item], context);
  if (value.item.id !== context.requestedItemId) issues.push('item_identity_mismatch');
  return { value, issues: unique(issues) } as const;
}

export function reviewDetailPage(
  value: DetailPageOutput,
  context: ReviewContext & { readonly requestedSectionIds: readonly UuidV7[] },
) {
  const issues = commonIssues(value.productId, value.sections, context);
  if (
    value.sections.some(({ order }, index) => order !== index + 1) ||
    value.sections.length !== context.requestedSectionIds.length ||
    value.sections.some(({ id }, index) => id !== context.requestedSectionIds[index]) ||
    new Set(value.sections.map(({ id }) => id)).size !== value.sections.length
  ) {
    issues.push('invalid_order');
  }
  return { value, issues: unique(issues) } as const;
}

function commonIssues(
  productId: UuidV7,
  items: readonly {
    readonly evidenceRefs: readonly ContentEvidenceReference[];
    readonly reviewTerms: readonly string[];
  }[],
  context: ReviewContext,
): ContentReviewIssue[] {
  const issues: ContentReviewIssue[] = [];
  if (productId !== context.productId) issues.push('product_mismatch');
  if (
    items.some(
      ({ evidenceRefs }) =>
        evidenceRefs.length === 0 ||
        evidenceRefs.some(
          ({ kind, id, productId: owner }) =>
            owner !== context.productId || !context.allowedEvidenceRefs.has(`${kind}:${id}`),
        ),
    )
  ) {
    issues.push('unsupported_evidence');
  }
  if (items.some(({ reviewTerms }) => reviewTerms.length > 0)) issues.push('review_term');
  return issues;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
