import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';
import type { PlatformId } from '../platform-profiles/platform-profile.js';
import {
  deepFreeze,
  type ContentEvidenceReference,
  type ContentValidationIssue,
} from './creative-plan.js';

export interface DetailPageSection {
  readonly id: UuidV7;
  readonly order: number;
  readonly kind:
    'hero' | 'benefit' | 'specification' | 'scenario' | 'trust' | 'faq' | 'call_to_action';
  readonly headline: string;
  readonly body: string;
  readonly evidenceRefs: readonly ContentEvidenceReference[];
  readonly reviewTerms: readonly string[];
  readonly locked: boolean;
}

export interface DetailPageRevision {
  readonly id: UuidV7;
  readonly lineageId: UuidV7;
  readonly productId: UuidV7;
  readonly platformId: PlatformId;
  readonly revisionNo: number;
  readonly origin: 'generated' | 'locked_section' | 'reordered';
  readonly status: 'verified' | 'needs_review';
  readonly sections: readonly DetailPageSection[];
  readonly dependencyHashes: Readonly<Record<string, string>>;
  readonly validationIssues: readonly ContentValidationIssue[];
  readonly generationId: UuidV7 | null;
  readonly supersedesRevisionId: UuidV7 | null;
  readonly createdAt: Date;
}

export function createDetailPageRevision(input: DetailPageRevision): DetailPageRevision {
  if (
    !Number.isSafeInteger(input.revisionNo) ||
    input.revisionNo < 1 ||
    input.sections.length < 1 ||
    input.sections.length > 30 ||
    new Set(input.sections.map(({ id }) => id)).size !== input.sections.length ||
    input.sections.some((section, index) => !validSection(section, index + 1, input.productId)) ||
    Object.keys(input.dependencyHashes).length === 0 ||
    Object.values(input.dependencyHashes).some((hash) => !/^[0-9a-f]{64}$/u.test(hash)) ||
    (input.origin === 'generated') !== (input.generationId !== null) ||
    !Number.isSafeInteger(input.createdAt.getTime())
  ) {
    throw new DomainError('VALIDATION_ERROR', 'Detail page revision is invalid.');
  }
  return deepFreeze(structuredClone(input));
}

export function reorderDetailSections(
  sections: readonly DetailPageSection[],
  orderedIds: readonly UuidV7[],
): readonly DetailPageSection[] {
  if (
    orderedIds.length !== sections.length ||
    new Set(orderedIds).size !== sections.length ||
    orderedIds.some((id) => !sections.some((section) => section.id === id))
  ) {
    throw new DomainError('VALIDATION_ERROR', 'A complete unique section order is required.');
  }
  const byId = new Map(sections.map((section) => [section.id, section]));
  return orderedIds.map((id, index) => ({ ...structuredClone(byId.get(id)!), order: index + 1 }));
}

export function lockDetailSection(
  sections: readonly DetailPageSection[],
  sectionId: UuidV7,
): readonly DetailPageSection[] {
  if (!sections.some(({ id }) => id === sectionId)) {
    throw new DomainError('NOT_FOUND', 'Detail section was not found.');
  }
  return sections.map((section) => ({
    ...structuredClone(section),
    locked: section.locked || section.id === sectionId,
  }));
}

function validSection(section: DetailPageSection, order: number, productId: UuidV7): boolean {
  return (
    section.order === order &&
    section.headline.trim().length > 0 &&
    section.headline.length <= 500 &&
    section.body.trim().length > 0 &&
    section.body.length <= 8_000 &&
    section.evidenceRefs.length <= 50 &&
    section.evidenceRefs.every(({ productId: owner }) => owner === productId) &&
    section.reviewTerms.length <= 50
  );
}
