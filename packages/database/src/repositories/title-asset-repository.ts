import {
  createTitleAssetRevision,
  parseUuidV7,
  type AppendTitleRevisionInput,
  type PlatformId,
  type TitleAssetRepository,
  type TitleAssetRevision,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type Row = Record<string, unknown>;

export class DrizzleTitleAssetRepository implements TitleAssetRepository {
  constructor(private readonly database: OpenDatabase) {}

  async append(input: AppendTitleRevisionInput): Promise<TitleAssetRevision> {
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const previous = this.latestSync(input.productId, input.platformId);
      if (previous && previous.lineageId !== input.lineageId)
        throw new TypeError('Title lineage is invalid.');
      const revision = createTitleAssetRevision({
        ...input,
        revisionNo: (previous?.revisionNo ?? 0) + 1,
        supersedesRevisionId: previous?.id ?? null,
      });
      this.database.sqlite
        .prepare(
          'INSERT INTO title_asset_revisions (id, lineage_id, product_id, platform_id, revision_no, origin, status, locked, titles_json, validation_issues_json, dependency_hashes_json, generation_id, supersedes_revision_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          revision.id,
          revision.lineageId,
          revision.productId,
          revision.platformId,
          revision.revisionNo,
          revision.origin,
          revision.status,
          revision.locked ? 1 : 0,
          JSON.stringify(revision.titles),
          JSON.stringify(revision.validationIssues),
          JSON.stringify(revision.dependencyHashes),
          revision.generationId,
          revision.supersedesRevisionId,
          revision.createdAt.getTime(),
        );
      this.database.sqlite.exec('COMMIT;');
      return revision;
    } catch (error) {
      this.database.sqlite.exec('ROLLBACK;');
      throw error;
    }
  }

  async latest(productId: UuidV7, platformId: PlatformId) {
    return this.latestSync(productId, platformId);
  }
  async list(productId: UuidV7, platformId: PlatformId) {
    return (
      this.database.sqlite
        .prepare(
          'SELECT * FROM title_asset_revisions WHERE product_id = ? AND platform_id = ? ORDER BY revision_no DESC',
        )
        .all(productId, platformId) as Row[]
    ).map(toRevision);
  }
  private latestSync(productId: UuidV7, platformId: PlatformId) {
    const row = this.database.sqlite
      .prepare(
        'SELECT * FROM title_asset_revisions WHERE product_id = ? AND platform_id = ? ORDER BY revision_no DESC LIMIT 1',
      )
      .get(productId, platformId) as Row | undefined;
    return row ? toRevision(row) : undefined;
  }
}

function toRevision(row: Row): TitleAssetRevision {
  return createTitleAssetRevision({
    id: uuid(row.id),
    lineageId: uuid(row.lineage_id),
    productId: uuid(row.product_id),
    platformId: platform(row.platform_id),
    revisionNo: integer(row.revision_no),
    origin: origin(row.origin),
    status: status(row.status),
    locked: integer(row.locked) === 1,
    titles: json(row.titles_json) as TitleAssetRevision['titles'],
    validationIssues: json(row.validation_issues_json) as TitleAssetRevision['validationIssues'],
    dependencyHashes: json(row.dependency_hashes_json) as Record<string, string>,
    generationId: row.generation_id === null ? null : uuid(row.generation_id),
    supersedesRevisionId:
      row.supersedes_revision_id === null ? null : uuid(row.supersedes_revision_id),
    createdAt: new Date(integer(row.created_at)),
  });
}
function uuid(value: unknown): UuidV7 {
  if (typeof value !== 'string') throw new TypeError('Invalid UUID.');
  return parseUuidV7(value);
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError('Invalid integer.');
  return value;
}
function json(value: unknown): unknown {
  if (typeof value !== 'string') throw new TypeError('Invalid JSON.');
  return JSON.parse(value);
}
function platform(value: unknown): PlatformId {
  if (value === 'pinduoduo' || value === 'taobao' || value === 'douyin') return value;
  throw new TypeError('Invalid platform.');
}
function origin(value: unknown): TitleAssetRevision['origin'] {
  if (value === 'generated' || value === 'edited' || value === 'locked') return value;
  throw new TypeError('Invalid origin.');
}
function status(value: unknown): TitleAssetRevision['status'] {
  if (value === 'verified' || value === 'needs_review') return value;
  throw new TypeError('Invalid status.');
}
