import { DomainError } from '../errors.js';
import { parseUuidV7, type UuidV7 } from '../ids.js';
import { PLATFORM_IDS, type PlatformId } from '../platform-profiles/platform-profile.js';

export const OPERATION_PLAN_NODE_KEYS = [
  'competitor_analysis',
  'market_insight',
  'selling_points',
  'titles',
  'creative',
  'detail_page',
] as const;
export type OperationPlanNodeKey = (typeof OPERATION_PLAN_NODE_KEYS)[number];

export const OPERATION_PLAN_ASSET_TYPES = [
  'competitor_analysis',
  'market_insight',
  'selling_point_set',
  'title_asset',
  'creative_plan',
  'detail_page',
] as const;
export type OperationPlanAssetType = (typeof OPERATION_PLAN_ASSET_TYPES)[number];

export type OperationPlanBlockerCode =
  | 'SOURCE_STALE'
  | 'SOURCE_NEEDS_REVIEW'
  | 'CONTENT_UNLOCKED'
  | 'FINANCIAL_INPUT_MISMATCH'
  | 'RULE_SNAPSHOT_MISMATCH';

export interface OperationPlanBlocker {
  readonly code: OperationPlanBlockerCode;
  readonly source: string;
}

export interface OperationPlanNodeSource {
  readonly nodeKey: OperationPlanNodeKey;
  readonly assetType: OperationPlanAssetType;
  readonly assetId: UuidV7;
  readonly revisionNo: number;
  readonly dependencyHash: string;
}

export interface OperationPlanPricingSource {
  readonly resultId: UuidV7;
  readonly scenarioId: UuidV7;
  readonly skuId: UuidV7;
  readonly costProfileId: UuidV7;
  readonly costProfileRevisionNo: number;
}

export interface OperationPlanPromotionSource {
  readonly scenarioId: UuidV7;
  readonly resultIds: readonly UuidV7[];
  readonly ruleSnapshotHash: string;
}

export interface OperationPlanSources {
  readonly workflowRunId: UuidV7;
  readonly workflowRunRevision: number;
  readonly nodes: readonly OperationPlanNodeSource[];
  readonly competitorSnapshotIds: readonly UuidV7[];
  readonly pricing: OperationPlanPricingSource;
  readonly promotion: OperationPlanPromotionSource | null;
}

export interface OperationPlanRevision {
  readonly id: UuidV7;
  readonly lineageId: UuidV7;
  readonly productId: UuidV7;
  readonly platformId: PlatformId;
  readonly revisionNo: number;
  readonly status: 'draft' | 'locked';
  readonly lockedAt: Date | null;
  readonly sources: OperationPlanSources;
  readonly sourceHash: string;
  readonly blockers: readonly OperationPlanBlocker[];
  readonly supersedesRevisionId: UuidV7 | null;
  readonly createdAt: Date;
}

export function createOperationPlanRevision(input: OperationPlanRevision): OperationPlanRevision {
  try {
    validateRevision(input);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalid();
  }
  return deepFreeze(structuredClone(input));
}

export function lockOperationPlanRevision(
  draft: OperationPlanRevision,
  id: UuidV7,
  now: Date,
): OperationPlanRevision {
  if (draft.status !== 'draft') {
    throw new DomainError('CONFLICT', 'Only a draft operation plan can be locked.');
  }
  if (draft.blockers.length > 0) {
    throw new DomainError('CONFLICT', 'Operation plan blockers must be resolved before locking.');
  }
  return createOperationPlanRevision({
    ...structuredClone(draft),
    id,
    revisionNo: draft.revisionNo + 1,
    status: 'locked',
    lockedAt: now,
    supersedesRevisionId: draft.id,
    createdAt: now,
  });
}

function validateRevision(input: OperationPlanRevision): void {
  const ids = [input.id, input.lineageId, input.productId, input.sources.workflowRunId];
  ids.forEach(parseUuidV7);
  if (
    !PLATFORM_IDS.includes(input.platformId) ||
    !positive(input.revisionNo) ||
    !positive(input.sources.workflowRunRevision) ||
    !hash(input.sourceHash) ||
    !validDate(input.createdAt) ||
    !validLineage(input) ||
    !validLifecycle(input) ||
    !validNodes(input.sources.nodes) ||
    !validUniqueIds(input.sources.competitorSnapshotIds, true) ||
    !validPricing(input.sources.pricing) ||
    !validPromotion(input.sources.promotion) ||
    !validBlockers(input.blockers)
  ) {
    throw invalid();
  }
}

function validLineage(input: OperationPlanRevision): boolean {
  if (input.revisionNo === 1) {
    return input.lineageId === input.id && input.supersedesRevisionId === null;
  }
  if (input.supersedesRevisionId === null) return false;
  parseUuidV7(input.supersedesRevisionId);
  return input.lineageId !== input.id;
}

function validLifecycle(input: OperationPlanRevision): boolean {
  if (input.status === 'draft') return input.lockedAt === null;
  return (
    input.status === 'locked' &&
    input.blockers.length === 0 &&
    input.lockedAt !== null &&
    validDate(input.lockedAt)
  );
}

function validNodes(nodes: readonly OperationPlanNodeSource[]): boolean {
  if (nodes.length !== OPERATION_PLAN_NODE_KEYS.length) return false;
  return nodes.every((node, index) => {
    parseUuidV7(node.assetId);
    return (
      node.nodeKey === OPERATION_PLAN_NODE_KEYS[index] &&
      node.assetType === OPERATION_PLAN_ASSET_TYPES[index] &&
      positive(node.revisionNo) &&
      hash(node.dependencyHash)
    );
  });
}

function validPricing(pricing: OperationPlanPricingSource): boolean {
  [pricing.resultId, pricing.scenarioId, pricing.skuId, pricing.costProfileId].forEach(parseUuidV7);
  return positive(pricing.costProfileRevisionNo);
}

function validPromotion(promotion: OperationPlanPromotionSource | null): boolean {
  if (promotion === null) return true;
  parseUuidV7(promotion.scenarioId);
  return validUniqueIds(promotion.resultIds, true) && hash(promotion.ruleSnapshotHash);
}

function validUniqueIds(ids: readonly UuidV7[], requireValue: boolean): boolean {
  ids.forEach(parseUuidV7);
  return (!requireValue || ids.length > 0) && new Set(ids).size === ids.length;
}

function validBlockers(blockers: readonly OperationPlanBlocker[]): boolean {
  const allowed = new Set<OperationPlanBlockerCode>([
    'SOURCE_STALE',
    'SOURCE_NEEDS_REVIEW',
    'CONTENT_UNLOCKED',
    'FINANCIAL_INPUT_MISMATCH',
    'RULE_SNAPSHOT_MISMATCH',
  ]);
  const identities = blockers.map(({ code, source }) => `${code}:${source}`);
  return (
    blockers.length <= 50 &&
    blockers.every(
      ({ code, source }) =>
        allowed.has(code) && source.trim() === source && source.length > 0 && source.length <= 120,
    ) &&
    new Set(identities).size === identities.length
  );
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function hash(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isSafeInteger(value.getTime());
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function invalid(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Operation plan revision is invalid.');
}
