import {
  createDetailPageRevision,
  type AppendDetailPageInput,
  type DetailPageRepository,
  type DetailPageRevision,
  type PlatformId,
  type UuidV7,
} from '@eaw/domain';
import type { OpenDatabase } from '../client.js';
import {
  integer,
  json,
  nullableUuid,
  platform,
  rollback,
  status,
  type ContentRow,
  uuid,
} from './content-revision-values.js';

export class DrizzleDetailPageRepository implements DetailPageRepository {
  constructor(private readonly database: OpenDatabase) {}
  async append(input: AppendDetailPageInput): Promise<DetailPageRevision> {
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const previous = this.latestSync(input.productId, input.platformId);
      if (previous && previous.lineageId !== input.lineageId)
        throw new TypeError('Invalid detail lineage.');
      const revision = createDetailPageRevision({
        ...input,
        revisionNo: (previous?.revisionNo ?? 0) + 1,
        supersedesRevisionId: previous?.id ?? null,
      });
      this.database.sqlite
        .prepare(
          'INSERT INTO detail_page_revisions (id,lineage_id,product_id,platform_id,revision_no,origin,status,sections_json,dependency_hashes_json,validation_issues_json,generation_id,supersedes_revision_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          revision.id,
          revision.lineageId,
          revision.productId,
          revision.platformId,
          revision.revisionNo,
          revision.origin,
          revision.status,
          JSON.stringify(revision.sections),
          JSON.stringify(revision.dependencyHashes),
          JSON.stringify(revision.validationIssues),
          revision.generationId,
          revision.supersedesRevisionId,
          revision.createdAt.getTime(),
        );
      this.database.sqlite.exec('COMMIT;');
      return revision;
    } catch (error) {
      rollback(this.database);
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
          'SELECT * FROM detail_page_revisions WHERE product_id = ? AND platform_id = ? ORDER BY revision_no DESC',
        )
        .all(productId, platformId) as ContentRow[]
    ).map(toRevision);
  }
  private latestSync(productId: UuidV7, platformId: PlatformId) {
    const value = this.database.sqlite
      .prepare(
        'SELECT * FROM detail_page_revisions WHERE product_id = ? AND platform_id = ? ORDER BY revision_no DESC LIMIT 1',
      )
      .get(productId, platformId) as ContentRow | undefined;
    return value ? toRevision(value) : undefined;
  }
}
function toRevision(value: ContentRow): DetailPageRevision {
  const rawOrigin = value.origin;
  if (rawOrigin !== 'generated' && rawOrigin !== 'locked_section' && rawOrigin !== 'reordered')
    throw new TypeError('Invalid origin.');
  return createDetailPageRevision({
    id: uuid(value.id),
    lineageId: uuid(value.lineage_id),
    productId: uuid(value.product_id),
    platformId: platform(value.platform_id),
    revisionNo: integer(value.revision_no),
    origin: rawOrigin,
    status: status(value.status),
    sections: json(value.sections_json) as DetailPageRevision['sections'],
    dependencyHashes: json(value.dependency_hashes_json) as Record<string, string>,
    validationIssues: json(value.validation_issues_json) as DetailPageRevision['validationIssues'],
    generationId: nullableUuid(value.generation_id),
    supersedesRevisionId: nullableUuid(value.supersedes_revision_id),
    createdAt: new Date(integer(value.created_at)),
  });
}
