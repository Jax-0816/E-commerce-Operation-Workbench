import { access, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyPendingWorkspaceRestore,
  createWorkspaceBackup,
  initializeWorkspace,
  readWorkspaceBackup,
  readWorkspaceRestoreStatus,
  stageWorkspaceRestore,
} from './index.js';

const temporaryDirectories: string[] = [];
const appVersion = '0.1.0';
const backupId = '019cdd2a-b800-7000-8000-000000000201';
const restoreId = '019cdd2a-b800-7000-8000-000000000202';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) =>
        import('node:fs/promises').then(({ rm }) => rm(path, { recursive: true, force: true })),
      ),
  );
});

describe('staged transactional workspace restore', () => {
  it('restores a backup across machines on next startup while preserving the target secret', async () => {
    const source = await createWorkspace('source 电商');
    const sourceDatabase = databaseWithValue(source, 'source-product');
    await writeFile(join(source, 'assets', 'products', 'photo.txt'), 'source-asset', 'utf8');
    await writeFile(join(source, 'rule-packs', 'active.json'), 'source-rule', 'utf8');
    const created = await createWorkspaceBackup({
      appVersion,
      database: sourceDatabase,
      idFactory: () => backupId,
      workspacePath: source,
    });
    sourceDatabase.close();
    const { bytes } = await readWorkspaceBackup({
      backupId: created.backupId,
      currentAppVersion: appVersion,
      workspacePath: source,
    });

    const target = await createWorkspace('target 中文 空格');
    databaseWithValue(target, 'old-target').close();
    await writeFile(join(target, 'assets', 'products', 'photo.txt'), 'old-asset', 'utf8');
    await writeFile(join(target, 'rule-packs', 'active.json'), 'old-rule', 'utf8');
    await writeFile(join(target, '.secrets.json'), '{"deepseek":"target-local-secret"}', 'utf8');

    const pending = await stageWorkspaceRestore({
      archive: bytes,
      currentAppVersion: appVersion,
      idFactory: () => restoreId,
      validateDatabase: assertHealthyDatabase,
      workspacePath: target,
    });

    expect(pending).toEqual({
      backupId,
      restoreId,
      restartRequired: true,
      stagedAt: expect.any(String),
    });
    expect(readDatabaseValue(target)).toBe('old-target');
    await expect(readWorkspaceRestoreStatus(target)).resolves.toMatchObject({
      backupId,
      state: 'pending',
    });

    const applied = await applyPendingWorkspaceRestore({
      currentAppVersion: appVersion,
      validateDatabase: assertHealthyDatabase,
      workspacePath: target,
    });

    expect(applied).toMatchObject({ backupId, restoreId, state: 'applied' });
    expect(readDatabaseValue(target)).toBe('source-product');
    await expect(readFile(join(target, 'assets', 'products', 'photo.txt'), 'utf8')).resolves.toBe(
      'source-asset',
    );
    await expect(readFile(join(target, 'rule-packs', 'active.json'), 'utf8')).resolves.toBe(
      'source-rule',
    );
    await expect(readFile(join(target, '.secrets.json'), 'utf8')).resolves.toContain(
      'target-local-secret',
    );
    await expect(
      applyPendingWorkspaceRestore({
        currentAppVersion: appVersion,
        validateDatabase: assertHealthyDatabase,
        workspacePath: target,
      }),
    ).resolves.toEqual(applied);
  });

  it('rejects corrupt or incompatible archives before creating a pending marker', async () => {
    const target = await createWorkspace('reject target');
    databaseWithValue(target, 'keep-me').close();

    await expect(
      stageWorkspaceRestore({
        archive: Buffer.from('not a zip'),
        currentAppVersion: appVersion,
        validateDatabase: assertHealthyDatabase,
        workspacePath: target,
      }),
    ).rejects.toThrow(TypeError);
    expect(readDatabaseValue(target)).toBe('keep-me');
    await expect(readWorkspaceRestoreStatus(target)).resolves.toEqual({ state: 'idle' });

    const { bytes } = await sourceBackup('newer source', 'newer', '0.2.0');
    await expect(
      stageWorkspaceRestore({
        archive: bytes,
        currentAppVersion: appVersion,
        validateDatabase: assertHealthyDatabase,
        workspacePath: target,
      }),
    ).rejects.toThrow(TypeError);
    expect(readDatabaseValue(target)).toBe('keep-me');
  });

  it('does not create a marker when migration or integrity validation fails', async () => {
    const target = await createWorkspace('validation target');
    databaseWithValue(target, 'keep-me').close();
    const { bytes } = await sourceBackup('validation source', 'replacement');

    await expect(
      stageWorkspaceRestore({
        archive: bytes,
        currentAppVersion: appVersion,
        validateDatabase: () => {
          throw new Error('injected migration failure');
        },
        workspacePath: target,
      }),
    ).rejects.toThrow('injected migration failure');

    expect(readDatabaseValue(target)).toBe('keep-me');
    await expect(readWorkspaceRestoreStatus(target)).resolves.toEqual({ state: 'idle' });
    await expect(access(join(target, 'backups', '.pending-restore.json'))).rejects.toThrow();
  });

  it.each(['database', 'assets', 'rule-packs', 'workspace.json'] as const)(
    'rolls every activated target back when %s replacement fails',
    async (failedTarget) => {
      const target = await createWorkspace('rollback target');
      databaseWithValue(target, 'old-database').close();
      await writeFile(join(target, 'assets', 'products', 'photo.txt'), 'old-asset', 'utf8');
      await writeFile(join(target, 'rule-packs', 'active.json'), 'old-rule', 'utf8');
      await writeFile(join(target, 'workspace.json'), '{"version":1,"owner":"old"}\n', 'utf8');
      await writeFile(join(target, '.secrets.json'), '{"secret":"keep-local"}', 'utf8');
      const { bytes } = await sourceBackup('rollback source', 'new-database');
      await stageWorkspaceRestore({
        archive: bytes,
        currentAppVersion: appVersion,
        idFactory: () => restoreId,
        validateDatabase: assertHealthyDatabase,
        workspacePath: target,
      });

      const status = await applyPendingWorkspaceRestore({
        currentAppVersion: appVersion,
        onBeforeTargetActivation: (targetName) => {
          if (targetName === failedTarget) throw new Error('injected activation failure');
        },
        validateDatabase: assertHealthyDatabase,
        workspacePath: target,
      });

      expect(status).toMatchObject({ backupId, restoreId, state: 'failed' });
      expect(status.state).toBe('failed');
      if (status.state !== 'failed') throw new Error('Expected restore failure status.');
      expect(status.message).not.toContain('injected');
      expect(readDatabaseValue(target)).toBe('old-database');
      await expect(readFile(join(target, 'assets', 'products', 'photo.txt'), 'utf8')).resolves.toBe(
        'old-asset',
      );
      await expect(readFile(join(target, 'rule-packs', 'active.json'), 'utf8')).resolves.toBe(
        'old-rule',
      );
      await expect(readFile(join(target, 'workspace.json'), 'utf8')).resolves.toContain('"old"');
      await expect(readFile(join(target, '.secrets.json'), 'utf8')).resolves.toContain(
        'keep-local',
      );
      await expect(access(join(target, 'backups', '.pending-restore.json'))).rejects.toThrow();
    },
  );
});

async function sourceBackup(
  prefix: string,
  value: string,
  sourceAppVersion = appVersion,
): Promise<{ bytes: Uint8Array }> {
  const source = await createWorkspace(prefix);
  const database = databaseWithValue(source, value);
  const record = await createWorkspaceBackup({
    appVersion: sourceAppVersion,
    database,
    idFactory: () => backupId,
    workspacePath: source,
  });
  database.close();
  return readWorkspaceBackup({
    backupId: record.backupId,
    currentAppVersion: sourceAppVersion,
    workspacePath: source,
  });
}

async function createWorkspace(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `eaw ${prefix}-`));
  const physical = await realpath(directory);
  temporaryDirectories.push(physical);
  await initializeWorkspace(physical);
  return physical;
}

function databaseWithValue(workspacePath: string, value: string): DatabaseSync {
  const database = new DatabaseSync(join(workspacePath, 'database', 'workbench.sqlite'));
  database.exec('PRAGMA journal_mode = WAL; CREATE TABLE state (value TEXT NOT NULL);');
  database.prepare('INSERT INTO state VALUES (?)').run(value);
  return database;
}

function readDatabaseValue(workspacePath: string): string {
  const database = new DatabaseSync(join(workspacePath, 'database', 'workbench.sqlite'), {
    readOnly: true,
  });
  try {
    return (database.prepare('SELECT value FROM state').get() as { value: string }).value;
  } finally {
    database.close();
  }
}

function assertHealthyDatabase(path: string): void {
  const database = new DatabaseSync(path);
  try {
    expect(database.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(database.prepare('SELECT value FROM state').get()).toEqual({
      value: expect.any(String),
    });
  } finally {
    database.close();
  }
}
