import {
  createPlatformProfile,
  DomainError,
  parseUuidV7,
  PLATFORM_IDS,
  type PlatformId,
  type PlatformProfileRepository,
  type ProductPlatformProfile,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type ProfileRow = Record<string, unknown>;

export class DrizzlePlatformProfileRepository implements PlatformProfileRepository {
  constructor(private readonly database: OpenDatabase) {}

  async find(
    productId: UuidV7,
    platformId: PlatformId,
  ): Promise<ProductPlatformProfile | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM product_platform_profiles WHERE product_id = ? AND platform_id = ?')
      .get(productId, platformId) as ProfileRow | undefined;
    return row === undefined ? undefined : toProfile(row);
  }

  async list(productId: UuidV7): Promise<readonly ProductPlatformProfile[]> {
    const rows = this.database.sqlite
      .prepare(
        "SELECT * FROM product_platform_profiles WHERE product_id = ? ORDER BY CASE platform_id WHEN 'pinduoduo' THEN 0 WHEN 'taobao' THEN 1 WHEN 'douyin' THEN 2 END",
      )
      .all(productId) as ProfileRow[];
    return rows.map(toProfile);
  }

  async create(profile: ProductPlatformProfile): Promise<ProductPlatformProfile> {
    try {
      this.database.sqlite
        .prepare(
          'INSERT INTO product_platform_profiles (id, product_id, platform_id, category_code, category_name, external_product_id, title, description, metadata_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          profile.id,
          profile.productId,
          profile.platformId,
          profile.categoryCode,
          profile.categoryName,
          profile.externalProductId,
          profile.title,
          profile.description,
          JSON.stringify(profile.metadata),
          profile.status,
          profile.createdAt.getTime(),
          profile.updatedAt.getTime(),
        );
      return profile;
    } catch (error) {
      if (constraintMessage(error).includes('product_platform_profiles.product_id')) {
        throw new DomainError('CONFLICT', 'This platform profile already exists.');
      }
      throw error;
    }
  }

  async update(
    profile: ProductPlatformProfile,
    expectedUpdatedAt: Date,
  ): Promise<ProductPlatformProfile | undefined> {
    const result = this.database.sqlite
      .prepare(
        'UPDATE product_platform_profiles SET category_code = ?, category_name = ?, external_product_id = ?, title = ?, description = ?, metadata_json = ?, status = ?, updated_at = ? WHERE id = ? AND product_id = ? AND platform_id = ? AND updated_at = ?',
      )
      .run(
        profile.categoryCode,
        profile.categoryName,
        profile.externalProductId,
        profile.title,
        profile.description,
        JSON.stringify(profile.metadata),
        profile.status,
        profile.updatedAt.getTime(),
        profile.id,
        profile.productId,
        profile.platformId,
        expectedUpdatedAt.getTime(),
      );
    return Number(result.changes) === 1 ? profile : undefined;
  }
}

function toProfile(row: ProfileRow): ProductPlatformProfile {
  const metadata = parseMetadata(row.metadata_json);
  const platformId = requiredString(row.platform_id);
  if (!PLATFORM_IDS.includes(platformId as PlatformId)) throw invalid();
  const createdAt = timestamp(row.created_at);
  const updatedAt = timestamp(row.updated_at);
  const profile = createPlatformProfile({
    id: parseUuidV7(requiredString(row.id)),
    productId: parseUuidV7(requiredString(row.product_id)),
    platformId: platformId as PlatformId,
    categoryCode: optionalString(row.category_code),
    categoryName: optionalString(row.category_name),
    externalProductId: optionalString(row.external_product_id),
    title: optionalString(row.title),
    description: optionalString(row.description),
    metadata,
    now: createdAt,
  });
  if (
    updatedAt.getTime() < createdAt.getTime() ||
    row.status !== profile.status ||
    (updatedAt.getTime() === createdAt.getTime() && row.updated_at !== row.created_at)
  ) {
    throw invalid();
  }
  return { ...profile, updatedAt };
}

function parseMetadata(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== 'string') throw invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalid();
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw invalid();
  for (const [key, item] of Object.entries(parsed)) {
    if (!key.trim() || typeof item !== 'string' || !item.trim()) throw invalid();
  }
  return parsed as Readonly<Record<string, string>>;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid();
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value);
}

function timestamp(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalid();
  return new Date(value);
}

function constraintMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message} ${constraintMessage(error.cause)}`;
  }
  return '';
}

function invalid(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Persisted platform profile is invalid.');
}
