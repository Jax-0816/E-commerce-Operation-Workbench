import {
  type CompetitorAnalysisOutput,
  type MarketInsightOutput,
  type SellingPointSetOutput,
  type StrategyEvidenceReference,
  type UuidV7,
  parseUuidV7,
} from '@eaw/domain';
import { z } from 'zod';

import type { GenerationReview } from './structured.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UuidSchema = z.string().regex(UUID_V7).transform(parseUuidV7);
const TextSchema = z.string().trim().min(1).max(2_000);

export const StrategyEvidenceReferenceSchema: z.ZodType<StrategyEvidenceReference> = z
  .object({
    kind: z.enum(['product_fact', 'competitor_snapshot', 'market_insight']),
    id: UuidSchema,
    productId: UuidSchema,
  })
  .strict();

const EvidenceRefsSchema = z.array(StrategyEvidenceReferenceSchema).max(50);

export const CompetitorAnalysisOutputSchema: z.ZodType<CompetitorAnalysisOutput> = z
  .object({
    productId: UuidSchema,
    conclusions: z
      .array(z.object({ summary: TextSchema, evidenceRefs: EvidenceRefsSchema }).strict())
      .max(50),
    limitations: z.array(TextSchema).max(50),
  })
  .strict();

export const MarketInsightOutputSchema: z.ZodType<MarketInsightOutput> = z
  .object({
    productId: UuidSchema,
    insights: z
      .array(
        z
          .object({
            headline: z.string().trim().min(1).max(160),
            description: TextSchema,
            evidenceRefs: EvidenceRefsSchema,
          })
          .strict(),
      )
      .max(50),
    limitations: z.array(TextSchema).max(50),
  })
  .strict();

export const SellingPointSetOutputSchema: z.ZodType<SellingPointSetOutput> = z
  .object({
    productId: UuidSchema,
    sellingPoints: z
      .array(
        z
          .object({
            headline: z.string().trim().min(1).max(160),
            description: TextSchema,
            consumerPainOrBenefit: TextSchema,
            differentiation: TextSchema,
            risk: TextSchema,
            priority: z.number().int().min(1).max(100),
            recommendedUsage: TextSchema,
            evidenceRefs: EvidenceRefsSchema,
          })
          .strict(),
      )
      .max(50),
    suggestedFacts: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(160),
            reason: TextSchema,
            evidenceRefs: EvidenceRefsSchema,
          })
          .strict(),
      )
      .max(50),
    limitations: z.array(TextSchema).max(50),
  })
  .strict();

export function reviewCompetitorAnalysis(
  value: CompetitorAnalysisOutput,
  context: EvidenceReviewContext,
): GenerationReview<CompetitorAnalysisOutput> {
  const reviewed = reviewItems(value.productId, value.conclusions, context);
  return {
    value: {
      ...value,
      productId: context.productId,
      conclusions: reviewed.accepted,
      limitations: limitations(value.limitations, reviewed.issues),
    },
    issues: reviewed.issues,
  };
}

export function reviewMarketInsight(
  value: MarketInsightOutput,
  context: EvidenceReviewContext,
): GenerationReview<MarketInsightOutput> {
  const reviewed = reviewItems(value.productId, value.insights, context);
  return {
    value: {
      ...value,
      productId: context.productId,
      insights: reviewed.accepted,
      limitations: limitations(value.limitations, reviewed.issues),
    },
    issues: reviewed.issues,
  };
}

export function reviewSellingPointSet(
  value: SellingPointSetOutput,
  context: EvidenceReviewContext,
): GenerationReview<SellingPointSetOutput> {
  const evidenceReviewed = reviewItems(value.productId, value.sellingPoints, context);
  const supported = evidenceReviewed.accepted.filter((item) =>
    item.evidenceRefs.some(({ kind }) => kind === 'product_fact'),
  );
  const missingProductEvidence = evidenceReviewed.accepted.filter(
    (item) => !item.evidenceRefs.some(({ kind }) => kind === 'product_fact'),
  );
  const rejected = [...evidenceReviewed.rejected, ...missingProductEvidence];
  const issues = [
    ...evidenceReviewed.issues,
    ...(missingProductEvidence.length > 0 ? ['unsupported_claim'] : []),
    ...(value.suggestedFacts.length > 0 ? ['suggested_fact_requires_review'] : []),
  ];
  const rejectedSuggested = rejected.map((item) => ({
    label: item.headline,
    reason: '当前证据不足，需补充或确认商品事实后再作为卖点。',
    evidenceRefs: item.evidenceRefs.filter((reference) => allowed(reference, context)),
  }));
  return {
    value: {
      ...value,
      productId: context.productId,
      sellingPoints: supported,
      suggestedFacts: [
        ...value.suggestedFacts.map((fact) => ({
          ...fact,
          evidenceRefs: fact.evidenceRefs.filter((reference) => allowed(reference, context)),
        })),
        ...rejectedSuggested,
      ],
      limitations: limitations(value.limitations, issues),
    },
    issues: [...new Set(issues)],
  };
}

export interface EvidenceReviewContext {
  readonly productId: UuidV7;
  readonly allowedEvidenceRefs: ReadonlySet<string>;
}

function reviewItems<T extends { readonly evidenceRefs: readonly StrategyEvidenceReference[] }>(
  outputProductId: UuidV7,
  items: readonly T[],
  context: EvidenceReviewContext,
) {
  const issues: string[] = [];
  if (outputProductId !== context.productId) issues.push('cross_product_reference');
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const item of items) {
    if (item.evidenceRefs.length === 0) {
      issues.push('unsupported_claim');
      rejected.push(item);
    } else if (item.evidenceRefs.some((reference) => !allowed(reference, context))) {
      issues.push('unsupported_evidence');
      rejected.push(item);
    } else accepted.push(item);
  }
  if (outputProductId !== context.productId) {
    rejected.push(...accepted.splice(0));
  }
  return { accepted, rejected, issues: [...new Set(issues)] };
}

function allowed(reference: StrategyEvidenceReference, context: EvidenceReviewContext): boolean {
  return (
    reference.productId === context.productId &&
    context.allowedEvidenceRefs.has(`${reference.kind}:${reference.id}`)
  );
}

function limitations(existing: readonly string[], issues: readonly string[]): readonly string[] {
  return issues.length === 0
    ? existing
    : [...existing, '部分结论因证据缺失或归属不符而未被自动采纳。'];
}
