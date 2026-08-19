import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export const FACT_SOURCE_TYPES = [
  'manual',
  'supplier',
  'import',
  'document',
  'ai_inferred',
  'competitor_reference',
  'other',
] as const;
export type FactSourceType = (typeof FACT_SOURCE_TYPES)[number];

export const FACT_VERIFICATIONS = ['confirmed', 'unverified', 'inferred', 'missing'] as const;
export type FactVerification = (typeof FACT_VERIFICATIONS)[number];

export type FactValue =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean };

export interface FactConfirmation {
  readonly actorType: 'user';
  readonly actorRef: string;
  readonly evidenceRef: string;
}

export interface ProductFact {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly key: string;
  readonly label: string;
  readonly value: FactValue | null;
  readonly unit: string | null;
  readonly sourceType: FactSourceType;
  readonly sourceRef: string | null;
  readonly verification: FactVerification;
  readonly sensitive: boolean;
  /** Explicit local policy decision; sensitive facts also need a confirmation evidence ref. */
  readonly policyEligible: boolean;
  readonly revisionNo: number;
  readonly supersedesFactId: UuidV7 | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly confirmedAt: Date | null;
  readonly confirmation: FactConfirmation | null;
}

export interface CreateProductFactProps {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly key: string;
  readonly label: string;
  readonly value: FactValue | null;
  readonly unit?: string | null;
  readonly sourceType: FactSourceType;
  readonly sourceRef?: string | null;
  readonly verification: Exclude<FactVerification, 'confirmed'>;
  readonly sensitive?: boolean;
  readonly policyEligible?: boolean;
  readonly revisionNo?: number;
  readonly supersedesFactId?: UuidV7 | null;
  readonly now: Date;
}

export function normalizeFactKey(key: string): string {
  return key.trim().toLowerCase();
}

export function createProductFact(props: CreateProductFactProps): ProductFact {
  const key = normalizeFactKey(props.key);
  const label = props.label.trim();
  if (!/^[a-z0-9][a-z0-9_.-]{0,79}$/u.test(key)) {
    throw new DomainError('VALIDATION_ERROR', 'Fact key is invalid.', { field: 'key' });
  }
  if (label.length === 0 || label.length > 120) {
    throw new DomainError('VALIDATION_ERROR', 'Fact label is invalid.', { field: 'label' });
  }
  validateValue(props.verification, props.value);
  const revisionNo = props.revisionNo ?? 1;
  if (!Number.isSafeInteger(revisionNo) || revisionNo < 1) {
    throw new DomainError('VALIDATION_ERROR', 'Fact revision is invalid.', { field: 'revisionNo' });
  }

  return {
    id: props.id,
    productId: props.productId,
    key,
    label,
    value: normalizeFactValue(props.value),
    unit: normalizeOptional(props.unit),
    sourceType: props.sourceType,
    sourceRef: normalizeOptional(props.sourceRef),
    verification: props.verification,
    sensitive: props.sensitive ?? false,
    policyEligible: props.policyEligible ?? !props.sensitive,
    revisionNo,
    supersedesFactId: props.supersedesFactId ?? null,
    createdAt: props.now,
    updatedAt: props.now,
    confirmedAt: null,
    confirmation: null,
  };
}

export function confirmProductFact(
  fact: ProductFact,
  confirmation: FactConfirmation,
  now: Date,
): ProductFact {
  if (fact.verification === 'confirmed') {
    throw new DomainError('CONFLICT', 'Confirmed facts are immutable; create a revision instead.');
  }
  if (fact.verification === 'missing' || fact.value === null) {
    throw new DomainError('FACT_VERIFICATION_REQUIRED', 'A missing fact cannot be confirmed.');
  }
  if (
    confirmation.actorType !== 'user' ||
    confirmation.actorRef.trim().length === 0 ||
    confirmation.evidenceRef.trim().length === 0
  ) {
    throw new DomainError(
      'FACT_VERIFICATION_REQUIRED',
      'Explicit user confirmation provenance is required.',
    );
  }

  const confirmedAt = nextTimestamp(fact.updatedAt, now);
  return {
    ...fact,
    verification: 'confirmed',
    confirmedAt,
    updatedAt: confirmedAt,
    confirmation: {
      actorType: 'user',
      actorRef: confirmation.actorRef.trim(),
      evidenceRef: confirmation.evidenceRef.trim(),
    },
  };
}

export function nextTimestamp(previous: Date, candidate: Date): Date {
  return new Date(Math.max(candidate.getTime(), previous.getTime() + 1));
}

function validateValue(verification: FactVerification, value: FactValue | null): void {
  if ((verification === 'missing') !== (value === null)) {
    throw new DomainError('VALIDATION_ERROR', 'Missing facts must have a null value.', {
      field: 'value',
    });
  }
  if (value?.type === 'text' && value.value.trim().length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'Text fact values cannot be empty.', {
      field: 'value',
    });
  }
  if (value?.type === 'number' && !Number.isFinite(value.value)) {
    throw new DomainError('VALIDATION_ERROR', 'Number fact values must be finite.', {
      field: 'value',
    });
  }
}

function normalizeFactValue(value: FactValue | null): FactValue | null {
  return value?.type === 'text' ? { ...value, value: value.value.trim() } : value;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}
