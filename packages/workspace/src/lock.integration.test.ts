import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DomainError } from '@eaw/domain';

import { acquireWorkspaceLock } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) =>
        import('node:fs/promises').then(({ rm }) => rm(path, { recursive: true, force: true })),
      ),
  );
});

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-lock-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('workspace locking', () => {
  it('rejects a second writer while the first owner remains alive', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const firstLock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'first-owner',
      pid: 101,
      isProcessAlive: (pid) => pid === 101,
    });

    await expect(
      acquireWorkspaceLock(workspacePath, {
        ownerToken: 'second-owner',
        pid: 202,
        isProcessAlive: () => true,
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(readFile(join(workspacePath, '.workspace.lock'), 'utf8')).resolves.toContain(
      'first-owner',
    );

    await firstLock.release();
  });

  it('recovers a lock only when its recorded owner is no longer alive', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeFile(
      join(workspacePath, '.workspace.lock'),
      JSON.stringify({
        ownerToken: 'stale-owner',
        pid: 101,
        createdAt: '2026-08-19T00:00:00.000Z',
      }),
      'utf8',
    );

    const recoveredLock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'new-owner',
      pid: 202,
      isProcessAlive: (pid) => pid === 202,
    });

    await expect(readFile(join(workspacePath, '.workspace.lock'), 'utf8')).resolves.toContain(
      'new-owner',
    );
    await recoveredLock.release();
  });

  it('does not remove a valid foreign lock when its owner is alive', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    const foreignLock = JSON.stringify({
      ownerToken: 'foreign-owner',
      pid: 777,
      createdAt: '2026-08-19T00:00:00.000Z',
    });
    await writeFile(lockPath, foreignLock, 'utf8');

    await expect(
      acquireWorkspaceLock(workspacePath, {
        ownerToken: 'new-owner',
        pid: 202,
        isProcessAlive: (pid) => pid === 777,
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(readFile(lockPath, 'utf8')).resolves.toBe(foreignLock);
  });

  it('keeps a malformed lock in place and rejects a writer safely', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    await writeFile(lockPath, '{not-json', 'utf8');

    await expect(
      acquireWorkspaceLock(workspacePath, { isProcessAlive: () => false }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(readFile(lockPath, 'utf8')).resolves.toBe('{not-json');
  });

  it('releases only the lock owned by its token', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'owner-one',
      pid: 101,
      isProcessAlive: () => true,
    });
    await writeFile(
      lockPath,
      JSON.stringify({ ownerToken: 'owner-two', pid: 202, createdAt: '2026-08-19T00:00:00.000Z' }),
      'utf8',
    );

    await lock.release();

    await expect(readFile(lockPath, 'utf8')).resolves.toContain('owner-two');
  });
});
