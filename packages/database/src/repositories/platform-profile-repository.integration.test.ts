import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createPlatformProfile, createProduct, parseUuidV7 } from '@eaw/domain';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzlePlatformProfileRepository } from './platform-profile-repository.js';
import { DrizzleProductRepository } from './product-repository.js';

const directories: string[] = [];
const productId = id(1);
const migrationsDirectory = fileURLToPath(new URL('../../../../migrations/', import.meta.url));

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('platform profile repository', () => {
  it('persists independent category and content for each product platform', async () => {
    const { database, repository } = await fixture();
    const pinduoduo = profile(10, 'pinduoduo', 'pdd-100', '拼多多标题');
    const taobao = profile(11, 'taobao', 'tb-200', '淘宝标题');
    await repository.create(pinduoduo);
    await repository.create(taobao);

    expect(await repository.list(productId)).toEqual([pinduoduo, taobao]);
    expect(await repository.find(productId, 'pinduoduo')).toEqual(pinduoduo);
    expect(await repository.find(productId, 'taobao')).toEqual(taobao);
    database.close();
  });

  it('allows one profile per product/platform and one optimistic update winner', async () => {
    const { database, repository } = await fixture();
    const original = profile(20, 'douyin', 'dy-100', '抖音标题');
    const concurrentCreates = await Promise.allSettled([
      repository.create(original),
      repository.create({ ...original, id: id(21) }),
    ]);
    expect(concurrentCreates.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(concurrentCreates.filter(({ status }) => status === 'rejected')).toHaveLength(1);

    const firstUpdate = {
      ...original,
      title: '更新一',
      updatedAt: new Date('2026-08-20T01:00:00.000Z'),
    };
    const secondUpdate = {
      ...original,
      title: '更新二',
      updatedAt: new Date('2026-08-20T02:00:00.000Z'),
    };
    const updates = await Promise.all([
      repository.update(firstUpdate, original.updatedAt),
      repository.update(secondUpdate, original.updatedAt),
    ]);
    expect(updates.filter(Boolean)).toHaveLength(1);
    database.close();
  });

  it('fails closed when persisted metadata or status is malformed', async () => {
    const { database, repository } = await fixture();
    const saved = profile(30, 'pinduoduo', 'pdd-300', '标题');
    await repository.create(saved);
    database.sqlite.exec('PRAGMA ignore_check_constraints = ON');
    database.sqlite
      .prepare(
        "UPDATE product_platform_profiles SET metadata_json = '[]', status = 'unknown' WHERE id = ?",
      )
      .run(saved.id);

    await expect(repository.find(productId, 'pinduoduo')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    database.close();
  });
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-platform-profile-'));
  directories.push(directory);
  const database = openDatabase(join(directory, 'database.sqlite'));
  await migrateDatabase(database, migrationsDirectory);
  await new DrizzleProductRepository(database.drizzle).create(
    createProduct({ id: productId, name: '保温杯', now: new Date() }),
  );
  return { database, repository: new DrizzlePlatformProfileRepository(database) };
}

function profile(
  identifier: number,
  platformId: 'pinduoduo' | 'taobao' | 'douyin',
  categoryCode: string,
  title: string,
) {
  return createPlatformProfile({
    id: id(identifier),
    productId,
    platformId,
    categoryCode,
    categoryName: '杯具',
    externalProductId: null,
    title,
    description: `${title}内容`,
    metadata: { channel: platformId },
    now: new Date('2026-08-20T00:00:00.000Z'),
  });
}

function id(value: number) {
  return parseUuidV7(`0198f0a0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
