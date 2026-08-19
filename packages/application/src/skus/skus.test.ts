import { describe, expect, it } from 'vitest';

import {
  parseUuidV7,
  type Product,
  type ProductRepository,
  type SkuCombination,
  type SkuMatrix,
  type SkuMatrixRepository,
  type UuidV7,
} from '@eaw/domain';

import { createSkusApplication } from './index.js';

const productId = id(1);

describe('SKU use cases', () => {
  it('generates 2x2 combinations and preserves identity and custom fields when reconfigured', async () => {
    const repository = new MemorySkuRepository();
    let next = 10;
    const application = createSkusApplication({
      repository,
      products: new MemoryProductRepository(),
      idFactory: () => id(next++),
    });
    const dimensions = [
      { name: '颜色', values: ['红', '蓝'] },
      { name: '容量', values: ['500ml', '750ml'] },
    ];

    const first = await application.configure(productId, dimensions);
    expect(first.skus).toHaveLength(4);
    const customized = await application.update(productId, first.skus[1]!.id, {
      enabled: false,
      internalCode: 'RED-750',
      externalCode: null,
      barcode: null,
      weightGrams: 812,
    });
    const second = await application.configure(productId, dimensions);

    expect(second.skus.find(({ id: skuId }) => skuId === customized.id)).toEqual(customized);
    expect(second.dimensions).toEqual(first.dimensions);
  });

  it('rejects archived products, duplicate values, and invalid SKU weights', async () => {
    const repository = new MemorySkuRepository();
    const products = new MemoryProductRepository();
    let next = 50;
    const application = createSkusApplication({
      repository,
      products,
      idFactory: () => id(next++),
    });
    const matrix = await application.configure(productId, [{ name: '颜色', values: ['红'] }]);

    await expect(
      application.configure(productId, [{ name: '颜色', values: ['红', ' 红 '] }]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      application.update(productId, matrix.skus[0]!.id, {
        enabled: true,
        internalCode: null,
        externalCode: null,
        barcode: null,
        weightGrams: -1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    products.product = { ...products.product, archivedAt: new Date() };
    await expect(application.get(productId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

class MemorySkuRepository implements SkuMatrixRepository {
  matrix: SkuMatrix = { dimensions: [], skus: [] };
  async load(): Promise<SkuMatrix> {
    return this.matrix;
  }
  async replace(_productId: UuidV7, matrix: SkuMatrix): Promise<SkuMatrix> {
    this.matrix = matrix;
    return matrix;
  }
  async updateSku(_productId: UuidV7, sku: SkuCombination): Promise<SkuCombination | undefined> {
    this.matrix = {
      ...this.matrix,
      skus: this.matrix.skus.map((current) => (current.id === sku.id ? sku : current)),
    };
    return sku;
  }
}

class MemoryProductRepository implements ProductRepository {
  product: Product = {
    id: productId,
    name: '保温杯',
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
  async create(product: Product) {
    return product;
  }
  async findActiveByName() {
    return undefined;
  }
  async findById() {
    return this.product;
  }
  async list() {
    return [this.product];
  }
  async archive() {
    return undefined;
  }
}

function id(value: number): UuidV7 {
  return parseUuidV7(`0198f0a0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
