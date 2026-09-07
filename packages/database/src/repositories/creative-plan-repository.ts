import {
  createCreativePlanRevision,
  type AppendCreativePlanInput,
  type CreativePlanRepository,
  type CreativePlanRevision,
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

export class DrizzleCreativePlanRepository implements CreativePlanRepository {
  constructor(private readonly database: OpenDatabase) {}
  async append(input: AppendCreativePlanInput): Promise<CreativePlanRevision> {
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const previous = this.latestSync(input.productId, input.platformId);
      if (previous && previous.lineageId !== input.lineageId)
        throw new TypeError('Invalid creative lineage.');
      const revision = createCreativePlanRevision({
        ...input,
        revisionNo: (previous?.revisionNo ?? 0) + 1,
        supersedesRevisionId: previous?.id ?? null,
      });
      this.database.sqlite
        .prepare(
          'INSERT INTO creative_plan_revisions (id,lineage_id,product_id,platform_id,revision_no,origin,status,items_json,dependency_hashes_json,validation_issues_json,generation_id,supersedes_revision_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          revision.id,
          revision.lineageId,
          revision.productId,
          revision.platformId,
          revision.revisionNo,
          revision.origin,
          revision.status,
          JSON.stringify(revision.items),
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
          'SELECT * FROM creative_plan_revisions WHERE product_id = ? AND platform_id = ? ORDER BY revision_no DESC',
        )
        .all(productId, platformId) as ContentRow[]
    ).map(toRevision);
  }
  private latestSync(productId: UuidV7, platformId: PlatformId) {
    const value = this.database.sqlite
      .prepare(
        'SELECT * FROM creative_plan_revisions WHERE product_id = ? AND platform_id = ? ORDER BY revision_no DESC LIMIT 1',
      )
      .get(productId, platformId) as ContentRow | undefined;
    return value ? toRevision(value) : undefined;
  }
}
function toRevision(value: ContentRow): CreativePlanRevision {
  const rawOrigin = value.origin;
  if (
    rawOrigin !== 'generated' &&
    rawOrigin !== 'regenerated_item' &&
    rawOrigin !== 'locked_item' &&
    rawOrigin !== 'reordered'
  )
    throw new TypeError('Invalid origin.');
  return createCreativePlanRevision({
    id: uuid(value.id),
    lineageId: uuid(value.lineage_id),
    productId: uuid(value.product_id),
    platformId: platform(value.platform_id),
    revisionNo: integer(value.revision_no),
    origin: rawOrigin,
    status: status(value.status),
    items: json(value.items_json) as CreativePlanRevision['items'],
    dependencyHashes: json(value.dependency_hashes_json) as Record<string, string>,
    validationIssues: json(
      value.validation_issues_json,
    ) as CreativePlanRevision['validationIssues'],
    generationId: nullableUuid(value.generation_id),
    supersedesRevisionId: nullableUuid(value.supersedes_revision_id),
    createdAt: new Date(integer(value.created_at)),
  });
}
