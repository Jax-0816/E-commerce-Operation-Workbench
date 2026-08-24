import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export const PLATFORM_IDS = ['pinduoduo', 'taobao', 'douyin'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];
export type PlatformProfileStatus = 'draft' | 'ready';

export interface ProductPlatformProfile {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly platformId: PlatformId;
  readonly categoryCode: string | null;
  readonly categoryName: string | null;
  readonly externalProductId: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly status: PlatformProfileStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PlatformProfileFields {
  readonly categoryCode: string | null;
  readonly categoryName: string | null;
  readonly externalProductId: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export function createPlatformProfile(
  input: PlatformProfileFields & {
    readonly id: UuidV7;
    readonly productId: UuidV7;
    readonly platformId: PlatformId;
    readonly now: Date;
  },
): ProductPlatformProfile {
  if (!PLATFORM_IDS.includes(input.platformId)) throw invalid();
  const fields = normalizeFields(input);
  return {
    id: input.id,
    productId: input.productId,
    platformId: input.platformId,
    ...fields,
    status: profileStatus(fields),
    createdAt: validDate(input.now),
    updatedAt: validDate(input.now),
  };
}

export function updatePlatformProfile(
  profile: ProductPlatformProfile,
  input: PlatformProfileFields & { readonly expectedUpdatedAt: Date; readonly now: Date },
): ProductPlatformProfile {
  if (input.expectedUpdatedAt.getTime() !== profile.updatedAt.getTime()) {
    throw new DomainError('CONFLICT', 'Platform profile changed; reload.');
  }
  const fields = normalizeFields(input);
  const now = validDate(input.now);
  if (now.getTime() <= profile.updatedAt.getTime()) throw invalid();
  return { ...profile, ...fields, status: profileStatus(fields), updatedAt: now };
}

function normalizeFields(input: PlatformProfileFields): PlatformProfileFields {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.metadata)) {
    if (!key.trim() || typeof value !== 'string' || !value.trim()) throw invalid();
    metadata[key.trim()] = value.trim();
  }
  return {
    categoryCode: optional(input.categoryCode, 120),
    categoryName: optional(input.categoryName, 200),
    externalProductId: optional(input.externalProductId, 200),
    title: optional(input.title, 300),
    description: optional(input.description, 5000),
    metadata,
  };
}

function profileStatus(fields: PlatformProfileFields): PlatformProfileStatus {
  return fields.categoryCode !== null && fields.categoryName !== null && fields.title !== null
    ? 'ready'
    : 'draft';
}

function optional(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw invalid();
  return normalized;
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) throw invalid();
  return value;
}

function invalid(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Platform profile is invalid.');
}
