import { describe, expect, it } from 'vitest';

import type { RestoreStatus, WorkspaceBackupRecord } from '@eaw/workspace';

import { createDataManagementApplication } from './index.js';

const backupId = '019cdd2a-b800-7000-8000-000000000301';
const restoreId = '019cdd2a-b800-7000-8000-000000000302';
const record: WorkspaceBackupRecord = {
  appVersion: '0.1.0',
  backupId,
  createdAt: '2026-09-11T08:00:00.000Z',
  size: 1234,
};

describe('data management application', () => {
  it('maps explicit backup ports to path-free public records and binary downloads', async () => {
    const calls: string[] = [];
    const application = createDataManagementApplication({
      createBackup: async () => {
        calls.push('create');
        return record;
      },
      listBackups: async () => {
        calls.push('list');
        return [record];
      },
      readBackup: async (id) => {
        calls.push(`read:${id}`);
        return { bytes: Uint8Array.from([0x50, 0x4b]), record };
      },
      stageRestore: async () => {
        throw new Error('not used');
      },
      restoreStatus: async () => ({ state: 'idle' }),
    });

    const created = await application.createBackup();
    expect(created).toEqual({
      ...record,
      downloadUrl: `/api/v1/data-management/backups/${backupId}/download`,
    });
    expect(await application.listBackups()).toEqual([created]);
    expect(await application.readBackup(backupId)).toEqual({
      bytes: Uint8Array.from([0x50, 0x4b]),
      fileName: `${backupId}.eaw-backup.zip`,
    });
    expect(JSON.stringify([created, await application.listBackups()])).not.toContain('/Users/');
    expect(calls).toEqual(['create', 'list', 'read:019cdd2a-b800-7000-8000-000000000301', 'list']);
  });

  it('rejects empty or oversized restore uploads before invoking the staging port', async () => {
    let stageCalls = 0;
    const application = createDataManagementApplication({
      createBackup: async () => record,
      listBackups: async () => [],
      readBackup: async () => ({ bytes: new Uint8Array(), record }),
      stageRestore: async () => {
        stageCalls += 1;
        return {
          backupId,
          restoreId,
          restartRequired: true,
          stagedAt: '2026-09-11T08:01:00.000Z',
        };
      },
      restoreStatus: async () => ({ state: 'idle' }),
      maxRestoreBytes: 3,
    });

    await expect(application.stageRestore(new Uint8Array())).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(application.stageRestore(Uint8Array.from([1, 2, 3, 4]))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(stageCalls).toBe(0);
    await expect(application.stageRestore(Uint8Array.from([1, 2, 3]))).resolves.toMatchObject({
      state: 'pending',
      backupId,
      restartRequired: true,
    });
    expect(stageCalls).toBe(1);
  });

  it('returns exact restore status views without adding workspace paths', async () => {
    const statuses: RestoreStatus[] = [
      { state: 'idle' },
      {
        state: 'failed',
        backupId,
        restoreId,
        completedAt: '2026-09-11T08:02:00.000Z',
        message: 'Restore failed; original workspace was preserved.',
      },
    ];
    const application = createDataManagementApplication({
      createBackup: async () => record,
      listBackups: async () => [],
      readBackup: async () => ({ bytes: new Uint8Array(), record }),
      stageRestore: async () => {
        throw new Error('not used');
      },
      restoreStatus: async () => statuses.shift()!,
    });

    await expect(application.restoreStatus()).resolves.toEqual({ state: 'idle' });
    const failed = await application.restoreStatus();
    expect(failed).toEqual({
      state: 'failed',
      backupId,
      restoreId,
      completedAt: '2026-09-11T08:02:00.000Z',
      message: 'Restore failed; original workspace was preserved.',
    });
    expect(JSON.stringify(failed)).not.toContain('workspacePath');
  });

  it('maps corrupt archives to a sanitized validation error', async () => {
    const application = createDataManagementApplication({
      createBackup: async () => record,
      listBackups: async () => [],
      readBackup: async () => ({ bytes: new Uint8Array(), record }),
      stageRestore: async () => {
        throw new TypeError('corrupt at /Users/private/workspace');
      },
      restoreStatus: async () => ({ state: 'idle' }),
    });

    const failure = await application
      .stageRestore(Uint8Array.from([0x50, 0x4b]))
      .catch((error) => Promise.resolve(error));
    expect(failure).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(failure.message).not.toContain('/Users/private');
  });
});
