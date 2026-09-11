import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

test('fails once, reloads, explicitly resumes, and reuses completed workflow nodes', async ({
  page,
  request,
}) => {
  const productResponse = await request.post('/api/v1/products', {
    data: { name: `Phase 10 工作流验收-${Date.now()}` },
  });
  expect(productResponse.status(), await productResponse.text()).toBe(201);
  const product = (await productResponse.json()) as { id: string };

  const previewResponse = await request.post(
    `/api/v1/products/${product.id}/competitors/import/preview`,
    {
      data: {
        format: 'csv',
        sourceName: 'phase-10.csv',
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

  await page.goto(`/products/${product.id}/plans`);
  await expect(page.getByRole('heading', { name: '运营方案', exact: true })).toBeVisible();
  await expect(page.getByTestId('workflow-node')).toHaveCount(6);
  await page.getByRole('button', { name: '启动工作流' }).click();

  await expect(page.getByText('UNEXPECTED_ERROR：Workflow node execution failed.')).toBeVisible();
  const failedNodes = page.getByTestId('workflow-node');
  for (let index = 0; index < 4; index += 1) {
    await expect(failedNodes.nth(index)).toContainText('已完成');
  }
  await expect(failedNodes.nth(4)).toContainText('失败');
  await expect(failedNodes.nth(5)).toContainText('未开始');

  await page.reload();
  await expect(page.getByRole('button', { name: '恢复工作流' })).toBeVisible();
  await page.getByRole('button', { name: '恢复工作流' }).click();
  await expect(page.getByText('工作流已完成')).toBeVisible();
  for (const node of await page.getByTestId('workflow-node').all()) {
    await expect(node).toContainText('输出修订');
    await expect(node).not.toContainText('失败');
    await expect(node).not.toContainText('未开始');
  }

  const callLogPath = process.env.EAW_E2E_CALL_LOG;
  expect(callLogPath).toBeTruthy();
  await expect.poll(async () => (await providerCalls(callLogPath!, product.id)).length).toBe(7);
  const calls = (await providerCalls(callLogPath!, product.id)).map(({ task }) => task);
  expect(calls).toEqual([
    'competitor_analysis',
    'market_insight',
    'selling_point_set',
    'title_generation',
    'creative_plan',
    'creative_plan',
    'detail_page',
  ]);
});

async function providerCalls(path: string, productId: string) {
  return (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { task: string; productId: string })
    .filter((call) => call.productId === productId);
}
