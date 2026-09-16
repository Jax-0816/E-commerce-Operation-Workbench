import { expect, test } from '@playwright/test';

test('creates a product and completes the visible Phase 2 workflow', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const requests: string[] = [];
  const mutatingRequests: string[] = [];
  page.on('request', (request) => {
    requests.push(request.url());
    if (request.method() !== 'GET') mutatingRequests.push(`${request.method()} ${request.url()}`);
  });
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
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '新建商品' })
    .click();
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
  await expect(page.getByRole('rowheader', { name: '500ml / 黑色' })).toBeVisible();

  await page.getByRole('link', { name: '平台档案' }).click();
  await expect(page.getByRole('region', { name: '平台能力' })).toContainText('待规则验证');
  await page.getByLabel('类目编码').fill('pdd-100');
  await page.getByLabel('类目名称').fill('杯具');
  await page.getByLabel('平台标题').fill('拼多多保温杯标题');
  await page.getByLabel('保存平台档案').click();
  await page.getByLabel('当前平台').selectOption('taobao');
  await expect(page).toHaveURL(/platform=taobao/u);
  await expect(page.getByLabel('平台标题')).toHaveValue('');
  const capabilities = page.getByRole('region', { name: '平台能力' });
  await expect(capabilities).toContainText('淘宝/天猫能力边界');
  await expect(capabilities).toContainText('通用能力');
  await expect(capabilities).toContainText('当前平台此能力尚未完整实现。');
  await expect(capabilities).not.toContainText('利润');
  expect(requests.some((url) => /\/api\/v1\/(?:ai|generations?)/u.test(url))).toBe(false);

  const productId = new URL(page.url()).pathname.split('/')[2];
  expect(productId).toBeTruthy();
  for (const width of [1440, 720, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/products/${productId}/facts`);
    await expect(page.getByRole('heading', { name: '商品事实', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: '商品库', exact: true })).toBeVisible();
    await expect(page.locator('#workspace-main')).toBeVisible();
    await expectDocumentToFitViewport(page);

    if (width === 390) {
      const factTableRegion = page.getByRole('region', { name: '商品事实表格' });
      await expect(factTableRegion).toBeVisible();
      const tableOverflow = await factTableRegion.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(tableOverflow.scrollWidth).toBeGreaterThan(tableOverflow.clientWidth);
      await factTableRegion.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      expect(await factTableRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expectDocumentToFitViewport(page);
    }

    await page.goto('/capabilities/settings');
    await expect(page.getByRole('heading', { name: '系统设置', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: '管理 AI 设置' })).toBeVisible();
    await expect(page.getByRole('link', { name: '管理平台规则' })).toBeVisible();
    await expect(page.getByRole('link', { name: '备份与恢复' })).toBeVisible();
    await expectDocumentToFitViewport(page);
  }

  await page.goto('/');
  const mutationCount = mutatingRequests.length;
  await page.context().setOffline(true);
  await expect(
    page.getByText('当前离线：联网 AI 操作已暂停，本地数据与财务功能仍可使用。'),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(
    page.getByText('当前离线：联网 AI 操作已暂停，本地数据与财务功能仍可使用。'),
  ).toHaveCount(0);
  expect(mutatingRequests).toHaveLength(mutationCount);
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: '跳到主要内容' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace-main')).toBeFocused();
  await page.getByRole('link', { name: '商品库', exact: true }).click();
  await expect(page.locator('#workspace-main')).toBeFocused();

  expect(errors).toEqual([]);
});

async function expectDocumentToFitViewport(page: import('@playwright/test').Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
