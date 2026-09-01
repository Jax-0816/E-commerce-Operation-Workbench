import {
  createPricingResultRecord,
  createPricingScenario,
  DomainError,
  parseUuidV7,
  type PricingRepository,
  type PricingResultRecord,
  type PricingScenario,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

export class DrizzlePricingRepository implements PricingRepository {
  constructor(private readonly database: OpenDatabase) {}

  async appendCalculation(scenario: PricingScenario, result: PricingResultRecord) {
    if (result.scenarioId !== scenario.id || result.skuId !== scenario.skuId) {
      throw new DomainError('VALIDATION_ERROR', 'Pricing result does not match its scenario.');
    }
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      this.database.sqlite
        .prepare('INSERT INTO pricing_scenarios VALUES (?,?,?,?,?,?,?)')
        .run(
          scenario.id,
          scenario.skuId,
          scenario.costProfileId,
          scenario.costProfileRevisionNo,
          scenario.name,
          JSON.stringify(scenario.goalSnapshot),
          scenario.createdAt.getTime(),
        );
      this.database.sqlite
        .prepare('INSERT INTO pricing_results VALUES (?,?,?,?,?,?,?,?)')
        .run(
          result.id,
          result.scenarioId,
          result.skuId,
          result.status,
          JSON.stringify(result.inputSnapshot),
          JSON.stringify(result.resultSnapshot),
          result.engineVersion,
          result.createdAt.getTime(),
        );
      this.database.sqlite.exec('COMMIT;');
    } catch (error) {
      try {
        this.database.sqlite.exec('ROLLBACK;');
      } catch {
        // Preserve the original write error if SQLite already ended the transaction.
      }
      throw error;
    }
    return { scenario, result };
  }

  async listScenarios(skuId: UuidV7): Promise<readonly PricingScenario[]> {
    return (
      this.database.sqlite
        .prepare('SELECT * FROM pricing_scenarios WHERE sku_id=? ORDER BY created_at,id')
        .all(skuId) as Array<Record<string, unknown>>
    ).map(readScenario);
  }

  async listResults(scenarioId: UuidV7): Promise<readonly PricingResultRecord[]> {
    return (
      this.database.sqlite
        .prepare('SELECT * FROM pricing_results WHERE scenario_id=? ORDER BY created_at,id')
        .all(scenarioId) as Array<Record<string, unknown>>
    ).map(readResult);
  }
}

function readScenario(row: Record<string, unknown>): PricingScenario {
  try {
    return createPricingScenario({
      id: parseUuidV7(requiredString(row.id)),
      skuId: parseUuidV7(requiredString(row.sku_id)),
      costProfileId: parseUuidV7(requiredString(row.cost_profile_id)),
      costProfileRevisionNo: requiredInteger(row.cost_profile_revision_no),
      name: requiredString(row.name),
      goalSnapshot: JSON.parse(requiredString(row.goal_json)),
      createdAt: new Date(requiredInteger(row.created_at)),
    });
  } catch {
    throw invalidPersistence();
  }
}

function readResult(row: Record<string, unknown>): PricingResultRecord {
  try {
    return createPricingResultRecord({
      id: parseUuidV7(requiredString(row.id)),
      scenarioId: parseUuidV7(requiredString(row.scenario_id)),
      skuId: parseUuidV7(requiredString(row.sku_id)),
      status: requiredString(row.status) as PricingResultRecord['status'],
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
  return new DomainError('VALIDATION_ERROR', 'Persisted pricing record is invalid.');
}
