import { describe, expect, it, vi } from 'vitest';

import { createBrowserDataManagementApi } from './api.js';

const backupId = '019cdd2a-b800-7000-8000-000000000301';

describe('browser data management API', () => {
  it('uses same-origin JSON endpoints and sends restore files as raw ZIP bytes', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith('/backups') && init?.method === 'POST') return json(backup());
      if (path.endsWith('/backups')) return json({ items: [backup()] });
      if (path.endsWith('/restores')) return json(pending(), 202);
      return json({ state: 'idle' });
    });
    const api = createBrowserDataManagementApi(fetcher as typeof fetch);
    const file = new File(['PK'], 'workspace.zip', { type: 'application/zip' });

    await expect(api.listBackups()).resolves.toEqual([backup()]);
    await expect(api.createBackup()).resolves.toEqual(backup());
    await expect(api.stageRestore(file)).resolves.toEqual(pending());
    await expect(api.restoreStatus()).resolves.toEqual({ state: 'idle' });

    const restoreCall = fetcher.mock.calls.find(([url]) => String(url).endsWith('/restores'))!;
    expect(restoreCall[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: file,
    });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/v1/data-management/backups',
      '/api/v1/data-management/backups',
      '/api/v1/data-management/restores',
      '/api/v1/data-management/restore-status',
    ]);
  });

  it('rejects non-success responses without exposing server details', async () => {
    const api = createBrowserDataManagementApi(async () =>
      json({ error: { message: '/Users/private/secret' } }, 400),
    );
    const failure = await api.createBackup().catch((error) => Promise.resolve(error));
    expect(failure.message).toBe('数据管理操作失败');
    expect(failure.message).not.toContain('/Users/private');
  });
});

function backup() {
  return {
    appVersion: '0.1.0',
    backupId,
    createdAt: '2026-09-11T08:00:00.000Z',
    size: 2,
    downloadUrl: `/api/v1/data-management/backups/${backupId}/download`,
  };
}

function pending() {
  return {
    state: 'pending' as const,
    backupId,
    restoreId: '019cdd2a-b800-7000-8000-000000000302',
    stagedAt: '2026-09-11T08:01:00.000Z',
    restartRequired: true as const,
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
