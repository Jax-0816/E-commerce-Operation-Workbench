import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createProductionApp } from './runtime.js';

const directories: string[] = [];
const migrationsDirectory = fileURLToPath(new URL('../../../migrations/', import.meta.url));

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('production app composition', () => {
  it('serves products from a migrated workspace and releases resources for restart', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-runtime-')));
    directories.push(workspacePath);

    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const created = await first.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: '生产组合保温杯' },
    });
    expect(created.statusCode).toBe(201);
    await first.close();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const listed = await restarted.inject({ method: 'GET', url: '/api/v1/products' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({ items: [{ name: '生产组合保温杯' }] });
    await restarted.close();
  });

  it('releases partial resources when migration fails', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-failure-')));
    directories.push(workspacePath);
    const invalidMigrations = join(workspacePath, 'invalid-migrations');
    await mkdir(invalidMigrations);
    await writeFile(join(invalidMigrations, '0000_invalid.sql'), 'THIS IS INVALID SQL;\n', 'utf8');

    await expect(
      createProductionApp({ migrationsDirectory: invalidMigrations, workspacePath }),
    ).rejects.toThrow();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    expect((await restarted.inject({ method: 'GET', url: '/api/v1/products' })).statusCode).toBe(
      200,
    );
    await restarted.close();
  });

  it('persists an explicitly confirmed product fact across production restarts', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-facts-')));
    directories.push(workspacePath);
    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const product = await first.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: '事实测试保温杯' },
    });
    const productId = product.json().id as string;
    const created = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/facts`,
      payload: {
        key: 'material',
        label: '材质',
        value: { type: 'text', value: '304不锈钢' },
        unit: null,
        sourceType: 'ai_inferred',
        sourceRef: 'generation:1',
        verification: 'inferred',
        sensitive: false,
        policyEligible: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const fact = created.json() as { id: string; updatedAt: string };
    const confirmed = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/facts/${fact.id}/confirm`,
      payload: {
        expectedUpdatedAt: fact.updatedAt,
        actorRef: 'local-user',
        evidenceRef: 'supplier:certificate-1',
      },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      verification: 'confirmed',
      confirmation: {
        actorType: 'user',
        actorRef: 'local-user',
        evidenceRef: 'supplier:certificate-1',
      },
    });
    await first.close();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const listed = await restarted.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/facts`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      items: [{ key: 'material', verification: 'confirmed' }],
    });
    await restarted.close();
  });

  it('persists a configured and disabled SKU combination across production restarts', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-skus-')));
    directories.push(workspacePath);
    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const product = await first.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: 'SKU 测试保温杯' },
    });
    const productId = product.json().id as string;
    const configured = await first.inject({
      method: 'PUT',
      url: `/api/v1/products/${productId}/skus`,
      payload: {
        dimensions: [
          { name: '颜色', values: ['红', '蓝'] },
          { name: '容量', values: ['500ml', '750ml'] },
        ],
      },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json().skus).toHaveLength(4);
    const skuId = configured.json().skus[1].id as string;
    const disabled = await first.inject({
      method: 'PATCH',
      url: `/api/v1/products/${productId}/skus/${skuId}`,
      payload: {
        enabled: false,
        internalCode: 'RED-750',
        externalCode: 'PLATFORM-1',
        barcode: '6901234567890',
        weightGrams: 812,
      },
    });
    expect(disabled.statusCode).toBe(200);
    await first.close();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const loaded = await restarted.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/skus`,
    });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().skus).toContainEqual(
      expect.objectContaining({
        id: skuId,
        enabled: false,
        internalCode: 'RED-750',
        externalCode: 'PLATFORM-1',
        barcode: '6901234567890',
        weightGrams: 812,
      }),
    );
    await restarted.close();
  });

  it('persists independent platform profiles across production restarts', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-platforms-')));
    directories.push(workspacePath);
    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const product = await first.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: '平台档案测试保温杯' },
    });
    const productId = product.json().id as string;
    for (const [platformId, categoryCode, title] of [
      ['pinduoduo', 'pdd-100', '拼多多标题'],
      ['taobao', 'tb-200', '淘宝标题'],
    ] as const) {
      const response = await first.inject({
        method: 'PUT',
        url: `/api/v1/products/${productId}/platform-profiles/${platformId}`,
        payload: {
          categoryCode,
          categoryName: '杯具',
          externalProductId: null,
          title,
          description: `${title}内容`,
          metadata: { channel: platformId },
        },
      });
      expect(response.statusCode).toBe(200);
    }
    await first.close();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const listed = await restarted.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/platform-profiles`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      items: [
        { platformId: 'pinduoduo', categoryCode: 'pdd-100', title: '拼多多标题' },
        { platformId: 'taobao', categoryCode: 'tb-200', title: '淘宝标题' },
      ],
    });
    await restarted.close();
  });
});
