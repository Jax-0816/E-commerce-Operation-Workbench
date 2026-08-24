import { describe, expect, it } from 'vitest';

import {
  parseUuidV7,
  type PlatformId,
  type PlatformProfileRepository,
  type Product,
  type ProductPlatformProfile,
  type ProductRepository,
} from '@eaw/domain';

import { createPlatformProfilesApplication } from './index.js';

const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');

describe('platform profile use cases', () => {
  it('keeps category and content independent per platform', async () => {
    let nextId = 10;
    let now = new Date('2026-08-20T00:00:00.000Z');
    const repository = new MemoryPlatformProfileRepository();
    const application = createPlatformProfilesApplication({
      repository,
      products: new MemoryProductRepository(),
      idFactory: () => parseUuidV7(`0198f0a0-0000-7000-8000-${String(nextId++).padStart(12, '0')}`),
      now: () => now,
    });

    const pinduoduo = await application.save(productId, 'pinduoduo', {
      categoryCode: 'pdd-100',
      categoryName: '保温杯',
      externalProductId: 'pdd-product-1',
      title: '拼多多标题',
      description: '拼多多内容',
      metadata: { activity: '百亿补贴' },
    });
    const taobao = await application.save(productId, 'taobao', {
      categoryCode: 'tb-200',
      categoryName: '杯具',
      externalProductId: 'tb-product-1',
      title: '淘宝标题',
      description: '淘宝内容',
      metadata: { channel: '天猫' },
    });

    expect(await application.list(productId)).toEqual([pinduoduo, taobao]);
    expect(await application.get(productId, 'pinduoduo')).toMatchObject({
      categoryCode: 'pdd-100',
      title: '拼多多标题',
    });
    expect(await application.get(productId, 'taobao')).toMatchObject({
      categoryCode: 'tb-200',
      title: '淘宝标题',
    });

    now = new Date('2026-08-20T01:00:00.000Z');
    await application.save(productId, 'pinduoduo', {
      categoryCode: 'pdd-101',
      categoryName: '保温杯',
      externalProductId: 'pdd-product-1',
      title: '拼多多新标题',
      description: '拼多多内容',
      metadata: { activity: '百亿补贴' },
      expectedUpdatedAt: pinduoduo.updatedAt,
    });
    expect(await application.get(productId, 'taobao')).toEqual(taobao);
  });

  it('rejects stale updates and archived product ownership', async () => {
    const repository = new MemoryPlatformProfileRepository();
    const products = new MemoryProductRepository();
    const application = createPlatformProfilesApplication({ repository, products });
    const profile = await application.save(productId, 'douyin', emptyFields());

    await expect(
      application.save(productId, 'douyin', {
        ...emptyFields(),
        expectedUpdatedAt: new Date(profile.updatedAt.getTime() - 1),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    products.product = { ...products.product, archivedAt: new Date() };
    await expect(application.list(productId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

function emptyFields() {
  return {
    categoryCode: null,
    categoryName: null,
    externalProductId: null,
    title: null,
    description: null,
    metadata: {},
  } as const;
}

class MemoryPlatformProfileRepository implements PlatformProfileRepository {
  readonly profiles: ProductPlatformProfile[] = [];
  async find(ownerId: Product['id'], platformId: PlatformId) {
    return this.profiles.find(
      (profile) => profile.productId === ownerId && profile.platformId === platformId,
    );
  }
  async list(ownerId: Product['id']) {
    return this.profiles.filter((profile) => profile.productId === ownerId);
  }
  async create(profile: ProductPlatformProfile) {
    this.profiles.push(profile);
    return profile;
  }
  async update(profile: ProductPlatformProfile, expectedUpdatedAt: Date) {
    const index = this.profiles.findIndex(
      (current) =>
        current.id === profile.id && current.updatedAt.getTime() === expectedUpdatedAt.getTime(),
    );
    if (index < 0) return undefined;
    this.profiles[index] = profile;
    return profile;
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
