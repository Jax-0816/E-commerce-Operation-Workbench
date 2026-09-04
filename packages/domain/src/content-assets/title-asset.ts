import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';
import type { PlatformId } from '../platform-profiles/platform-profile.js';
import type { StrategyEvidenceReference } from '../strategy/strategy-asset.js';

export const TITLE_VARIANTS = ['recommended', 'search', 'selling_point', 'scenario'] as const;
export type TitleVariant = (typeof TITLE_VARIANTS)[number];
export type TitleRevisionOrigin = 'generated' | 'edited' | 'locked';

export interface TitleClaimTerm {
  readonly text: string;
  readonly evidenceRefs: readonly StrategyEvidenceReference[];
}

export interface TitleCandidate {
  readonly variant: TitleVariant;
  readonly text: string;
  readonly keywords: readonly string[];
  readonly claims: readonly TitleClaimTerm[];
  readonly reviewTerms: readonly string[];
}

export interface TitleValidationIssue {
  readonly candidateIndex: number;
  readonly code:
    'length_exceeded' | 'duplicate_title' | 'forbidden_term' | 'unsupported_claim' | 'review_term';
  readonly detail: string;
}

export interface TitleAssetRevision {
  readonly id: UuidV7;
  readonly lineageId: UuidV7;
  readonly productId: UuidV7;
  readonly platformId: PlatformId;
  readonly revisionNo: number;
  readonly origin: TitleRevisionOrigin;
  readonly status: 'verified' | 'needs_review';
  readonly locked: boolean;
  readonly titles: readonly TitleCandidate[];
  readonly validationIssues: readonly TitleValidationIssue[];
  readonly dependencyHashes: Readonly<Record<string, string>>;
  readonly generationId: UuidV7 | null;
  readonly supersedesRevisionId: UuidV7 | null;
  readonly createdAt: Date;
}

export interface TitleAssetView {
  readonly revision: TitleAssetRevision;
  readonly stale: boolean;
  readonly staleReasons: readonly string[];
}

export function createTitleAssetRevision(input: TitleAssetRevision): TitleAssetRevision {
  if (
    !Number.isSafeInteger(input.revisionNo) ||
    input.revisionNo < 1 ||
    input.titles.length === 0 ||
    input.titles.length > 20 ||
    (input.locked && input.origin !== 'locked') ||
    (!input.locked && input.origin === 'locked') ||
    (input.origin === 'generated') !== (input.generationId !== null) ||
    !Number.isSafeInteger(input.createdAt.getTime())
  ) {
    throw invalid();
  }
  for (const hash of Object.values(input.dependencyHashes)) {
    if (!/^[0-9a-f]{64}$/u.test(hash)) throw invalid();
  }
  return deepFreeze(structuredClone(input));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function invalid(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Title asset revision is invalid.');
}
