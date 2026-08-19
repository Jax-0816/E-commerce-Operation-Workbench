import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createProduct,
  generateSkuMatrix,
  parseUuidV7,
  type SpecificationDimension,
} from '@eaw/domain';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzleProductRepository } from './product-repository.js';
import { DrizzleSkuMatrixRepository } from './sku-matrix-repository.js';

const directories: string[] = [];
const productId = id(1);

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('SKU matrix repository', () => {
  it('round-trips a matrix and preserves disabled SKU-specific fields', async () => {
    const { database, repository } = await fixture();
    const dimensions = oneDimension();
    let next = 10;
    const skus = generateSkuMatrix(dimensions, [], () => id(next++));

    await repository.replace(productId, { dimensions, skus });
    await repository.updateSku(productId, {
      ...skus[0]!,
      enabled: false,
      internalCode: 'SKU-1',
      weightGrams: 800,
    });

    expect(await repository.load(productId)).toMatchObject({
      dimensions,
      skus: [{ enabled: false, internalCode: 'SKU-1', weightGrams: 800 }, { enabled: true }],
    });
    database.close();
  });

  it('rejects an incomplete or foreign matrix before replacing the persisted matrix', async () => {
    const { database, repository } = await fixture();
    const dimensions = oneDimension();
    let next = 20;
    const skus = generateSkuMatrix(dimensions, [], () => id(next++));
    await repository.replace(productId, { dimensions, skus });

    await expect(
      repository.replace(productId, { dimensions, skus: skus.slice(0, 1) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      repository.replace(productId, {
        dimensions,
        skus: [{ ...skus[0]!, productId: id(999) }, skus[1]!],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await repository.load(productId)).toEqual({ dimensions, skus });
    database.close();
  });

  it('fails closed when persisted boolean data is malformed', async () => {
    const { database, repository } = await fixture();
    const dimensions = oneDimension();
    let next = 30;
    const skus = generateSkuMatrix(dimensions, [], () => id(next++));
    await repository.replace(productId, { dimensions, skus });
    database.sqlite.exec('PRAGMA ignore_check_constraints = ON');
    database.sqlite.prepare('UPDATE skus SET enabled = 2 WHERE id = ?').run(skus[0]!.id);

    await expect(repository.load(productId)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    database.close();
  });

  it('enforces product ownership when a SKU value is linked directly in SQLite', async () => {
    const { database, repository } = await fixture();
    const dimensions = oneDimension();
    let next = 40;
    const skus = generateSkuMatrix(dimensions, [], () => id(next++));
    await repository.replace(productId, { dimensions, skus });

    const foreignProductId = id(100);
    await new DrizzleProductRepository(database.drizzle).create(
      createProduct({ id: foreignProductId, name: '外部商品', now: new Date() }),
    );
    const foreignDimension: SpecificationDimension = {
      id: id(101),
      productId: foreignProductId,
      name: '材质',
      position: 0,
      values: [{ id: id(102), dimensionId: id(101), label: '钢', position: 0 }],
    };
    const foreignSkus = generateSkuMatrix([foreignDimension], [], () => id(103));
    await repository.replace(foreignProductId, {
      dimensions: [foreignDimension],
      skus: foreignSkus,
    });

    database.sqlite
      .prepare('DELETE FROM sku_values WHERE sku_id = ? AND position = 0')
      .run(skus[0]!.id);
    expect(() =>
      database.sqlite
        .prepare('INSERT INTO sku_values VALUES (?,?,?,?)')
        .run(skus[0]!.id, productId, foreignDimension.values[0]!.id, 0),
    ).toThrow();
    database.close();
  });
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-sku-'));
  directories.push(directory);
  const database = openDatabase(join(directory, 'db.sqlite'));
  await migrateDatabase(
    database,
    fileURLToPath(new URL('../../../../migrations/', import.meta.url)),
  );
  await new DrizzleProductRepository(database.drizzle).create(
    createProduct({ id: productId, name: '保温杯', now: new Date() }),
  );
  return { database, repository: new DrizzleSkuMatrixRepository(database) };
}

function oneDimension(): readonly SpecificationDimension[] {
  return [
    {
      id: id(2),
      productId,
      name: '颜色',
      position: 0,
      values: [
        { id: id(3), dimensionId: id(2), label: '红', position: 0 },
        { id: id(4), dimensionId: id(2), label: '蓝', position: 1 },
      ],
    },
  ];
}

function id(value: number) {
  return parseUuidV7(`0198f0a0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
