import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const competitorFixture = fileURLToPath(
  new URL('./fixtures/competitors/golden-path.csv', import.meta.url),
);
const verifiedRuleFixture = fileURLToPath(
  new URL('./fixtures/rules/verified-pinduoduo.json', import.meta.url),
);

test('completes the canonical workbench path and locks exact sources', async ({
  page,
  request,
}) => {
  const sourceWorkspacePath = process.env.EAW_E2E_SOURCE_WORKSPACE_PATH;
  expect(sourceWorkspacePath).toBeTruthy();
  expect(sourceWorkspacePath).toContain(' ');
  expect(sourceWorkspacePath).toMatch(/[^\x00-\x7f]/u);
  const browserErrors: string[] = [];
  const publicRequests: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      publicRequests.push(`${browserRequest.method()} ${browserRequest.url()}`);
    }
  });

  await page.goto('/products/new');
  await page.getByRole('button', { name: /手工创建/u }).click();
  await page.getByLabel('商品名称').fill(`Task 29 黄金路径保温杯-${Date.now()}`);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '创建商品并进入工作区' }).click();
  await expect(page).toHaveURL(/\/products\/[^/]+\/facts$/u);
  const productId = new URL(page.url()).pathname.split('/')[2]!;

  await page.getByRole('button', { name: '添加事实' }).click();
  await page.getByLabel('事实键').fill('material');
  await page.getByLabel('事实名称').fill('杯身材质');
  await page.getByLabel('事实值').fill('304 不锈钢');
  await page.getByRole('button', { name: '保存事实' }).click();
  await page.getByLabel('确认依据 杯身材质').fill('supplier:task-29-certificate');
  await page.getByLabel('确认 杯身材质').click();
  await expect(page.getByRole('row', { name: /杯身材质/u })).toContainText('已确认');

  await productLink(page, 'SKU').click();
  await page.getByLabel('规格配置').fill('容量=500ml');
  await page.getByLabel('生成 SKU 矩阵').click();
  await expect(page.getByRole('rowheader', { name: '500ml' })).toBeVisible();

  await productLink(page, '成本').click();
  await page.getByRole('button', { name: '添加成本项' }).click();
  await page.getByLabel('名称').fill('材料');
  await page.getByLabel('唯一键').fill('materials');
  await page.getByLabel('材料 金额（分）').fill('2200');
  await page.getByLabel('保存成本档案').click();
  await expect(page.getByRole('status')).toContainText('成本档案已保存');

  await productLink(page, '竞品').click();
  await page.getByLabel('选择竞品文件').setInputFiles(competitorFixture);
  await expect(page.getByRole('status')).toContainText('预览通过：1 条');
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByRole('status')).toContainText('导入已确认，快照已锁定');
  await expect(page.getByRole('row', { name: /竞品 A/u }).last()).toContainText('10万+');

  await page.goto('/capabilities/ai');
  await page.getByLabel('DeepSeek API Key').fill('deterministic-e2e-secret');
  await page.getByLabel('保存 DeepSeek 设置').click();
  await expect(page.getByRole('status')).toContainText('设置已保存');
  await expect(page.getByRole('region', { name: 'DeepSeek 设置' })).toContainText('已配置');
  await expect(page.locator('body')).not.toContainText('deterministic-e2e-secret');

  await page.goto('/capabilities/rules');
  const bundledPack = page.getByRole('article').filter({ hasText: '2026.9.0' });
  await expect(bundledPack).toBeVisible();
  await bundledPack.getByRole('button', { name: '启用 2026.9.0' }).click();
  await expect(bundledPack).toContainText('当前启用');
  await page.getByLabel('选择规则包文件').setInputFiles(verifiedRuleFixture);
  await page.getByLabel('导入规则包').click();
  const verifiedPack = page.getByRole('article').filter({ hasText: '2026.9.1' });
  await expect(verifiedPack).toContainText('EAW deterministic E2E fixture');
  await verifiedPack.getByRole('button', { name: '启用 2026.9.1' }).click();
  await expect(verifiedPack).toContainText('当前启用');

  await page.goto(`/products/${productId}/plans`);
  await page.getByRole('button', { name: '启动工作流' }).click();
  await expect(page.getByText('UNEXPECTED_ERROR：Workflow node execution failed.')).toBeVisible();
  const failedNodes = page.getByTestId('workflow-node');
  for (let index = 0; index < 4; index += 1) {
    await expect(failedNodes.nth(index)).toContainText('已完成');
  }
  await expect(failedNodes.nth(4)).toContainText('失败');

  const callLogPath = process.env.EAW_E2E_CALL_LOG;
  expect(callLogPath).toBeTruthy();
  expect(await readFile(callLogPath!, 'utf8')).not.toContain('deterministic-e2e-secret');
  expect(await providerTasks(callLogPath!, productId)).toEqual([
    'competitor_analysis',
    'market_insight',
    'selling_point_set',
    'title_generation',
    'creative_plan',
  ]);

  await page.reload();
  await page.getByRole('button', { name: '恢复工作流' }).click();
  await expect(page.getByText('工作流已完成')).toBeVisible();
  expect(await providerTasks(callLogPath!, productId)).toEqual([
    'competitor_analysis',
    'market_insight',
    'selling_point_set',
    'title_generation',
    'creative_plan',
    'creative_plan',
    'detail_page',
  ]);

  await productLink(page, '标题').click();
  await page.getByRole('button', { name: '锁定当前修订' }).click();
  await expect(page.getByText(/已锁定/u).first()).toBeVisible();

  await productLink(page, '运营方案').click();
  await startNewWorkflow(page, request, productId);

  await productLink(page, '视觉').click();
  await lockEveryVisible(page, '锁定此项', 5);

  await productLink(page, '详情页').click();
  await lockEveryVisible(page, '锁定区块', 7);

  await productLink(page, '运营方案').click();
  await startNewWorkflow(page, request, productId);

  await productLink(page, '定价').click();
  await page.getByLabel('执行定价计算').click();
  await expect(page.locator('.pricing-output').getByText('已验证', { exact: true })).toBeVisible();
  await expect(page.getByText(/计算轨迹/u)).toBeVisible();

  await productLink(page, '活动').click();
  await page.getByLabel('运行活动批算').click();
  await expect(page.getByRole('region', { name: '拼多多活动模拟' })).toContainText('计算过程');
  await expect(page.getByRole('region', { name: '拼多多活动模拟' })).toContainText('已验证');
  await expect(page.getByRole('region', { name: '活动模拟历史' })).not.toContainText(
    '暂无活动模拟',
  );

  await productLink(page, '运营方案').click();
  await selectNewestOption(page, '工作流来源');
  await selectNewestOption(page, '定价来源');
  await selectNewestOption(page, '活动来源');
  await page.getByRole('button', { name: '创建草稿' }).click();
  await expect(page.getByRole('status').filter({ hasText: '可以显式锁定' })).toBeVisible();
  await page.getByRole('button', { name: '锁定当前修订' }).click();
  await expect(page.getByRole('status')).toContainText('历史来源保持不可变');

  const lockedBeforeRestart = await latestPlan(request, productId);
  expect(lockedBeforeRestart.status).toBe('locked');
  expect(lockedBeforeRestart.sources.promotion).not.toBeNull();
  expect(lockedBeforeRestart.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(lockedBeforeRestart.sources.nodes).toHaveLength(6);
  expect(lockedBeforeRestart.sources.competitorSnapshotIds).toHaveLength(1);

  await page.reload();
  await expect(page.getByText(/已锁定 · 修订/u).first()).toBeVisible();
  const lockedAfterReload = await latestPlan(request, productId);
  expect(lockedAfterReload.sources).toEqual(lockedBeforeRestart.sources);
  expect(lockedAfterReload.sourceHash).toBe(lockedBeforeRestart.sourceHash);

  await page.goto('/capabilities/data');
  await restartCurrentServer(request);
  await page.goto(`/products/${productId}/plans`);
  await expect(page.getByText(/已锁定 · 修订/u).first()).toBeVisible();
  const lockedAfterRestart = await latestPlan(request, productId);
  expect(lockedAfterRestart.sources).toEqual(lockedBeforeRestart.sources);
  expect(lockedAfterRestart.sourceHash).toBe(lockedBeforeRestart.sourceHash);

  expect(browserErrors).toEqual([]);
  expect(publicRequests).toEqual([]);
});

function productLink(page: Page, name: string) {
  return page.getByRole('navigation', { name: '商品导航' }).getByRole('link', {
    name,
    exact: true,
  });
}

async function lockEveryVisible(page: Page, label: string, expected: number): Promise<void> {
  const locked = page.getByRole('button', { name: '已锁定', exact: true });
  for (let count = 1; count <= expected; count += 1) {
    await page.getByRole('button', { name: label, exact: true }).first().click();
    await expect(locked).toHaveCount(count);
  }
}

async function selectNewestOption(page: Page, label: string): Promise<void> {
  const select = page.getByLabel(label);
  await expect(select.locator('option')).not.toHaveCount(1);
  await select.selectOption({ index: 1 });
}

async function startNewWorkflow(
  page: Page,
  request: APIRequestContext,
  productId: string,
): Promise<void> {
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(`/api/v1/products/${productId}/workflows`),
  );
  await page.getByRole('button', { name: '启动新工作流' }).click();
  const response = await started;
  expect(response.status(), await response.text()).toBe(202);
  const runId = ((await response.json()) as { readonly id: string }).id;
  await expect
    .poll(async () => {
      const current = await request.get(`/api/v1/workflows/${runId}`);
      return ((await current.json()) as { readonly status: string }).status;
    })
    .toBe('completed');
  await page.reload();
  await expect(page.getByText('工作流已完成')).toBeVisible();
}

interface PlanView {
  readonly status: string;
  readonly sourceHash: string;
  readonly sources: {
    readonly competitorSnapshotIds: readonly string[];
    readonly nodes: readonly unknown[];
    readonly promotion: unknown | null;
    readonly [key: string]: unknown;
  };
}

async function latestPlan(request: APIRequestContext, productId: string): Promise<PlanView> {
  const response = await request.get(`/api/v1/products/${productId}/operation-plans`);
  expect(response.ok(), await response.text()).toBe(true);
  const plans = ((await response.json()) as { items: readonly PlanView[] }).items;
  expect(plans.length).toBeGreaterThan(0);
  return plans[0]!;
}

async function providerTasks(path: string, productId: string): Promise<readonly string[]> {
  return (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { readonly productId: string; readonly task: string })
    .filter((entry) => entry.productId === productId)
    .map(({ task }) => task);
}

async function restartCurrentServer(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/e2e/restart', { data: { workspace: 'current' } });
  expect(response.status(), await response.text()).toBe(202);
  const generation = ((await response.json()) as { readonly generation: number }).generation;
  await expect
    .poll(
      async () => {
        try {
          const state = await request.get('/api/e2e/state');
          if (!state.ok()) return -1;
          return ((await state.json()) as { readonly generation: number }).generation;
        } catch {
          return -1;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(generation);
}
