import { expect, test, type APIRequestContext } from '@playwright/test';

test('creates a secret-free backup and restores it transactionally into another workspace', async ({
  page,
  request,
}) => {
  const sourcePath = process.env.EAW_E2E_SOURCE_WORKSPACE_PATH;
  expect(sourcePath).toBeTruthy();
  const sourceSecret = 'phase-12-source-secret-never-in-backup';
  expect(
    (
      await request.put('/api/v1/ai/settings', {
        data: { apiKey: sourceSecret },
      })
    ).ok(),
  ).toBe(true);
  const sourceProduct = await createProduct(request, `Phase 12 备份商品-${Date.now()}`);

  await page.goto('/capabilities/data');
  await page.getByRole('button', { name: '创建新备份' }).click();
  await expect(page.getByRole('status')).toContainText('备份已创建');
  const backupsResponse = await request.get('/api/v1/data-management/backups');
  expect(backupsResponse.ok(), await backupsResponse.text()).toBe(true);
  const backup = (
    (await backupsResponse.json()) as {
      items: readonly { backupId: string; downloadUrl: string }[];
    }
  ).items[0]!;
  const download = await request.get(backup.downloadUrl);
  expect(download.ok(), await download.text()).toBe(true);
  const archive = await download.body();
  expect(archive.includes(Buffer.from(sourceSecret))).toBe(false);
  expect(archive.includes(Buffer.from(sourcePath!))).toBe(false);

  await restartServer(request, 'restore');
  const targetProduct = await createProduct(request, `Phase 12 目标旧商品-${Date.now()}`);
  await page.goto('/capabilities/data');
  const fileInput = page.getByLabel('选择备份 ZIP');
  await fileInput.setInputFiles({
    name: 'corrupt.eaw-backup.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('not-a-zip'),
  });
  await page.getByLabel('确认下次启动恢复').check();
  await page.getByRole('button', { name: '确认安排恢复' }).click();
  await expect(page.getByRole('alert')).toContainText('现有工作区未更改');
  expect(await productIds(request)).toContain(targetProduct.id);

  await fileInput.setInputFiles({
    name: `${backup.backupId}.eaw-backup.zip`,
    mimeType: 'application/zip',
    buffer: archive,
  });
  await page.getByLabel('确认下次启动恢复').check();
  await page.getByRole('button', { name: '确认安排恢复' }).click();
  await expect(page.getByRole('status')).toContainText('重启工作台后恢复');

  await restartServer(request, 'current');
  const restoredIds = await productIds(request);
  expect(restoredIds).toContain(sourceProduct.id);
  expect(restoredIds).not.toContain(targetProduct.id);
  await page.reload();
  await expect(page.getByText('最近恢复成功')).toBeVisible();
});

async function createProduct(
  request: APIRequestContext,
  name: string,
): Promise<{ readonly id: string }> {
  const response = await request.post('/api/v1/products', { data: { name } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<{ readonly id: string }>;
}

async function productIds(request: APIRequestContext): Promise<readonly string[]> {
  const response = await request.get('/api/v1/products');
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { items: readonly { id: string }[] }).items.map(
    ({ id }) => id,
  );
}

async function restartServer(
  request: APIRequestContext,
  workspace: 'restore' | 'current',
): Promise<void> {
  const response = await request.post('/api/e2e/restart', { data: { workspace } });
  expect(response.status(), await response.text()).toBe(202);
  const expectedGeneration = ((await response.json()) as { generation: number }).generation;
  await expect
    .poll(
      async () => {
        try {
          const state = await request.get('/api/e2e/state');
          if (!state.ok()) return 0;
          return ((await state.json()) as { generation: number }).generation;
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(expectedGeneration);
}
