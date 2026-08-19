import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
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

async function writeLockRecord(
  workspacePath: string,
  record: { ownerToken: string; pid: number; createdAt: string },
): Promise<void> {
  const lockPath = join(workspacePath, '.workspace.lock');
  await mkdir(lockPath);
  await writeFile(
    join(lockPath, `owner-${record.ownerToken}.json`),
    JSON.stringify(record),
    'utf8',
  );
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
    await expect(readdir(join(workspacePath, '.workspace.lock'))).resolves.toContain(
      'owner-first-owner.json',
    );

    await firstLock.release();
  });

  it('recovers a lock only when its recorded owner is no longer alive', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeLockRecord(workspacePath, {
      ownerToken: 'stale-owner',
      pid: 101,
      createdAt: '2026-08-19T00:00:00.000Z',
    });

    const recoveredLock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'new-owner',
      pid: 202,
      isProcessAlive: (pid) => pid === 202,
    });

    await expect(readdir(join(workspacePath, '.workspace.lock'))).resolves.toContain(
      'owner-new-owner.json',
    );
    await recoveredLock.release();
  });

  it('does not remove a valid foreign lock when its owner is alive', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    const foreignLock = {
      ownerToken: 'foreign-owner',
      pid: 777,
      createdAt: '2026-08-19T00:00:00.000Z',
    };
    await writeLockRecord(workspacePath, foreignLock);

    await expect(
      acquireWorkspaceLock(workspacePath, {
        ownerToken: 'new-owner',
        pid: 202,
        isProcessAlive: (pid) => pid === 777,
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(readdir(lockPath)).resolves.toContain('owner-foreign-owner.json');
  });

  it('keeps a malformed lock in place and rejects a writer safely', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    await mkdir(lockPath);
    await writeFile(join(lockPath, 'owner-malformed.json'), '{not-json', 'utf8');

    await expect(
      acquireWorkspaceLock(workspacePath, { isProcessAlive: () => false }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(readFile(join(lockPath, 'owner-malformed.json'), 'utf8')).resolves.toBe(
      '{not-json',
    );
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
      join(lockPath, 'owner-owner-two.json'),
      JSON.stringify({ ownerToken: 'owner-two', pid: 202, createdAt: '2026-08-19T00:00:00.000Z' }),
      'utf8',
    );

    await lock.release();

    await expect(readdir(lockPath)).resolves.toContain('owner-owner-two.json');
  });

  it('allows only one stale contender to replace a stale owner after a forced interleaving', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeLockRecord(workspacePath, {
      ownerToken: 'stale-owner',
      pid: 101,
      createdAt: '2026-08-19T00:00:00.000Z',
    });
    let observed = 0;
    let resume: (() => void) | undefined;
    const bothObserved = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const pauseAtStaleOwner = async (): Promise<void> => {
      observed += 1;
      if (observed === 2) {
        resume?.();
      }
      await bothObserved;
    };

    const outcomes = await Promise.allSettled([
      acquireWorkspaceLock(workspacePath, {
        ownerToken: 'contender-a',
        pid: 201,
        isProcessAlive: (pid) => pid !== 101,
        onStaleOwnerObserved: pauseAtStaleOwner,
      }),
      acquireWorkspaceLock(workspacePath, {
        ownerToken: 'contender-b',
        pid: 202,
        isProcessAlive: (pid) => pid !== 101,
        onStaleOwnerObserved: pauseAtStaleOwner,
      }),
    ]);

    expect(observed).toBe(2);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    await expect(readdir(join(workspacePath, '.workspace.lock'))).resolves.toSatisfy(
      (entries) =>
        entries.includes('owner-contender-a.json') || entries.includes('owner-contender-b.json'),
    );
  });

  it('does not remove a replacement owner after the releasing owner wins its record compare-and-swap', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'owner-one',
      pid: 101,
      isProcessAlive: () => true,
      onBeforeLockDirectoryRemoval: async (lockPath) => {
        await writeFile(
          join(lockPath, 'owner-owner-two.json'),
          JSON.stringify({
            ownerToken: 'owner-two',
            pid: 202,
            createdAt: '2026-08-19T00:00:00.000Z',
          }),
          'utf8',
        );
      },
    });

    await lock.release();

    await expect(readdir(join(workspacePath, '.workspace.lock'))).resolves.toContain(
      'owner-owner-two.json',
    );
  });
});
