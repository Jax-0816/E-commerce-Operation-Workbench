import {
  createOperationPlanRevision,
  DomainError,
  parseUuidV7,
  type OperationPlanBlocker,
  type OperationPlanNodeSource,
  type OperationPlanRepository,
  type OperationPlanRevision,
  type PlatformId,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type Row = Record<string, unknown>;

export class SqliteOperationPlanRepository implements OperationPlanRepository {
  constructor(private readonly database: OpenDatabase) {}

  async append(revision: OperationPlanRevision, expectedRevisionNo: number | null) {
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const previous = this.latestSync(revision.lineageId);
      if (
        (expectedRevisionNo === null && previous !== undefined) ||
        (expectedRevisionNo !== null && previous?.revisionNo !== expectedRevisionNo) ||
        revision.revisionNo !== (previous?.revisionNo ?? 0) + 1 ||
        revision.supersedesRevisionId !== (previous?.id ?? null)
      ) {
        throw new DomainError('CONFLICT', 'Operation plan revision conflict.');
      }
      const value = createOperationPlanRevision(revision);
      this.insert(value);
      this.database.sqlite.exec('COMMIT;');
      return value;
    } catch (error) {
      try {
        this.database.sqlite.exec('ROLLBACK;');
      } catch {
        // Preserve the original failure when SQLite already rolled back.
      }
      throw error;
    }
  }

  async findById(id: UuidV7) {
    return this.findSync(id);
  }

  async latest(lineageId: UuidV7) {
    return this.latestSync(lineageId);
  }

  async list(productId: UuidV7) {
    const rows = this.database.sqlite
      .prepare(
        'SELECT id FROM operation_plan_revisions WHERE product_id = ? ORDER BY created_at DESC, revision_no DESC',
      )
      .all(productId) as Row[];
    return rows.map((row) => this.findSync(uuid(row.id))!);
  }

  private insert(revision: OperationPlanRevision): void {
    this.database.sqlite
      .prepare(
        'INSERT INTO operation_plan_revisions (id,lineage_id,product_id,platform_id,revision_no,status,workflow_run_id,workflow_run_revision,locked_at,source_hash,blockers_json,supersedes_revision_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        revision.id,
        revision.lineageId,
        revision.productId,
        revision.platformId,
        revision.revisionNo,
        revision.status,
        revision.sources.workflowRunId,
        revision.sources.workflowRunRevision,
        revision.lockedAt?.getTime() ?? null,
        revision.sourceHash,
        JSON.stringify(revision.blockers),
        revision.supersedesRevisionId,
        revision.createdAt.getTime(),
      );
    const nodeStatement = this.database.sqlite.prepare(
      'INSERT INTO operation_plan_node_sources (plan_id,node_order,node_key,asset_type,asset_id,asset_revision_no,dependency_hash) VALUES (?,?,?,?,?,?,?)',
    );
    revision.sources.nodes.forEach((node, index) =>
      nodeStatement.run(
        revision.id,
        index + 1,
        node.nodeKey,
        node.assetType,
        node.assetId,
        node.revisionNo,
        node.dependencyHash,
      ),
    );
    const competitorStatement = this.database.sqlite.prepare(
      'INSERT INTO operation_plan_competitor_sources (plan_id,source_order,snapshot_id) VALUES (?,?,?)',
    );
    revision.sources.competitorSnapshotIds.forEach((id, index) =>
      competitorStatement.run(revision.id, index + 1, id),
    );
    const pricing = revision.sources.pricing;
    this.database.sqlite
      .prepare(
        'INSERT INTO operation_plan_pricing_sources (plan_id,result_id,scenario_id,sku_id,cost_profile_id,cost_profile_revision_no) VALUES (?,?,?,?,?,?)',
      )
      .run(
        revision.id,
        pricing.resultId,
        pricing.scenarioId,
        pricing.skuId,
        pricing.costProfileId,
        pricing.costProfileRevisionNo,
      );
    const promotion = revision.sources.promotion;
    if (promotion) {
      this.database.sqlite
        .prepare(
          'INSERT INTO operation_plan_promotion_sources (plan_id,scenario_id,rule_snapshot_hash) VALUES (?,?,?)',
        )
        .run(revision.id, promotion.scenarioId, promotion.ruleSnapshotHash);
      const resultStatement = this.database.sqlite.prepare(
        'INSERT INTO operation_plan_promotion_results (plan_id,result_order,result_id) VALUES (?,?,?)',
      );
      promotion.resultIds.forEach((id, index) => resultStatement.run(revision.id, index + 1, id));
    }
  }

  private latestSync(lineageId: UuidV7): OperationPlanRevision | undefined {
    const row = this.database.sqlite
      .prepare(
        'SELECT id FROM operation_plan_revisions WHERE lineage_id = ? ORDER BY revision_no DESC LIMIT 1',
      )
      .get(lineageId) as Row | undefined;
    return row ? this.findSync(uuid(row.id)) : undefined;
  }

  private findSync(id: UuidV7): OperationPlanRevision | undefined {
    const header = this.database.sqlite
      .prepare('SELECT * FROM operation_plan_revisions WHERE id = ?')
      .get(id) as Row | undefined;
    if (!header) return undefined;
    const nodes = (
      this.database.sqlite
        .prepare('SELECT * FROM operation_plan_node_sources WHERE plan_id = ? ORDER BY node_order')
        .all(id) as Row[]
    ).map(node);
    const competitorSnapshotIds = (
      this.database.sqlite
        .prepare(
          'SELECT snapshot_id FROM operation_plan_competitor_sources WHERE plan_id = ? ORDER BY source_order',
        )
        .all(id) as Row[]
    ).map((row) => uuid(row.snapshot_id));
    const pricingRow = this.database.sqlite
      .prepare('SELECT * FROM operation_plan_pricing_sources WHERE plan_id = ?')
      .get(id) as Row | undefined;
    if (!pricingRow) throw new TypeError('Invalid operation plan pricing source.');
    const promotionRow = this.database.sqlite
      .prepare('SELECT * FROM operation_plan_promotion_sources WHERE plan_id = ?')
      .get(id) as Row | undefined;
    return createOperationPlanRevision({
      id: uuid(header.id),
      lineageId: uuid(header.lineage_id),
      productId: uuid(header.product_id),
      platformId: platform(header.platform_id),
      revisionNo: positive(header.revision_no),
      status:
        header.status === 'draft' ? 'draft' : header.status === 'locked' ? 'locked' : invalid(),
      lockedAt: header.locked_at === null ? null : date(header.locked_at),
      sources: {
        workflowRunId: uuid(header.workflow_run_id),
        workflowRunRevision: positive(header.workflow_run_revision),
        nodes,
        competitorSnapshotIds,
        pricing: {
          resultId: uuid(pricingRow.result_id),
          scenarioId: uuid(pricingRow.scenario_id),
          skuId: uuid(pricingRow.sku_id),
          costProfileId: uuid(pricingRow.cost_profile_id),
          costProfileRevisionNo: positive(pricingRow.cost_profile_revision_no),
        },
        promotion: promotionRow
          ? {
              scenarioId: uuid(promotionRow.scenario_id),
              ruleSnapshotHash: text(promotionRow.rule_snapshot_hash),
              resultIds: (
                this.database.sqlite
                  .prepare(
                    'SELECT result_id FROM operation_plan_promotion_results WHERE plan_id = ? ORDER BY result_order',
                  )
                  .all(id) as Row[]
              ).map((row) => uuid(row.result_id)),
            }
          : null,
      },
      sourceHash: text(header.source_hash),
      blockers: json(header.blockers_json) as OperationPlanBlocker[],
      supersedesRevisionId:
        header.supersedes_revision_id === null ? null : uuid(header.supersedes_revision_id),
      createdAt: date(header.created_at),
    });
  }
}

function node(row: Row): OperationPlanNodeSource {
  return {
    nodeKey: text(row.node_key) as OperationPlanNodeSource['nodeKey'],
    assetType: text(row.asset_type) as OperationPlanNodeSource['assetType'],
    assetId: uuid(row.asset_id),
    revisionNo: positive(row.asset_revision_no),
    dependencyHash: text(row.dependency_hash),
  };
}

function uuid(value: unknown): UuidV7 {
  if (typeof value !== 'string') throw new TypeError('Invalid operation plan UUID.');
  return parseUuidV7(value);
}

function positive(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 1)
    throw new TypeError('Invalid operation plan integer.');
  return parsed;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid operation plan text.');
  return value;
}

function date(value: unknown): Date {
  const result = new Date(positive(value));
  if (!Number.isSafeInteger(result.getTime())) throw new TypeError('Invalid operation plan date.');
  return result;
}

function platform(value: unknown): PlatformId {
  if (value === 'pinduoduo' || value === 'taobao' || value === 'douyin') return value;
  throw new TypeError('Invalid operation plan platform.');
}

function json(value: unknown): unknown {
  if (typeof value !== 'string') throw new TypeError('Invalid operation plan JSON.');
  return JSON.parse(value) as unknown;
}

function invalid(): never {
  throw new TypeError('Invalid operation plan status.');
}
