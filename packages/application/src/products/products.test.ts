import { describe, expect, it } from 'vitest';

import { parseUuidV7, type Product, type ProductRepository } from '@eaw/domain';

import { createProductsApplication } from './index.js';

describe('product use cases', () => {
  it('creates, lists, gets, archives, and permits reuse of archived names', async () => {
    const application = createProductsApplication({
      idFactory: () => parseUuidV7('0198f0a0-0000-7000-8000-000000000001'),
      now: () => new Date('2026-08-19T08:00:00.000Z'),
      repository: new InMemoryProductRepository(),
    });

    const product = await application.create({ name: '  保温杯  ' });
    await expect(application.create({ name: '保温杯' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(await application.list()).toEqual([product]);
    expect(await application.get(product.id)).toEqual(product);

    expect(await application.archive(product.id)).toMatchObject({ archivedAt: expect.any(Date) });
    await expect(application.get(product.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(application.create({ name: '保温杯' })).resolves.toMatchObject({ name: '保温杯' });
  });
});

class InMemoryProductRepository implements ProductRepository {
  readonly products: Product[] = [];

  async create(product: Product): Promise<Product> {
    this.products.push(product);
    return product;
  }

  async findActiveByName(name: string): Promise<Product | undefined> {
    return this.products.find((product) => product.name === name && product.archivedAt === null);
  }

  async findById(id: Product['id']): Promise<Product | undefined> {
    return this.products.find((product) => product.id === id);
  }

  async list(): Promise<readonly Product[]> {
    return this.products.filter((product) => product.archivedAt === null);
  }

  async archive(id: Product['id'], archivedAt: Date): Promise<Product | undefined> {
    const index = this.products.findIndex(
      (product) => product.id === id && product.archivedAt === null,
    );
    if (index === -1) return undefined;
    const archived = { ...this.products[index]!, archivedAt, updatedAt: archivedAt };
    this.products[index] = archived;
    return archived;
  }
}
