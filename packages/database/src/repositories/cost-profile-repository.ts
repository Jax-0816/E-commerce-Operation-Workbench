import {
  createCostProfile,
  DomainError,
  parseUuidV7,
  type CostProfile,
  type CostProfileItem,
  type CostProfileRepository,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

export class DrizzleCostProfileRepository implements CostProfileRepository {
  constructor(private readonly database: OpenDatabase) {}

  async findBySkuId(skuId: UuidV7): Promise<CostProfile | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM cost_profiles WHERE sku_id=?')
      .get(skuId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const items = this.database.sqlite
      .prepare('SELECT * FROM cost_profile_items WHERE profile_id=? ORDER BY rowid')
      .all(requiredString(row.id)) as Array<Record<string, unknown>>;
    try {
      const profile = createCostProfile({
        id: parseUuidV7(requiredString(row.id)),
        skuId: parseUuidV7(requiredString(row.sku_id)),
        currency: requiredString(row.currency),
        items: items.map(readItem),
        now: new Date(requiredInteger(row.created_at)),
      });
      return {
        ...profile,
        revisionNo: requiredPositiveInteger(row.revision_no),
        updatedAt: new Date(requiredInteger(row.updated_at)),
      };
    } catch {
      throw invalidPersistence();
    }
  }

  async create(profile: CostProfile): Promise<CostProfile> {
    this.database.sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.database.sqlite
        .prepare('INSERT INTO cost_profiles VALUES (?,?,?,?,?,?)')
        .run(
          profile.id,
          profile.skuId,
          profile.currency,
          profile.revisionNo,
          profile.createdAt.getTime(),
          profile.updatedAt.getTime(),
        );
      this.insertItems(profile);
      this.database.sqlite.exec('COMMIT');
      return profile;
    } catch (error) {
      rollback(this.database);
      throw error;
    }
  }

  async update(profile: CostProfile, expectedRevisionNo: number): Promise<CostProfile | undefined> {
    this.database.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = this.database.sqlite
        .prepare(
          'UPDATE cost_profiles SET revision_no=?,updated_at=? WHERE id=? AND sku_id=? AND revision_no=?',
        )
        .run(
          profile.revisionNo,
          profile.updatedAt.getTime(),
          profile.id,
          profile.skuId,
          expectedRevisionNo,
        );
      if (Number(result.changes) !== 1) {
        this.database.sqlite.exec('ROLLBACK');
        return undefined;
      }
      this.database.sqlite
        .prepare('DELETE FROM cost_profile_items WHERE profile_id=?')
        .run(profile.id);
      this.insertItems(profile);
      this.database.sqlite.exec('COMMIT');
      return profile;
    } catch (error) {
      rollback(this.database);
      throw error;
    }
  }

  private insertItems(profile: CostProfile): void {
    const statement = this.database.sqlite.prepare(
      'INSERT INTO cost_profile_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    for (const item of profile.items) {
      statement.run(
        profile.id,
        item.key,
        item.label,
        item.kind,
        item.classification,
        item.critical ? 1 : 0,
        item.status,
        item.amountMinorUnits,
        item.allocationUnits,
        item.unitsPerOrder,
        item.rateBasisPoints,
        item.percentageBase,
        item.formula === null ? null : JSON.stringify(item.formula),
      );
    }
  }
}

function readItem(row: Record<string, unknown>): CostProfileItem {
  return {
    key: requiredString(row.item_key),
    label: requiredString(row.label),
    kind: requiredString(row.kind) as CostProfileItem['kind'],
    classification: requiredString(row.classification) as CostProfileItem['classification'],
    critical: requiredBoolean(row.critical),
    status: requiredString(row.status) as CostProfileItem['status'],
    amountMinorUnits: nullableString(row.amount_minor_units),
    allocationUnits: nullableString(row.allocation_units),
    unitsPerOrder: nullableString(row.units_per_order),
    rateBasisPoints: nullableString(row.rate_basis_points),
    percentageBase: nullableString(row.percentage_base) as CostProfileItem['percentageBase'],
    formula: row.formula_json === null ? null : JSON.parse(requiredString(row.formula_json)),
  };
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value) throw invalidPersistence();
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : requiredString(value);
}

function requiredInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalidPersistence();
  return value;
}

function requiredPositiveInteger(value: unknown): number {
  const result = requiredInteger(value);
  if (result < 1) throw invalidPersistence();
  return result;
}

function requiredBoolean(value: unknown): boolean {
  if (value !== 0 && value !== 1) throw invalidPersistence();
  return value === 1;
}

function rollback(database: OpenDatabase): void {
  try {
    database.sqlite.exec('ROLLBACK');
  } catch {
    // Transaction may already be closed by SQLite.
  }
}

function invalidPersistence(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Persisted cost profile is invalid.');
}
