import { readFile } from 'node:fs/promises';

import { expect, test, type APIRequestContext } from '@playwright/test';

test('creates a blocked draft, resolves exact sources, locks, and reloads immutable history', async ({
  page,
  request,
}) => {
  const productResponse = await request.post('/api/v1/products', {
    data: { name: `Phase 11 运营方案验收-${Date.now()}` },
  });
  expect(productResponse.status(), await productResponse.text()).toBe(201);
  const product = (await productResponse.json()) as { id: string };

  const previewResponse = await request.post(
    `/api/v1/products/${product.id}/competitors/import/preview`,
    {
      data: {
        format: 'csv',
        sourceName: 'phase-11.csv',
        content: 'name,price,sales\n竞品 A,¥99,10万+',
      },
    },
  );
  expect(previewResponse.ok(), await previewResponse.text()).toBe(true);
  const preview = await previewResponse.json();
  const confirmResponse = await request.post(
    `/api/v1/products/${product.id}/competitors/import/confirm`,
    {
      data: {
        previewProductId: preview.productId,
        format: preview.format,
        sourceName: preview.sourceName,
        rows: preview.rows,
      },
    },
  );
  expect(confirmResponse.ok(), await confirmResponse.text()).toBe(true);

  const settingsResponse = await request.put('/api/v1/ai/settings', {
    data: { apiKey: 'deterministic-e2e-secret' },
  });
  expect(settingsResponse.ok(), await settingsResponse.text()).toBe(true);

  const factResponse = await request.post(`/api/v1/products/${product.id}/facts`, {
    data: {
      key: 'material',
      label: '杯身材质',
      value: { type: 'text', value: '304 不锈钢' },
      unit: null,
      sourceType: 'manual',
      sourceRef: null,
      verification: 'unverified',
      sensitive: false,
      policyEligible: true,
    },
  });
  expect(factResponse.status(), await factResponse.text()).toBe(201);
  const fact = (await factResponse.json()) as { id: string; updatedAt: string };
  const confirmFactResponse = await request.post(
    `/api/v1/products/${product.id}/facts/${fact.id}/confirm`,
    {
      data: {
        expectedUpdatedAt: fact.updatedAt,
        actorRef: 'phase-11-e2e',
        evidenceRef: 'supplier:phase-11',
      },
    },
  );
  expect(confirmFactResponse.ok(), await confirmFactResponse.text()).toBe(true);

  const skuResponse = await request.put(`/api/v1/products/${product.id}/skus`, {
    data: { dimensions: [{ name: '规格', values: ['默认'] }] },
  });
  expect(skuResponse.ok(), await skuResponse.text()).toBe(true);
  const matrix = (await skuResponse.json()) as { skus: readonly { id: string }[] };
  const skuId = matrix.skus[0]!.id;
  const costResponse = await request.put(
    `/api/v1/products/${product.id}/skus/${skuId}/cost-profile`,
    {
      data: {
        currency: 'CNY',
        items: [
          {
            key: 'materials',
            label: '材料',
            kind: 'per_unit',
            classification: 'cost_of_goods',
            critical: true,
            status: 'confirmed',
            amountMinorUnits: '2200',
            allocationUnits: null,
            unitsPerOrder: null,
            rateBasisPoints: null,
            percentageBase: null,
            formula: null,
          },
        ],
      },
    },
  );
  expect(costResponse.ok(), await costResponse.text()).toBe(true);
  const pricingResponse = await request.post(
    `/api/v1/products/${product.id}/skus/${skuId}/pricing-calculations`,
    {
      data: {
        name: '目标单件利润',
        goal: { type: 'target_unit_profit', amountMinorUnits: '1000' },
        minimumMinorUnits: '0',
        maximumMinorUnits: '10000',
      },
    },
  );
  expect(pricingResponse.ok(), await pricingResponse.text()).toBe(true);
  const pricing = (await pricingResponse.json()) as { record: { id: string } };

  await page.goto(`/products/${product.id}/plans`);
  await page.getByRole('button', { name: '启动工作流' }).click();
  await expect(page.getByRole('button', { name: '恢复工作流' })).toBeVisible();
  await page.getByRole('button', { name: '恢复工作流' }).click();
  await expect(page.getByText('工作流已完成')).toBeVisible();

  await page.reload();
  const runsResponse = await request.get(`/api/v1/products/${product.id}/workflows`);
  const firstRun = ((await runsResponse.json()) as { items: readonly WorkflowView[] }).items[0]!;
  await page.getByLabel('工作流来源').selectOption(firstRun.id);
  await page.getByLabel('定价来源').selectOption(pricing.record.id);

  const callLogPath = process.env.EAW_E2E_CALL_LOG;
  expect(callLogPath).toBeTruthy();
  const beforeBlockedDraft = await providerCallCount(callLogPath!, product.id);
  await page.getByRole('button', { name: '创建草稿' }).click();
  await expect(page.getByRole('status').filter({ hasText: '存在 3 项阻塞' })).toBeVisible();
  await expect(page.getByRole('button', { name: '锁定当前修订' })).toBeDisabled();
  expect(await providerCallCount(callLogPath!, product.id)).toBe(beforeBlockedDraft);

  const blockedPlans = await operationPlans(request, product.id);
  const blocked = blockedPlans[0]!;
  await expect(
    page.getByText(blocked.sources.workflowRunId, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(blocked.sourceHash, { exact: true }).first()).toBeVisible();

  const titleLock = await request.post(
    `/api/v1/products/${product.id}/titles/lock?platformId=pinduoduo`,
  );
  expect(titleLock.ok(), await titleLock.text()).toBe(true);

  const secondRun = await startAndWaitForWorkflow(request, product.id);
  expect(secondRun.status).toBe('completed');
  await lockLatestContent(request, product.id);
  const finalRun = await startAndWaitForWorkflow(request, product.id);
  expect(finalRun.status).toBe('completed');

  await page.reload();
  await page.getByLabel('工作流来源').selectOption(finalRun.id);
  await page.getByLabel('定价来源').selectOption(pricing.record.id);
  const beforeFinalPlanMutations = await providerCallCount(callLogPath!, product.id);
  await page.getByRole('button', { name: '创建草稿' }).click();
  await expect(page.getByRole('status').filter({ hasText: '可以显式锁定' })).toBeVisible();
  await page.getByRole('button', { name: '锁定当前修订' }).click();
  await expect(page.getByRole('status').filter({ hasText: '历史来源保持不可变' })).toBeVisible();

  const lockedBeforeReload = (await operationPlans(request, product.id))[0]!;
  expect(lockedBeforeReload.status).toBe('locked');
  expect(lockedBeforeReload.sources.workflowRunId).toBe(finalRun.id);
  expect(await providerCallCount(callLogPath!, product.id)).toBe(beforeFinalPlanMutations);

  await page.reload();
  await expect(page.getByText('已锁定 · 修订 2')).toBeVisible();
  const lockedAfterReload = (await operationPlans(request, product.id))[0]!;
  expect(lockedAfterReload.sources).toEqual(lockedBeforeReload.sources);
  expect(lockedAfterReload.sourceHash).toBe(lockedBeforeReload.sourceHash);
  expect(await providerCallCount(callLogPath!, product.id)).toBe(beforeFinalPlanMutations);
});

interface WorkflowView {
  readonly id: string;
  readonly revision: number;
  readonly status: string;
}

interface OperationPlanView {
  readonly id: string;
  readonly status: string;
  readonly sourceHash: string;
  readonly sources: { readonly workflowRunId: string; readonly [key: string]: unknown };
}

async function startAndWaitForWorkflow(
  request: APIRequestContext,
  productId: string,
): Promise<WorkflowView> {
  const startedResponse = await request.post(`/api/v1/products/${productId}/workflows`, {
    data: { platformId: 'pinduoduo', definitionId: 'product_content' },
  });
  expect(startedResponse.status(), await startedResponse.text()).toBe(202);
  let run = (await startedResponse.json()) as WorkflowView;
  await expect
    .poll(async () => {
      const response = await request.get(`/api/v1/workflows/${run.id}`);
      run = (await response.json()) as WorkflowView;
      return run.status;
    })
    .toBe('completed');
  return run;
}

async function lockLatestContent(request: APIRequestContext, productId: string): Promise<void> {
  const creativeResponse = await request.get(
    `/api/v1/products/${productId}/creative?platformId=pinduoduo`,
  );
  expect(creativeResponse.ok(), await creativeResponse.text()).toBe(true);
  const creative = (await creativeResponse.json()) as {
    items: readonly { revision: { items: readonly { id: string }[] } }[];
  };
  for (const item of creative.items[0]!.revision.items) {
    const response = await request.post(
      `/api/v1/products/${productId}/creative/items/${item.id}/lock?platformId=pinduoduo`,
    );
    expect(response.ok(), await response.text()).toBe(true);
  }

  const detailResponse = await request.get(
    `/api/v1/products/${productId}/detail?platformId=pinduoduo`,
  );
  expect(detailResponse.ok(), await detailResponse.text()).toBe(true);
  const detail = (await detailResponse.json()) as {
    items: readonly { revision: { sections: readonly { id: string }[] } }[];
  };
  for (const section of detail.items[0]!.revision.sections) {
    const response = await request.post(
      `/api/v1/products/${productId}/detail/sections/${section.id}/lock?platformId=pinduoduo`,
    );
    expect(response.ok(), await response.text()).toBe(true);
  }
}

async function operationPlans(
  request: APIRequestContext,
  productId: string,
): Promise<readonly OperationPlanView[]> {
  const response = await request.get(`/api/v1/products/${productId}/operation-plans`);
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { items: readonly OperationPlanView[] }).items;
}

async function providerCallCount(path: string, productId: string): Promise<number> {
  const content = await readFile(path, 'utf8');
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { productId: string })
    .filter((call) => call.productId === productId).length;
}
