import { expect, test } from '@playwright/test';

test('creates a product and completes the visible Phase 2 workflow', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('response', (response) => {
    const expectedMissingProfile =
      response.status() === 404 &&
      /\/platform-profiles\/(pinduoduo|taobao|douyin)$/u.test(response.url());
    if (response.status() >= 400 && !expectedMissingProfile) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('link', { name: '新建商品' }).click();
  await page.getByRole('button', { name: /手工创建/u }).click();
  await page
    .getByLabel('商品名称')
    .fill(`Phase 2 验收保温杯-${testInfo.repeatEachIndex}-${testInfo.workerIndex}`);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/v1/products'),
  );
  await page.getByRole('button', { name: '创建商品并进入工作区' }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  await expect(page).toHaveURL(/\/products\/[^/]+\/facts$/u);

  await page.getByRole('button', { name: '添加事实' }).click();
  await page.getByLabel('事实键').fill('material');
  await page.getByLabel('事实名称').fill('杯身材质');
  await page.getByLabel('事实值').fill('304 不锈钢');
  await page.getByRole('button', { name: '保存事实' }).click();
  await expect(page.getByRole('row', { name: /杯身材质/u })).toBeVisible();
  await page.getByLabel('确认依据 杯身材质').fill('supplier:certificate-1');
  await page.getByLabel('确认 杯身材质').click();
  await expect(page.getByRole('row', { name: /杯身材质/u })).toContainText('已确认');

  await page.getByRole('link', { name: 'SKU', exact: true }).click();
  await page.getByLabel('规格配置').fill('容量=500ml,750ml\n颜色=黑色,白色');
  await page.getByLabel('生成 SKU 矩阵').click();
  await expect(page.getByRole('cell', { name: '500ml / 黑色' })).toBeVisible();

  await page.getByRole('link', { name: '平台档案' }).click();
  await page.getByLabel('类目编码').fill('pdd-100');
  await page.getByLabel('类目名称').fill('杯具');
  await page.getByLabel('平台标题').fill('拼多多保温杯标题');
  await page.getByLabel('保存平台档案').click();
  await page.getByLabel('当前平台').selectOption('taobao');
  await expect(page).toHaveURL(/platform=taobao/u);
  await expect(page.getByLabel('平台标题')).toHaveValue('');

  expect(errors).toEqual([]);
});
