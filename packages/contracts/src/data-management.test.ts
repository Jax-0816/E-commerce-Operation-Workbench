import { describe, expect, it } from 'vitest';

import {
  BackupListResponseSchema,
  BackupParamsSchema,
  BackupResponseSchema,
  RestoreStatusResponseSchema,
} from './data-management.js';

const backupId = '019cdd2a-b800-7000-8000-000000000301';
const restoreId = '019cdd2a-b800-7000-8000-000000000302';
const backup = {
  appVersion: '0.1.0',
  backupId,
  createdAt: '2026-09-11T08:00:00.000Z',
  size: 1234,
  downloadUrl: `/api/v1/data-management/backups/${backupId}/download`,
};

describe('data management contracts', () => {
  it('accepts exact backup DTOs and rejects invalid identities, time, size, version, URL, or fields', () => {
    expect(BackupResponseSchema.parse(backup)).toEqual(backup);
    expect(BackupListResponseSchema.parse({ items: [backup] })).toEqual({ items: [backup] });
    expect(BackupParamsSchema.parse({ backupId })).toEqual({ backupId });

    for (const invalid of [
      { ...backup, backupId: 'not-an-id' },
      { ...backup, createdAt: '2026-09-11' },
      { ...backup, size: -1 },
      { ...backup, size: 1.5 },
      { ...backup, appVersion: 'v0.1' },
      { ...backup, downloadUrl: '/private/workspace/backup.zip' },
      { ...backup, manifestSha256: 'A'.repeat(64) },
    ]) {
      expect(() => BackupResponseSchema.parse(invalid)).toThrow();
    }
  });

  it('enforces exact restore lifecycle combinations', () => {
    const pending = {
      state: 'pending',
      backupId,
      restoreId,
      stagedAt: '2026-09-11T08:01:00.000Z',
      restartRequired: true,
    } as const;
    expect(RestoreStatusResponseSchema.parse({ state: 'idle' })).toEqual({ state: 'idle' });
    expect(RestoreStatusResponseSchema.parse(pending)).toEqual(pending);
    expect(
      RestoreStatusResponseSchema.parse({
        state: 'applied',
        backupId,
        restoreId,
        completedAt: '2026-09-11T08:02:00.000Z',
      }),
    ).toMatchObject({ state: 'applied' });
    expect(
      RestoreStatusResponseSchema.parse({
        state: 'failed',
        backupId,
        restoreId,
        completedAt: '2026-09-11T08:02:00.000Z',
        message: 'Restore failed; original workspace was preserved.',
      }),
    ).toMatchObject({ state: 'failed' });

    for (const invalid of [
      { ...pending, restartRequired: false },
      { ...pending, state: 'applied' },
      { ...pending, restoreId: 'invalid' },
      { ...pending, stagedAt: new Date().toString() },
      { ...pending, extra: true },
      { state: 'failed', backupId, restoreId, completedAt: pending.stagedAt, message: '/secret' },
    ]) {
      expect(() => RestoreStatusResponseSchema.parse(invalid)).toThrow();
    }
  });
});
