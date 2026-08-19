import {
  DomainError,
  generateSkuMatrix,
  parseUuidV7,
  validateDimensions,
  type SkuCombination,
  type SkuMatrix,
  type SkuMatrixRepository,
  type SpecificationDimension,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

export class DrizzleSkuMatrixRepository implements SkuMatrixRepository {
  constructor(private readonly db: OpenDatabase) {}

  async load(productId: UuidV7): Promise<SkuMatrix> {
    const dimensionRows = this.db.sqlite
      .prepare(
        'SELECT id,name,position FROM specification_dimensions WHERE product_id=? ORDER BY position,id',
      )
      .all(productId) as Array<{ id: unknown; name: unknown; position: unknown }>;
    const dimensions: SpecificationDimension[] = dimensionRows.map((dimension) => {
      const dimensionId = parseUuidV7(requiredString(dimension.id));
      return {
        id: dimensionId,
        productId,
        name: requiredString(dimension.name),
        position: nonnegativeInteger(dimension.position),
        values: (
          this.db.sqlite
            .prepare(
              'SELECT id,label,position FROM specification_values WHERE dimension_id=? ORDER BY position,id',
            )
            .all(dimensionId) as Array<{ id: unknown; label: unknown; position: unknown }>
        ).map((value) => ({
          id: parseUuidV7(requiredString(value.id)),
          dimensionId,
          label: requiredString(value.label),
          position: nonnegativeInteger(value.position),
        })),
      };
    });
    const rows = this.db.sqlite
      .prepare('SELECT * FROM skus WHERE product_id=? ORDER BY signature,id')
      .all(productId) as Array<Record<string, unknown>>;
    const skus: SkuCombination[] = rows.map((row) => ({
      id: parseUuidV7(requiredString(row.id)),
      productId,
      signature: requiredString(row.signature),
      valueIds: (
        this.db.sqlite
          .prepare('SELECT value_id FROM sku_values WHERE sku_id=? ORDER BY position')
          .all(requiredString(row.id)) as Array<{ value_id: unknown }>
      ).map(({ value_id: valueId }) => parseUuidV7(requiredString(valueId))),
      enabled: booleanInteger(row.enabled),
      internalCode: nullableString(row.internal_code),
      externalCode: nullableString(row.external_code),
      barcode: nullableString(row.barcode),
      weightGrams: row.weight_grams === null ? null : nonnegativeInteger(row.weight_grams),
    }));
    const matrix = { dimensions, skus };
    assertMatrix(productId, matrix);
    return matrix;
  }

  async replace(productId: UuidV7, matrix: SkuMatrix): Promise<SkuMatrix> {
    assertMatrix(productId, matrix);
    this.db.sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.db.sqlite.prepare('DELETE FROM sku_values WHERE product_id=?').run(productId);
      this.db.sqlite.prepare('DELETE FROM skus WHERE product_id=?').run(productId);
      this.db.sqlite
        .prepare(
          'DELETE FROM specification_values WHERE dimension_id IN (SELECT id FROM specification_dimensions WHERE product_id=?)',
        )
        .run(productId);
      this.db.sqlite
        .prepare('DELETE FROM specification_dimensions WHERE product_id=?')
        .run(productId);
      for (const dimension of matrix.dimensions) {
        this.db.sqlite
          .prepare('INSERT INTO specification_dimensions VALUES (?,?,?,?)')
          .run(dimension.id, productId, dimension.name, dimension.position);
        for (const value of dimension.values) {
          this.db.sqlite
            .prepare('INSERT INTO specification_values VALUES (?,?,?,?,?)')
            .run(value.id, dimension.id, productId, value.label, value.position);
        }
      }
      for (const sku of matrix.skus) {
        this.db.sqlite
          .prepare('INSERT INTO skus VALUES (?,?,?,?,?,?,?,?)')
          .run(
            sku.id,
            productId,
            sku.signature,
            sku.enabled ? 1 : 0,
            sku.internalCode,
            sku.externalCode,
            sku.barcode,
            sku.weightGrams,
          );
        sku.valueIds.forEach((valueId, position) =>
          this.db.sqlite
            .prepare('INSERT INTO sku_values VALUES (?,?,?,?)')
            .run(sku.id, productId, valueId, position),
        );
      }
      this.db.sqlite.exec('COMMIT');
      return matrix;
    } catch (error) {
      try {
        this.db.sqlite.exec('ROLLBACK');
      } catch (rollbackError) {
        void rollbackError;
      }
      throw error;
    }
  }

  async updateSku(productId: UuidV7, sku: SkuCombination): Promise<SkuCombination | undefined> {
    assertMutableSku(productId, sku);
    const result = this.db.sqlite
      .prepare(
        'UPDATE skus SET enabled=?,internal_code=?,external_code=?,barcode=?,weight_grams=? WHERE id=? AND product_id=?',
      )
      .run(
        sku.enabled ? 1 : 0,
        sku.internalCode,
        sku.externalCode,
        sku.barcode,
        sku.weightGrams,
        sku.id,
        productId,
      );
    if (Number(result.changes) !== 1) return undefined;
    return (await this.load(productId)).skus.find(({ id }) => id === sku.id);
  }
}

function assertMatrix(productId: UuidV7, matrix: SkuMatrix): void {
  if (matrix.dimensions.length === 0 && matrix.skus.length === 0) return;
  if (matrix.dimensions.length === 0) throw invalidPersistence();
  const dimensions = validateDimensions(matrix.dimensions);
  if (dimensions.some((dimension) => dimension.productId !== productId)) throw invalidPersistence();
  if (new Set(matrix.skus.map(({ id }) => id)).size !== matrix.skus.length)
    throw invalidPersistence();
  for (const sku of matrix.skus) assertMutableSku(productId, sku);
  let regenerated: readonly SkuCombination[];
  try {
    regenerated = generateSkuMatrix(dimensions, matrix.skus, () => {
      throw invalidPersistence();
    });
  } catch {
    throw invalidPersistence();
  }
  if (regenerated.length !== matrix.skus.length) throw invalidPersistence();
}

function assertMutableSku(productId: UuidV7, sku: SkuCombination): void {
  if (
    sku.productId !== productId ||
    !sku.signature ||
    sku.signature !== sku.valueIds.join(':') ||
    (sku.weightGrams !== null && (!Number.isSafeInteger(sku.weightGrams) || sku.weightGrams < 0)) ||
    [sku.internalCode, sku.externalCode, sku.barcode].some(
      (value) => value !== null && (!value.trim() || value.length > 120),
    )
  ) {
    throw invalidPersistence();
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalidPersistence();
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value);
}

function nonnegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidPersistence();
  }
  return value;
}

function booleanInteger(value: unknown): boolean {
  if (value !== 0 && value !== 1) throw invalidPersistence();
  return value === 1;
}

function invalidPersistence(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Persisted SKU matrix is invalid.');
}
