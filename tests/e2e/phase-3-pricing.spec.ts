import { expect, test } from '@playwright/test';

test('saves SKU costs and produces a traceable immutable pricing result', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('response', (response) => {
    const expectedEmptyCost = response.status() === 404 && response.url().endsWith('/cost-profile');
    if (response.status() >= 400 && !expectedEmptyCost) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  const productResponse = await request.post('/api/v1/products', {
    data: { name: `Phase 3 定价验收-${Date.now()}` },
  });
  expect(productResponse.status(), await productResponse.text()).toBe(201);
  const product = (await productResponse.json()) as { id: string };
  const skuResponse = await request.put(`/api/v1/products/${product.id}/skus`, {
    data: { dimensions: [{ name: '规格', values: ['默认'] }] },
  });
  expect(skuResponse.ok(), await skuResponse.text()).toBe(true);

  await page.goto(`/products/${product.id}/costs`);
  await expect(page.getByRole('heading', { name: '成本中心' })).toBeVisible();
  await page.getByRole('button', { name: '添加成本项' }).click();
  await page.getByLabel('名称').fill('材料');
  await page.getByLabel('唯一键').fill('materials');
  await page.getByLabel('材料 金额（分）').fill('2200');
  await page.getByLabel('保存成本档案').click();
  await expect(page.getByRole('status')).toContainText('成本档案已保存');
  await expect(page.getByText('第 1 版')).toBeVisible();

  await page.getByRole('link', { name: '定价', exact: true }).click();
  await page.getByLabel('执行定价计算').click();
  const output = page.locator('.pricing-output');
  await expect(output.getByText('已验证', { exact: true })).toBeVisible();
  await expect(output.locator('.price-hero').getByText('¥32.00', { exact: true })).toBeVisible();
  await expect(
    output.getByText('净利润', { exact: true }).locator('..').getByText('¥10.00', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('不可变计算历史')).toBeVisible();
  await expect(page.getByText('目标单件利润', { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/计算轨迹/u)).toBeVisible();

  expect(errors).toEqual([]);
});
