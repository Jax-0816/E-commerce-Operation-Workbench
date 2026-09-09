import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import type { AIProvider } from '@eaw/ai-engine';
import {
  openDatabase,
  SqliteOperationPlanRepository,
  SqliteWorkflowRepository,
} from '@eaw/database';
import { createOperationPlanRevision, createUuidV7, lockOperationPlanRevision } from '@eaw/domain';

import { createProductionApp } from './runtime.js';

const directories: string[] = [];
const migrationsDirectory = fileURLToPath(new URL('../../../migrations/', import.meta.url));

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('production app composition', () => {
  it('serves identical locked operation-plan sources after restart without provider calls', async () => {
    const workspacePath = await realpath(
      await mkdtemp(join(tmpdir(), 'eaw-server-operation-plan-')),
    );
    directories.push(workspacePath);
    let providerCalls = 0;
    const providerFactory = (): AIProvider => ({
      id: 'unused',
      async generate() {
        providerCalls += 1;
        throw new Error('Provider must stay unused.');
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
    const productId = (
      await first.inject({ method: 'POST', url: '/api/v1/products', payload: { name: '方案商品' } })
    ).json().id;
    await first.close();

    const database = openDatabase(join(workspacePath, 'database/workbench.sqlite'));
    const plans = new SqliteOperationPlanRepository(database);
    const id = createUuidV7();
    const nodeKeys = [
      'competitor_analysis',
      'market_insight',
      'selling_points',
      'titles',
      'creative',
      'detail_page',
    ] as const;
    const assetTypes = [
      'competitor_analysis',
      'market_insight',
      'selling_point_set',
      'title_asset',
      'creative_plan',
      'detail_page',
    ] as const;
    const draft = createOperationPlanRevision({
      id,
      lineageId: id,
      productId,
      platformId: 'pinduoduo',
      revisionNo: 1,
      status: 'draft',
      lockedAt: null,
      sources: {
        workflowRunId: createUuidV7(),
        workflowRunRevision: 9,
        nodes: nodeKeys.map((nodeKey, index) => ({
          nodeKey,
          assetType: assetTypes[index]!,
          assetId: createUuidV7(),
          revisionNo: 1,
          dependencyHash: 'a'.repeat(64),
        })),
        competitorSnapshotIds: [createUuidV7()],
        pricing: {
          resultId: createUuidV7(),
          scenarioId: createUuidV7(),
          skuId: createUuidV7(),
          costProfileId: createUuidV7(),
          costProfileRevisionNo: 1,
        },
        promotion: null,
      },
      sourceHash: 'b'.repeat(64),
      blockers: [],
      supersedesRevisionId: null,
      createdAt: new Date('2026-09-09T03:00:00.000Z'),
    });
    await plans.append(draft, null);
    const locked = lockOperationPlanRevision(
      draft,
      createUuidV7(),
      new Date('2026-09-09T03:01:00.000Z'),
    );
    await plans.append(locked, 1);
    database.close();

    const restarted = await createProductionApp({
      migrationsDirectory,
      workspacePath,
      providerFactory,
    });
    const response = await restarted.inject({
      method: 'GET',
      url: `/api/v1/operation-plans/${locked.id}`,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      id: locked.id,
      status: 'locked',
      sources: locked.sources,
    });
    expect(providerCalls).toBe(0);
    await restarted.close();
  });

  it('wires workflow APIs and recovers a persisted running node without executing it', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-workflow-')));
    directories.push(workspacePath);
    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const productId = (
      await first.inject({ method: 'POST', url: '/api/v1/products', payload: { name: '恢复商品' } })
    ).json().id as ReturnType<typeof createUuidV7>;
    await first.close();

    const database = openDatabase(join(workspacePath, 'database/workbench.sqlite'));
    const repository = new SqliteWorkflowRepository(database);
    const runId = createUuidV7();
    await repository.create({
      id: runId,
      productId,
      platformId: 'taobao',
      definition: {
        definitionId: 'product_content',
        version: '1.0.0',
        nodes: [
          { key: 'competitor_analysis', taskType: 'competitor_analysis', dependsOn: [], order: 1 },
        ],
      },
      createdAt: new Date('2026-09-08T10:00:00.000Z'),
    });
    const running = await repository.markRunning(runId, 1);
    await repository.claimNode(runId, 'competitor_analysis', 'a'.repeat(64), running.revision);
    database.close();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const recovered = await restarted.inject({ method: 'GET', url: `/api/v1/workflows/${runId}` });
    expect(recovered.statusCode, recovered.body).toBe(200);
    expect(recovered.json()).toMatchObject({
      id: runId,
      productId,
      status: 'interrupted',
      cancellationRequested: false,
      nodes: [
        {
          key: 'competitor_analysis',
          status: 'failed',
          error: { code: 'WORKFLOW_INTERRUPTED' },
        },
      ],
    });
    await restarted.close();
  });

  it('restarts inertly and resumes only the failed creative node plus its remaining successor', async () => {
    const workspacePath = await realpath(
      await mkdtemp(join(tmpdir(), 'eaw-server-workflow-resume-')),
    );
    directories.push(workspacePath);
    const taskSequence = [
      'competitor_analysis',
      'market_insight',
      'selling_point_set',
      'title_generation',
      'creative_plan',
      'creative_plan',
      'detail_page',
    ] as const;
    const calls: Record<(typeof taskSequence)[number], number> = {
      competitor_analysis: 0,
      market_insight: 0,
      selling_point_set: 0,
      title_generation: 0,
      creative_plan: 0,
      detail_page: 0,
    };
    let callIndex = 0;
    let productId = '';
    const providerFactory = (): AIProvider => ({
      id: 'workflow-fake',
      async generate(request) {
        const task = taskSequence[callIndex++];
        if (!task) throw new Error('Unexpected workflow generation call.');
        calls[task] += 1;
        if (task === 'creative_plan' && calls.creative_plan === 1) {
          throw new Error('One intentional creative failure.');
        }
        return {
          provider: 'workflow-fake',
          responseId: `response-${callIndex}`,
          model: 'workflow-fake',
          content: JSON.stringify(
            workflowOutput(
              task,
              productId,
              request.messages.map(({ content }) => content).join('\n'),
            ),
          ),
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
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
      await first.inject({ method: 'POST', url: '/api/v1/products', payload: { name: '续跑商品' } })
    ).json().id as string;
    await first.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { apiKey: 'fake-secret' },
    });
    const started = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/workflows`,
      payload: { platformId: 'taobao', definitionId: 'product_content' },
    });
    expect(started.statusCode, started.body).toBe(202);
    const runId = started.json().id as string;
    const failed = await waitForWorkflowStatus(first, runId, 'failed');
    expect(Object.values(calls)).toEqual([1, 1, 1, 1, 1, 0]);
    await first.close();

    const beforeRestart = { ...calls };
    const restarted = await createProductionApp({
      migrationsDirectory,
      workspacePath,
      providerFactory,
    });
    expect(calls).toEqual(beforeRestart);
    const resume = await restarted.inject({
      method: 'POST',
      url: `/api/v1/workflows/${runId}/resume`,
      payload: { expectedRevision: failed.revision },
    });
    expect(resume.statusCode, resume.body).toBe(202);
    await waitForWorkflowStatus(restarted, runId, 'completed');
    expect(
      Object.entries(calls).map(
        ([task, count]) => count - beforeRestart[task as keyof typeof calls],
      ),
    ).toEqual([0, 0, 0, 0, 1, 1]);
    await restarted.close();
  });

  it('generates and persists evidence-backed strategy revisions with a fake provider', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-strategy-')));
    directories.push(workspacePath);
    let productId = '';
    let snapshotId = '';
    const providerFactory = (): AIProvider => ({
      id: 'fake',
      async generate(request) {
        const titleRequest = request.messages.some(({ content }) => content.includes('四类标题'));
        return {
          provider: 'fake',
          responseId: 'fake-response',
          model: 'fake',
          content: JSON.stringify(
            titleRequest
              ? {
                  productId,
                  titles: ['recommended', 'search', 'selling_point', 'scenario'].map((variant) => ({
                    variant,
                    text: `${variant} 保温杯`,
                    keywords: ['保温杯'],
                    claims: [],
                    reviewTerms: [],
                  })),
                }
              : {
                  productId,
                  conclusions: [
                    {
                      summary: '竞品销量展示为下界',
                      evidenceRefs: [{ kind: 'competitor_snapshot', id: snapshotId, productId }],
                    },
                  ],
                  limitations: ['仅基于导入快照'],
                },
          ),
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
    const title = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/titles/generate?platformId=pinduoduo`,
    });
    expect(title.statusCode, title.body).toBe(200);
    expect(title.json()).toMatchObject({
      revision: {
        revisionNo: 1,
        status: 'verified',
      },
    });
    expect(title.json().revision.titles[0]).toMatchObject({ variant: 'recommended' });
    const regenerated = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/titles/generate?platformId=pinduoduo`,
    });
    expect(regenerated.statusCode, regenerated.body).toBe(200);
    expect(regenerated.json()).toMatchObject({
      revision: { revisionNo: 2, supersedesRevisionId: title.json().revision.id },
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
    const titleHistory = await restarted.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/titles?platformId=pinduoduo`,
    });
    expect(titleHistory.json().items).toHaveLength(2);
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

  it('persists creative and detail revisions generated by a fake provider', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-content-builders-')));
    directories.push(workspacePath);
    const providerFactory = (): AIProvider => ({
      id: 'fake',
      async generate(request) {
        const text = request.messages.map(({ content }) => content).join('\n');
        const marker = '[TRUST=RULE KEY=content_request]\n';
        const requestJson = text.slice(text.indexOf(marker) + marker.length).split('\n')[0]!;
        const contentRequest = JSON.parse(requestJson) as {
          readonly productId: string;
          readonly itemIds?: readonly string[];
          readonly sectionIds?: readonly string[];
        };
        const productId = contentRequest.productId;
        const content = text.includes('详情页架构助手')
          ? {
              productId,
              sections: contentRequest.sectionIds!.map((id, index) => ({
                id,
                order: index + 1,
                kind: index === 0 ? 'hero' : 'benefit',
                headline: `区块 ${index + 1}`,
                body: '基于商品信息规划的区块',
                evidenceRefs: [],
                reviewTerms: [],
                locked: false,
              })),
            }
          : {
              productId,
              items: contentRequest.itemIds!.map((id, index) => ({
                id,
                order: index + 1,
                role: index === 0 ? 'hero' : 'supporting',
                headline: `图片 ${index + 1}`,
                body: '画面说明',
                promptZh: '中文提示',
                promptEn: 'English prompt',
                negativePromptZh: '中文负面',
                negativePromptEn: 'English negative',
                evidenceRefs: [],
                reviewTerms: [],
                locked: false,
              })),
            };
        return {
          provider: 'fake',
          responseId: 'response',
          model: 'fake',
          content: JSON.stringify(content),
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
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
    const productId = (
      await first.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: { name: '创意保温杯' },
      })
    ).json().id as string;
    await first.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { apiKey: 'fake-secret' },
    });
    const creative = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/creative/generate?platformId=pinduoduo`,
    });
    const detail = await first.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/detail/generate?platformId=pinduoduo`,
    });
    expect(creative.statusCode, creative.body).toBe(200);
    expect(creative.json().revision.items).toHaveLength(5);
    expect(detail.statusCode, detail.body).toBe(200);
    await first.close();
    const restarted = await createProductionApp({
      migrationsDirectory,
      workspacePath,
      providerFactory,
    });
    expect(
      (
        await restarted.inject({
          method: 'GET',
          url: `/api/v1/products/${productId}/creative?platformId=pinduoduo`,
        })
      ).json().items,
    ).toHaveLength(1);
    expect(
      (
        await restarted.inject({
          method: 'GET',
          url: `/api/v1/products/${productId}/detail?platformId=pinduoduo`,
        })
      ).json().items,
    ).toHaveLength(1);
    await restarted.close();
  });
});

async function waitForWorkflowStatus(
  app: Awaited<ReturnType<typeof createProductionApp>>,
  runId: string,
  status: string,
): Promise<{ readonly revision: number }> {
  let latest: { status?: string; revision?: number; nodes?: unknown } = {};
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const response = await app.inject({ method: 'GET', url: `/api/v1/workflows/${runId}` });
    const body = response.json() as { status?: string; revision?: number };
    latest = body;
    if (body.status === status && body.revision !== undefined) return { revision: body.revision };
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Workflow did not reach ${status}: ${JSON.stringify(latest)}`);
}

function workflowOutput(task: string, productId: string, prompt: string): unknown {
  if (task === 'competitor_analysis') return { productId, conclusions: [], limitations: [] };
  if (task === 'market_insight') return { productId, insights: [], limitations: [] };
  if (task === 'selling_point_set') {
    return { productId, sellingPoints: [], suggestedFacts: [], limitations: [] };
  }
  if (task === 'title_generation') {
    return {
      productId,
      titles: ['recommended', 'search', 'selling_point', 'scenario'].map((variant) => ({
        variant,
        text: `${variant} 商品标题`,
        keywords: ['商品'],
        claims: [],
        reviewTerms: [],
      })),
    };
  }
  const count = task === 'creative_plan' ? 5 : 7;
  const ids = requestedIds(prompt, task === 'creative_plan' ? 'itemIds' : 'sectionIds', count);
  if (task === 'creative_plan') {
    return {
      productId,
      items: ids.map((id, index) => ({
        id,
        order: index + 1,
        role: index === 0 ? 'hero' : 'supporting',
        headline: `图片 ${index + 1}`,
        body: '画面说明',
        promptZh: '中文提示',
        promptEn: 'English prompt',
        negativePromptZh: '中文负面',
        negativePromptEn: 'English negative',
        evidenceRefs: [],
        reviewTerms: [],
        locked: false,
      })),
    };
  }
  const kinds = ['hero', 'benefit', 'specification', 'scenario', 'trust', 'faq', 'call_to_action'];
  return {
    productId,
    sections: ids.map((id, index) => ({
      id,
      order: index + 1,
      kind: kinds[index],
      headline: `模块 ${index + 1}`,
      body: '详情说明',
      evidenceRefs: [],
      reviewTerms: [],
      locked: false,
    })),
  };
}

function requestedIds(prompt: string, key: string, count: number): readonly string[] {
  const start = prompt.lastIndexOf(`"${key}"`);
  const values =
    start < 0
      ? []
      : (prompt
          .slice(start)
          .match(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gu) ?? []);
  if (values.length < count) throw new Error(`Prompt omitted ${key}.`);
  return values.slice(0, count);
}
