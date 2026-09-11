import { access, mkdtemp, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createWorkspaceBackup,
  initializeWorkspace,
  listWorkspaceBackups,
  readBackupArchive,
  readWorkspaceBackup,
} from './index.js';

const temporaryDirectories: string[] = [];
const backupId = '019cdd2a-b800-7000-8000-000000000101';
const appVersion = '0.1.0';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) =>
        import('node:fs/promises').then(({ rm }) => rm(path, { recursive: true, force: true })),
      ),
  );
});

describe('consistent portable workspace backup', () => {
  it('backs up an active WAL with allowed files but no secret or source path', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await initializeWorkspace(workspacePath);
    const databasePath = join(workspacePath, 'database', 'workbench.sqlite');
    const database = new DatabaseSync(databasePath);
    database.exec(
      "PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE products (name TEXT NOT NULL); INSERT INTO products VALUES ('保温杯');",
    );
    await writeFile(
      join(workspacePath, 'assets', 'products', '主图 photo.txt'),
      '可移植资产',
      'utf8',
    );
    await writeFile(join(workspacePath, 'rule-packs', 'pdd.json'), '{"version":1}', 'utf8');
    await writeFile(
      join(workspacePath, '.secrets.json'),
      '{"deepseek":"never-archive-me"}',
      'utf8',
    );
    await expect(access(`${databasePath}-wal`)).resolves.toBeUndefined();

    const created = await createWorkspaceBackup({
      appVersion,
      database,
      idFactory: () => backupId,
      now: () => new Date('2026-09-11T01:02:03.000Z'),
      workspacePath,
    });
    database.close();

    expect(created).toEqual({
      appVersion,
      backupId,
      createdAt: '2026-09-11T01:02:03.000Z',
      size: expect.any(Number),
    });
    const stored = await readWorkspaceBackup({
      backupId,
      currentAppVersion: appVersion,
      workspacePath,
    });
    expect(stored.record).toEqual(created);
    expect(Buffer.from(stored.bytes).includes(Buffer.from('never-archive-me'))).toBe(false);
    expect(Buffer.from(stored.bytes).includes(Buffer.from(workspacePath))).toBe(false);

    const archive = readBackupArchive(stored.bytes, appVersion);
    expect([...archive.files.keys()]).toEqual([
      'assets/products/主图 photo.txt',
      'database/workbench.sqlite',
      'rule-packs/pdd.json',
      'workspace.json',
    ]);
    expect([...archive.files.keys()]).not.toContain('.secrets.json');
    expect(
      [...archive.files.keys()].every((path) => !path.endsWith('-wal') && !path.endsWith('-shm')),
    ).toBe(true);

    const restoredDatabasePath = join(await createTemporaryWorkspace(), 'restored.sqlite');
    await writeFile(restoredDatabasePath, archive.files.get('database/workbench.sqlite')!);
    const restored = new DatabaseSync(restoredDatabasePath, { readOnly: true });
    expect(restored.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(restored.prepare('SELECT name FROM products').all()).toEqual([{ name: '保温杯' }]);
    restored.close();

    await expect(
      listWorkspaceBackups({ currentAppVersion: appVersion, workspacePath }),
    ).resolves.toEqual([created]);
  });

  it('rejects symlinks in managed backup roots and cleans every temporary artifact', async () => {
    if (process.platform === 'win32') return;
    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    await initializeWorkspace(workspacePath);
    await writeFile(join(outsidePath, 'secret.txt'), 'outside', 'utf8');
    await symlink(
      join(outsidePath, 'secret.txt'),
      join(workspacePath, 'assets', 'products', 'linked.txt'),
    );
    const database = openSourceDatabase(workspacePath);

    await expect(
      createWorkspaceBackup({ appVersion, database, idFactory: () => backupId, workspacePath }),
    ).rejects.toThrow(TypeError);
    database.close();

    expect(await readdir(join(workspacePath, 'backups'))).toEqual([]);
  });

  it('cleans its snapshot when publication fails and ignores invalid local archives', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await initializeWorkspace(workspacePath);
    const database = openSourceDatabase(workspacePath);

    await expect(
      createWorkspaceBackup({
        appVersion,
        database,
        idFactory: () => backupId,
        onSnapshotCreated: () => {
          throw new Error('injected publication failure');
        },
        workspacePath,
      }),
    ).rejects.toThrow('injected publication failure');
    database.close();
    expect(await readdir(join(workspacePath, 'backups'))).toEqual([]);

    await writeFile(join(workspacePath, 'backups', 'not-a-backup.zip'), 'corrupt', 'utf8');
    await expect(
      listWorkspaceBackups({ currentAppVersion: appVersion, workspacePath }),
    ).resolves.toEqual([]);
    await expect(
      readWorkspaceBackup({ backupId: '../outside', currentAppVersion: appVersion, workspacePath }),
    ).rejects.toThrow(TypeError);
  });
});

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'eaw 备份工作区-'));
  const physicalDirectory = await realpath(directory);
  temporaryDirectories.push(physicalDirectory);
  return physicalDirectory;
}

function openSourceDatabase(workspacePath: string): DatabaseSync {
  const database = new DatabaseSync(join(workspacePath, 'database', 'workbench.sqlite'));
  database.exec(
    "PRAGMA journal_mode = WAL; CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('ok');",
  );
  return database;
}
