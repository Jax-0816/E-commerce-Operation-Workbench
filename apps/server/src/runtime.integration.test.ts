import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import type { AIProvider } from '@eaw/ai-engine';

import { createProductionApp } from './runtime.js';

const directories: string[] = [];
const migrationsDirectory = fileURLToPath(new URL('../../../migrations/', import.meta.url));

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('production app composition', () => {
  it('generates and persists evidence-backed strategy revisions with a fake provider', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-strategy-')));
    directories.push(workspacePath);
    let productId = '';
    let snapshotId = '';
    const providerFactory = (): AIProvider => ({
      id: 'fake',
      async generate() {
        return {
          provider: 'fake',
          responseId: 'fake-response',
          model: 'fake',
          content: JSON.stringify({
            productId,
            conclusions: [
              {
                summary: '竞品销量展示为下界',
                evidenceRefs: [{ kind: 'competitor_snapshot', id: snapshotId, productId }],
              },
            ],
            limitations: ['仅基于导入快照'],
          }),
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        };
      },
      async testConnection() {
        return true;
      },
      getCapabilities() {
        return { text: true, structured: true };
      },
    });
    const first = await createProductionApp({
      migrationsDirectory,
      workspacePath,
      providerFactory,
    });
    productId = (
      await first.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: { name: '策略保温杯' },
      })
    ).json().id as string;
    await first.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { apiKey: 'fake-secret' },
    });
    const preview = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/competitors/import/preview`,
      payload: { format: 'paste', sourceName: 'paste', content: 'name\tsales\n竞品 A\t10万+' },
    });
    const imported = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/competitors/import/confirm`,
      payload: {
        previewProductId: productId,
        format: 'paste',
        sourceName: 'paste',
        rows: preview.json().rows,
      },
    });
    snapshotId = imported.json().items[0].snapshot.id as string;
    const generated = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/strategy/competitor_analysis/generate`,
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({
      status: 'verified',
      revisionNo: 1,
      payload: { conclusions: [{ evidenceRefs: [{ id: snapshotId }] }] },
    });
    await first.close();

    const restarted = await createProductionApp({
      migrationsDirectory,
      workspacePath,
      providerFactory,
    });
    const history = await restarted.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/strategy/competitor_analysis`,
    });
    expect(history.json().items).toHaveLength(1);
    await restarted.close();
  });
  it('previews, confirms and persists source-preserving competitor imports across restart', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-competitors-')));
    directories.push(workspacePath);
    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const product = await first.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: '竞品导入保温杯' },
    });
    const productId = product.json().id as string;
    const preview = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/competitors/import/preview`,
      payload: {
        format: 'csv',
        sourceName: 'competitors.csv',
        content: 'name,url,price,sales\n竞品 A,https://example.com/a,¥99,10万+',
      },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      productId,
      valid: true,
      rows: [{ displayedSalesText: '10万+', normalizedSales: { value: '100000' } }],
    });
    const confirmed = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/competitors/import/confirm`,
      payload: {
        previewProductId: productId,
        format: 'csv',
        sourceName: 'competitors.csv',
        rows: preview.json().rows,
      },
    });
    expect(confirmed.statusCode).toBe(200);
    const competitorId = confirmed.json().items[0].competitor.id as string;
    await first.close();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const listed = await restarted.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/competitors`,
    });
    expect(listed.json()).toMatchObject({
      items: [
        { competitor: { id: competitorId }, latestSnapshot: { displayedSalesText: '10万+' } },
      ],
    });
    expect(
      (
        await restarted.inject({
          method: 'GET',
          url: `/api/v1/products/${productId}/competitors/${competitorId}/snapshots`,
        })
      ).json(),
    ).toMatchObject({ items: [{ normalizedSales: { kind: 'lower_bound', value: '100000' } }] });
    await restarted.close();
  });

  it('keeps the DeepSeek key outside SQLite and reports only configured after restart', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-ai-settings-')));
    directories.push(workspacePath);
    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const secret = 'sk-production-secret';
    const configured = await first.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { apiKey: secret },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.body).not.toContain(secret);
    await first.close();

    expect(await readFile(join(workspacePath, '.secrets.json'), 'utf8')).toContain(secret);
    expect(
      (await readFile(join(workspacePath, 'database/workbench.sqlite'))).includes(secret),
    ).toBe(false);
    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const status = await restarted.inject({ method: 'GET', url: '/api/v1/ai/settings' });
    expect(status.json()).toEqual({
      provider: 'deepseek',
      configured: true,
      model: 'deepseek-chat',
    });
    expect(status.body).not.toContain(secret);
    await restarted.close();
  });

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

  it('persists a truthful Pinduoduo batch against the exact active rule snapshot', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-promotion-')));
    directories.push(workspacePath);
    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const product = await first.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: '活动模拟保温杯' },
    });
    const productId = product.json().id as string;
    const configured = await first.inject({
      method: 'PUT',
      url: `/api/v1/products/${productId}/skus`,
      payload: { dimensions: [{ name: '颜色', values: ['红'] }] },
    });
    const skuId = configured.json().skus[0].id as string;
    expect(
      (
        await first.inject({
          method: 'PUT',
          url: `/api/v1/products/${productId}/skus/${skuId}/cost-profile`,
          payload: {
            currency: 'CNY',
            items: [
              {
                key: 'materials',
                label: '材料',
                kind: 'per_unit',
                classification: 'cost_of_goods',
                critical: true,
                status: 'confirmed',
                amountMinorUnits: '5000',
                allocationUnits: null,
                unitsPerOrder: null,
                rateBasisPoints: null,
                percentageBase: null,
                formula: null,
              },
            ],
          },
        })
      ).statusCode,
    ).toBe(200);
    const packDirectory = fileURLToPath(
      new URL('../../../default-rule-packs/pinduoduo-cn/', import.meta.url),
    );
    const manifest = JSON.parse(await readFile(join(packDirectory, 'manifest.json'), 'utf8'));
    const rules = JSON.parse(await readFile(join(packDirectory, 'rules.json'), 'utf8'));
    const imported = await first.inject({
      method: 'POST',
      url: '/api/v1/rule-packs/import',
      payload: { format: 'json', contents: JSON.stringify({ manifest, rules }) },
    });
    expect(imported.statusCode).toBe(201);
    expect(
      (
        await first.inject({
          method: 'POST',
          url: `/api/v1/rule-packs/${imported.json().id as string}/activate`,
        })
      ).statusCode,
    ).toBe(200);
    const scenario = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/promotion-scenarios`,
      payload: {
        name: '默认规则真实性检查',
        region: 'CN',
        categoryCode: null,
        minimumMinorUnits: '5000',
        maximumMinorUnits: '12000',
        components: [
          {
            key: 'merchant-coupon',
            kind: 'coupon',
            funder: 'merchant',
            priority: 1,
            threshold: { currency: 'CNY', minorUnits: '0' },
            amount: { currency: 'CNY', minorUnits: '1000' },
          },
        ],
      },
    });
    expect(scenario.statusCode).toBe(200);
    const calculated = await first.inject({
      method: 'POST',
      url: `/api/v1/promotion-scenarios/${scenario.json().id as string}/calculate`,
      payload: {
        rows: [{ skuId, campaignPrice: { currency: 'CNY', minorUnits: '10000' } }],
      },
    });
    expect(calculated.statusCode).toBe(200);
    expect(calculated.json()).toMatchObject({
      rows: [
        {
          skuId,
          status: 'incomplete',
          simulation: { financial: null, breakEvenCampaignPrice: null },
        },
      ],
    });
    const snapshotHash = calculated.json().scenario.ruleSnapshotHash as string;
    expect(calculated.json().rows[0].simulation.ruleSnapshotHash).toBe(snapshotHash);
    await first.close();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const history = await restarted.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/promotion-scenarios`,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({
      items: [
        { scenario: { ruleSnapshotHash: snapshotHash }, results: [{ status: 'incomplete' }] },
      ],
    });
    await restarted.close();
  });
});
