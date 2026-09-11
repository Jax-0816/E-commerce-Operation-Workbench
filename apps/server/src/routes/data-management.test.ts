import { describe, expect, it } from 'vitest';

import type { DataManagementApplication } from '@eaw/application';
import { DomainError } from '@eaw/domain';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const backupId = '019cdd2a-b800-7000-8000-000000000301';
const restoreId = '019cdd2a-b800-7000-8000-000000000302';
const backup = {
  appVersion: '0.1.0',
  backupId,
  createdAt: '2026-09-11T08:00:00.000Z',
  size: 2,
  downloadUrl: `/api/v1/data-management/backups/${backupId}/download`,
};

describe('data management routes', () => {
  it('creates, lists, downloads, stages, and reports restores without exposing paths', async () => {
    const calls: string[] = [];
    const application = stub({
      createBackup: async () => {
        calls.push('create');
        return backup;
      },
      listBackups: async () => {
        calls.push('list');
        return [backup];
      },
      readBackup: async (id) => {
        calls.push(`read:${id}`);
        return { bytes: Uint8Array.from([0x50, 0x4b]), fileName: `${id}.eaw-backup.zip` };
      },
      stageRestore: async (archive) => {
        calls.push(`stage:${Buffer.from(archive).toString('hex')}`);
        return {
          state: 'pending',
          backupId,
          restoreId,
          stagedAt: '2026-09-11T08:01:00.000Z',
          restartRequired: true,
        };
      },
      restoreStatus: async () => ({ state: 'idle' }),
    });
    const app = buildApp(createAppContext({ dataManagement: application }));

    const created = await app.inject({ method: 'POST', url: '/api/v1/data-management/backups' });
    const listed = await app.inject({ method: 'GET', url: '/api/v1/data-management/backups' });
    const downloaded = await app.inject({
      method: 'GET',
      url: `/api/v1/data-management/backups/${backupId}/download`,
    });
    const staged = await app.inject({
      method: 'POST',
      url: '/api/v1/data-management/restores',
      headers: { 'content-type': 'application/zip' },
      payload: Buffer.from([0x50, 0x4b]),
    });
    const status = await app.inject({
      method: 'GET',
      url: '/api/v1/data-management/restore-status',
    });

    expect([
      created.statusCode,
      listed.statusCode,
      downloaded.statusCode,
      staged.statusCode,
    ]).toEqual([201, 200, 200, 202]);
    expect(created.json()).toEqual(backup);
    expect(listed.json()).toEqual({ items: [backup] });
    expect(downloaded.rawPayload).toEqual(Buffer.from([0x50, 0x4b]));
    expect(downloaded.headers['content-type']).toContain('application/zip');
    expect(downloaded.headers['content-disposition']).toBe(
      `attachment; filename="${backupId}.eaw-backup.zip"`,
    );
    expect(staged.json()).toMatchObject({ state: 'pending', restartRequired: true });
    expect(status.json()).toEqual({ state: 'idle' });
    expect(
      JSON.stringify([created.json(), listed.json(), staged.json(), status.json()]),
    ).not.toContain('/Users/');
    expect(calls).toEqual(['create', 'list', `read:${backupId}`, 'stage:504b']);
    await app.close();
  });

  it('returns unavailable or validation responses before invoking use cases', async () => {
    const unavailable = buildApp(createAppContext({}));
    expect(
      (await unavailable.inject({ method: 'GET', url: '/api/v1/data-management/backups' }))
        .statusCode,
    ).toBe(503);
    await unavailable.close();

    let calls = 0;
    const app = buildApp(
      createAppContext({
        dataManagement: stub({
          readBackup: async () => {
            calls += 1;
            throw new Error('not used');
          },
          stageRestore: async () => {
            calls += 1;
            throw new Error('not used');
          },
        }),
      }),
    );
    const invalidId = await app.inject({
      method: 'GET',
      url: '/api/v1/data-management/backups/not-an-id/download',
    });
    const wrongType = await app.inject({
      method: 'POST',
      url: '/api/v1/data-management/restores',
      payload: { archive: 'PK' },
    });
    expect([invalidId.statusCode, wrongType.statusCode]).toEqual([400, 400]);
    expect(calls).toBe(0);
    await app.close();
  });

  it('returns a sanitized validation response for a corrupt archive', async () => {
    const app = buildApp(
      createAppContext({
        dataManagement: stub({
          stageRestore: async () => {
            throw new DomainError('VALIDATION_ERROR', 'corrupt at /Users/private/workspace');
          },
        }),
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/data-management/restores',
      headers: { 'content-type': 'application/zip' },
      payload: Buffer.from('not-a-zip'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Some supplied values are invalid.' },
    });
    expect(response.body).not.toContain('/Users/private');
    await app.close();
  });
});

function stub(overrides: Partial<DataManagementApplication>): DataManagementApplication {
  const unused = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    createBackup: unused,
    listBackups: unused,
    readBackup: unused,
    stageRestore: unused,
    restoreStatus: unused,
    ...overrides,
  };
}
