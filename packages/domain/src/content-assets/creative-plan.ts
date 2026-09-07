import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';
import type { PlatformId } from '../platform-profiles/platform-profile.js';

export type ContentEvidenceKind = 'product_fact' | 'strategy_asset' | 'title_revision';

export interface ContentEvidenceReference {
  readonly kind: ContentEvidenceKind;
  readonly id: UuidV7;
  readonly productId: UuidV7;
}

export interface CreativeItem {
  readonly id: UuidV7;
  readonly order: number;
  readonly role: 'hero' | 'supporting';
  readonly headline: string;
  readonly body: string;
  readonly promptZh: string;
  readonly promptEn: string;
  readonly negativePromptZh: string;
  readonly negativePromptEn: string;
  readonly evidenceRefs: readonly ContentEvidenceReference[];
  readonly reviewTerms: readonly string[];
  readonly locked: boolean;
}

export interface ContentValidationIssue {
  readonly itemId: UuidV7;
  readonly code: 'unsupported_evidence' | 'review_term';
  readonly detail: string;
}

export interface CreativePlanRevision {
  readonly id: UuidV7;
  readonly lineageId: UuidV7;
  readonly productId: UuidV7;
  readonly platformId: PlatformId;
  readonly revisionNo: number;
  readonly origin: 'generated' | 'regenerated_item' | 'locked_item' | 'reordered';
  readonly status: 'verified' | 'needs_review';
  readonly items: readonly CreativeItem[];
  readonly dependencyHashes: Readonly<Record<string, string>>;
  readonly validationIssues: readonly ContentValidationIssue[];
  readonly generationId: UuidV7 | null;
  readonly supersedesRevisionId: UuidV7 | null;
  readonly createdAt: Date;
}

export interface DependencyStaleness {
  readonly stale: boolean;
  readonly reasons: readonly string[];
}

export function createCreativePlanRevision(input: CreativePlanRevision): CreativePlanRevision {
  if (
    !Number.isSafeInteger(input.revisionNo) ||
    input.revisionNo < 1 ||
    input.items.length !== 5 ||
    !validOrderedIds(input.items) ||
    !validHashes(input.dependencyHashes) ||
    !validGeneration(input.origin, input.generationId) ||
    !Number.isSafeInteger(input.createdAt.getTime()) ||
    input.items.some((item) => !validCreativeItem(item, input.productId))
  ) {
    throw invalid('Creative plan revision is invalid.');
  }
  return deepFreeze(structuredClone(input));
}

export function replaceCreativeItem(
  items: readonly CreativeItem[],
  itemId: UuidV7,
  replacement: CreativeItem,
): readonly CreativeItem[] {
  const index = items.findIndex(({ id }) => id === itemId);
  if (index < 0) throw new DomainError('NOT_FOUND', 'Creative item was not found.');
  const current = items[index]!;
  if (current.locked) throw new DomainError('CONFLICT', 'Creative item is locked.');
  if (replacement.id !== current.id || replacement.order !== current.order) {
    throw invalid('Replacement must preserve the creative item identity and order.');
  }
  return items.map((item, candidateIndex) =>
    candidateIndex === index ? structuredClone(replacement) : structuredClone(item),
  );
}

export function lockCreativeItem(
  items: readonly CreativeItem[],
  itemId: UuidV7,
): readonly CreativeItem[] {
  if (!items.some(({ id }) => id === itemId)) {
    throw new DomainError('NOT_FOUND', 'Creative item was not found.');
  }
  return items.map((item) => ({
    ...structuredClone(item),
    locked: item.locked || item.id === itemId,
  }));
}

export function reorderCreativeItems(
  items: readonly CreativeItem[],
  orderedIds: readonly UuidV7[],
): readonly CreativeItem[] {
  if (
    orderedIds.length !== items.length ||
    new Set(orderedIds).size !== items.length ||
    orderedIds.some((id) => !items.some((item) => item.id === id))
  ) {
    throw invalid('A complete unique creative item order is required.');
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  return orderedIds.map((id, index) => ({ ...structuredClone(byId.get(id)!), order: index + 1 }));
}

export function evaluateDependencyStaleness(
  stored: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
): DependencyStaleness {
  const reasons = Object.entries(stored)
    .filter(([key, hash]) => current[key] !== undefined && current[key] !== hash)
    .map(([key]) => `${key}_changed`);
  return { stale: reasons.length > 0, reasons };
}

function validCreativeItem(item: CreativeItem, productId: UuidV7): boolean {
  return (
    Number.isSafeInteger(item.order) &&
    item.order >= 1 &&
    item.role !== undefined &&
    [
      item.headline,
      item.body,
      item.promptZh,
      item.promptEn,
      item.negativePromptZh,
      item.negativePromptEn,
    ].every(
      (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 4_000,
    ) &&
    item.evidenceRefs.length <= 50 &&
    item.evidenceRefs.every(({ productId: owner }) => owner === productId) &&
    item.reviewTerms.length <= 50
  );
}

function validOrderedIds(
  items: readonly { readonly id: UuidV7; readonly order: number }[],
): boolean {
  return (
    new Set(items.map(({ id }) => id)).size === items.length &&
    items.every(({ order }, index) => order === index + 1)
  );
}

function validHashes(hashes: Readonly<Record<string, string>>): boolean {
  return (
    Object.keys(hashes).length > 0 &&
    Object.values(hashes).every((hash) => /^[0-9a-f]{64}$/u.test(hash))
  );
}

function validGeneration(origin: CreativePlanRevision['origin'], generationId: UuidV7 | null) {
  return (origin === 'generated' || origin === 'regenerated_item') === (generationId !== null);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function invalid(message: string): DomainError {
  return new DomainError('VALIDATION_ERROR', message);
}
