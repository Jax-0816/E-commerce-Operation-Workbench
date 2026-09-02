import {
  createPromotionResultRecord,
  createPromotionScenario,
  DomainError,
  parseUuidV7,
  type PromotionRepository,
  type PromotionResultRecord,
  type PromotionScenario,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type Row = Record<string, unknown>;

export class DrizzlePromotionRepository implements PromotionRepository {
  constructor(private readonly database: OpenDatabase) {}

  async createScenario(scenario: PromotionScenario): Promise<PromotionScenario> {
    const valid = createPromotionScenario(scenario);
    this.database.sqlite
      .prepare('INSERT INTO promotion_scenarios VALUES (?,?,?,?,?,?,?,?,?)')
      .run(
        valid.id,
        valid.productId,
        valid.name,
        valid.platformId,
        valid.region,
        valid.ruleSnapshotId,
        valid.ruleSnapshotHash,
        JSON.stringify(valid.configurationSnapshot),
        valid.createdAt.getTime(),
      );
    return valid;
  }

  async appendResults(
    scenarioId: UuidV7,
    results: readonly PromotionResultRecord[],
  ): Promise<readonly PromotionResultRecord[]> {
    if (results.length === 0 || results.some((result) => result.scenarioId !== scenarioId)) {
      throw invalidPersistence();
    }
    const valid = results.map(createPromotionResultRecord);
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const insert = this.database.sqlite.prepare(
        'INSERT INTO promotion_results VALUES (?,?,?,?,?,?,?,?,?,?)',
      );
      for (const result of valid) {
        insert.run(
          result.id,
          result.scenarioId,
          result.skuId,
          result.costProfileId,
          result.costProfileRevisionNo,
          result.status,
          JSON.stringify(result.inputSnapshot),
          JSON.stringify(result.resultSnapshot),
          result.engineVersion,
          result.createdAt.getTime(),
        );
      }
      this.database.sqlite.exec('COMMIT;');
    } catch (error) {
      try {
        this.database.sqlite.exec('ROLLBACK;');
      } catch {
        // Preserve the original write error if SQLite already ended the transaction.
      }
      throw error;
    }
    return valid;
  }

  async findScenario(id: UuidV7): Promise<PromotionScenario | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM promotion_scenarios WHERE id=?')
      .get(id) as Row | undefined;
    return row === undefined ? undefined : readScenario(row);
  }

  async listScenarios(productId: UuidV7): Promise<readonly PromotionScenario[]> {
    return (
      this.database.sqlite
        .prepare('SELECT * FROM promotion_scenarios WHERE product_id=? ORDER BY created_at,id')
        .all(productId) as Row[]
    ).map(readScenario);
  }

  async listResults(scenarioId: UuidV7): Promise<readonly PromotionResultRecord[]> {
    return (
      this.database.sqlite
        .prepare('SELECT * FROM promotion_results WHERE scenario_id=? ORDER BY created_at,id')
        .all(scenarioId) as Row[]
    ).map(readResult);
  }
}

function readScenario(row: Row): PromotionScenario {
  try {
    return createPromotionScenario({
      id: parseUuidV7(requiredString(row.id)),
      productId: parseUuidV7(requiredString(row.product_id)),
      name: requiredString(row.name),
      platformId: requiredString(row.platform_id) as 'pinduoduo',
      region: requiredString(row.region),
      ruleSnapshotId: parseUuidV7(requiredString(row.rule_snapshot_id)),
      ruleSnapshotHash: requiredString(row.rule_snapshot_hash),
      configurationSnapshot: JSON.parse(requiredString(row.configuration_snapshot_json)),
      createdAt: new Date(requiredInteger(row.created_at)),
    });
  } catch {
    throw invalidPersistence();
  }
}

function readResult(row: Row): PromotionResultRecord {
  try {
    return createPromotionResultRecord({
      id: parseUuidV7(requiredString(row.id)),
      scenarioId: parseUuidV7(requiredString(row.scenario_id)),
      skuId: parseUuidV7(requiredString(row.sku_id)),
      costProfileId:
        row.cost_profile_id === null ? null : parseUuidV7(requiredString(row.cost_profile_id)),
      costProfileRevisionNo:
        row.cost_profile_revision_no === null
          ? null
          : requiredInteger(row.cost_profile_revision_no),
      status: requiredString(row.status) as PromotionResultRecord['status'],
      inputSnapshot: JSON.parse(requiredString(row.input_snapshot_json)),
      resultSnapshot: JSON.parse(requiredString(row.result_snapshot_json)),
      engineVersion: requiredString(row.engine_version),
      createdAt: new Date(requiredInteger(row.created_at)),
    });
  } catch {
    throw invalidPersistence();
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value) throw invalidPersistence();
  return value;
}

function requiredInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalidPersistence();
  return value;
}

function invalidPersistence(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Persisted promotion record is invalid.');
}
