import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export const STRATEGY_ASSET_KINDS = [
  'competitor_analysis',
  'market_insight',
  'selling_point_set',
] as const;
export type StrategyAssetKind = (typeof STRATEGY_ASSET_KINDS)[number];
export type StrategyAssetStatus = 'verified' | 'needs_review';
export type EvidenceKind = 'product_fact' | 'competitor_snapshot' | 'market_insight';

export interface StrategyEvidenceReference {
  readonly kind: EvidenceKind;
  readonly id: UuidV7;
  readonly productId: UuidV7;
}

export interface CompetitorConclusion {
  readonly summary: string;
  readonly evidenceRefs: readonly StrategyEvidenceReference[];
}

export interface CompetitorAnalysisOutput {
  readonly productId: UuidV7;
  readonly conclusions: readonly CompetitorConclusion[];
  readonly limitations: readonly string[];
}

export interface MarketInsightItem {
  readonly headline: string;
  readonly description: string;
  readonly evidenceRefs: readonly StrategyEvidenceReference[];
}

export interface MarketInsightOutput {
  readonly productId: UuidV7;
  readonly insights: readonly MarketInsightItem[];
  readonly limitations: readonly string[];
}

export interface SellingPointItem {
  readonly headline: string;
  readonly description: string;
  readonly consumerPainOrBenefit: string;
  readonly differentiation: string;
  readonly risk: string;
  readonly priority: number;
  readonly recommendedUsage: string;
  readonly evidenceRefs: readonly StrategyEvidenceReference[];
}

export interface SuggestedFact {
  readonly label: string;
  readonly reason: string;
  readonly evidenceRefs: readonly StrategyEvidenceReference[];
}

export interface SellingPointSetOutput {
  readonly productId: UuidV7;
  readonly sellingPoints: readonly SellingPointItem[];
  readonly suggestedFacts: readonly SuggestedFact[];
  readonly limitations: readonly string[];
}

export type StrategyAssetPayload =
  CompetitorAnalysisOutput | MarketInsightOutput | SellingPointSetOutput;

export interface StrategyAsset {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly kind: StrategyAssetKind;
  readonly revisionNo: number;
  readonly generationId: UuidV7;
  readonly status: StrategyAssetStatus;
  readonly payload: StrategyAssetPayload;
  readonly supersedesAssetId: UuidV7 | null;
  readonly createdAt: Date;
}

export function createStrategyAsset(input: StrategyAsset): StrategyAsset {
  if (
    !STRATEGY_ASSET_KINDS.includes(input.kind) ||
    !['verified', 'needs_review'].includes(input.status) ||
    !Number.isSafeInteger(input.revisionNo) ||
    input.revisionNo < 1 ||
    !Number.isSafeInteger(input.createdAt.getTime()) ||
    input.payload.productId !== input.productId
  ) {
    throw invalid();
  }
  const payload = structuredClone(input.payload);
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 1_000_000) throw invalid();
  return deepFreeze({ ...input, payload, createdAt: new Date(input.createdAt) });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function invalid(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Strategy asset is invalid.');
}
