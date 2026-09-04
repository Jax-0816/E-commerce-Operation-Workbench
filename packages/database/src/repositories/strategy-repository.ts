import {
  createStrategyAsset,
  parseUuidV7,
  STRATEGY_ASSET_KINDS,
  type AppendStrategyAssetInput,
  type StrategyAsset,
  type StrategyAssetKind,
  type StrategyAssetStatus,
  type StrategyRepository,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type Row = Record<string, unknown>;

export class DrizzleStrategyRepository implements StrategyRepository {
  constructor(private readonly database: OpenDatabase) {}

  async append(input: AppendStrategyAssetInput): Promise<StrategyAsset> {
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const previous = this.latestSync(input.productId, input.kind);
      const asset = createStrategyAsset({
        ...input,
        revisionNo: (previous?.revisionNo ?? 0) + 1,
        supersedesAssetId: previous?.id ?? null,
      });
      this.database.sqlite
        .prepare(
          'INSERT INTO strategy_assets (id, product_id, kind, revision_no, generation_id, status, payload_json, supersedes_asset_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          asset.id,
          asset.productId,
          asset.kind,
          asset.revisionNo,
          asset.generationId,
          asset.status,
          JSON.stringify(asset.payload),
          asset.supersedesAssetId,
          asset.createdAt.getTime(),
        );
      this.database.sqlite.exec('COMMIT;');
      return asset;
    } catch (error) {
      this.database.sqlite.exec('ROLLBACK;');
      throw error;
    }
  }

  async latest(productId: UuidV7, kind: StrategyAssetKind): Promise<StrategyAsset | undefined> {
    return this.latestSync(productId, kind);
  }

  async list(productId: UuidV7, kind: StrategyAssetKind): Promise<readonly StrategyAsset[]> {
    return (
      this.database.sqlite
        .prepare(
          'SELECT * FROM strategy_assets WHERE product_id = ? AND kind = ? ORDER BY revision_no DESC',
        )
        .all(productId, validKind(kind)) as Row[]
    ).map(toAsset);
  }

  private latestSync(productId: UuidV7, kind: StrategyAssetKind): StrategyAsset | undefined {
    const row = this.database.sqlite
      .prepare(
        'SELECT * FROM strategy_assets WHERE product_id = ? AND kind = ? ORDER BY revision_no DESC LIMIT 1',
      )
      .get(productId, validKind(kind)) as Row | undefined;
    return row === undefined ? undefined : toAsset(row);
  }
}

function toAsset(row: Row): StrategyAsset {
  return createStrategyAsset({
    id: uuid(row.id),
    productId: uuid(row.product_id),
    kind: validKind(row.kind),
    revisionNo: integer(row.revision_no),
    generationId: uuid(row.generation_id),
    status: validStatus(row.status),
    payload: parsePayload(row.payload_json),
    supersedesAssetId: row.supersedes_asset_id === null ? null : uuid(row.supersedes_asset_id),
    createdAt: new Date(integer(row.created_at)),
  });
}

function parsePayload(value: unknown): StrategyAsset['payload'] {
  if (typeof value !== 'string') throw new TypeError('Strategy payload is invalid.');
  return JSON.parse(value) as StrategyAsset['payload'];
}

function uuid(value: unknown): UuidV7 {
  if (typeof value !== 'string') throw new TypeError('Strategy UUID is invalid.');
  return parseUuidV7(value);
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError('Strategy integer is invalid.');
  }
  return value;
}

function validKind(value: unknown): StrategyAssetKind {
  if (typeof value === 'string' && STRATEGY_ASSET_KINDS.includes(value as StrategyAssetKind)) {
    return value as StrategyAssetKind;
  }
  throw new TypeError('Strategy kind is invalid.');
}

function validStatus(value: unknown): StrategyAssetStatus {
  if (value === 'verified' || value === 'needs_review') return value;
  throw new TypeError('Strategy status is invalid.');
}
