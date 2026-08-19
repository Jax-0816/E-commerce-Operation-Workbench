import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
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
  const physicalDirectory = await realpath(directory);
  temporaryDirectories.push(physicalDirectory);
  return physicalDirectory;
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

  it('preserves an empty replacement lock installed after atomically retiring its directory', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    let retiredPath = '';
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'owner-one',
      pid: 101,
      isProcessAlive: () => true,
      onLockDirectoryRetired: async (claimedPath) => {
        retiredPath = claimedPath;
        await mkdir(lockPath);
      },
    });

    await lock.release();

    expect(retiredPath).not.toBe('');
    await expect(readdir(lockPath)).resolves.toEqual([]);
    await expect(access(retiredPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers a strictly valid crashed directory-retirement artifact after its grace period', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const retiredPath = join(
      workspacePath,
      `.workspace.lock.retired-${Date.now() - 60_000}-00000000-0000-4000-8000-000000000001`,
    );
    await mkdir(retiredPath);
    await writeFile(
      join(retiredPath, 'owner-crashed-owner.json'),
      JSON.stringify({
        ownerToken: 'crashed-owner',
        pid: 101,
        createdAt: '2026-08-19T00:00:00.000Z',
      }),
      'utf8',
    );

    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'new-owner',
      pid: 202,
      isProcessAlive: () => true,
    });

    await expect(access(retiredPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await lock.release();
  });

  it('recovers an old empty directory-retirement artifact left after marker deletion', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const retiredPath = join(
      workspacePath,
      `.workspace.lock.retired-${Date.now() - 60_000}-00000000-0000-4000-8000-000000000001`,
    );
    await mkdir(retiredPath);

    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'new-owner',
      pid: 202,
      isProcessAlive: () => true,
    });

    await expect(access(retiredPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await lock.release();
  });

  it('leaves malformed directory-retirement artifacts untouched', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const retiredPath = join(
      workspacePath,
      `.workspace.lock.retired-${Date.now() - 60_000}-00000000-0000-4000-8000-000000000001`,
    );
    await mkdir(retiredPath);
    await writeFile(join(retiredPath, 'foreign.txt'), 'foreign', 'utf8');

    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'new-owner',
      pid: 202,
      isProcessAlive: () => true,
    });

    await expect(readFile(join(retiredPath, 'foreign.txt'), 'utf8')).resolves.toBe('foreign');
    await lock.release();
  });

  it('rejects a symbolic lock directory without touching its external owner record', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    const externalLockPath = join(outsidePath, 'external-lock');
    await mkdir(externalLockPath);
    await writeFile(
      join(externalLockPath, 'owner-external-owner.json'),
      JSON.stringify({
        ownerToken: 'external-owner',
        pid: 101,
        createdAt: '2026-08-19T00:00:00.000Z',
      }),
      'utf8',
    );
    await symlink(externalLockPath, join(workspacePath, '.workspace.lock'));

    await expect(
      acquireWorkspaceLock(workspacePath, { isProcessAlive: () => false }),
    ).rejects.toThrow(TypeError);
    await expect(
      readFile(join(externalLockPath, 'owner-external-owner.json'), 'utf8'),
    ).resolves.toContain('external-owner');
  });

  it('rejects release after a lock directory is swapped for a symbolic link', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'owner-one',
      pid: 101,
      isProcessAlive: () => true,
    });
    await rm(join(workspacePath, '.workspace.lock'), { recursive: true });
    const externalLockPath = join(outsidePath, 'external-lock');
    await mkdir(externalLockPath);
    await writeFile(
      join(externalLockPath, 'owner-owner-one.json'),
      JSON.stringify({ ownerToken: 'owner-one', pid: 101, createdAt: '2026-08-19T00:00:00.000Z' }),
      'utf8',
    );
    await symlink(externalLockPath, join(workspacePath, '.workspace.lock'));

    await expect(lock.release()).rejects.toThrow(TypeError);
    await expect(
      readFile(join(externalLockPath, 'owner-owner-one.json'), 'utf8'),
    ).resolves.toContain('owner-one');
  });

  it('releases its owner record when Windows reports a zero directory identity', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'zero-identity-owner',
      pid: 101,
      isProcessAlive: () => true,
      getLockDirectoryIdentity: async () => ({ device: 0, inode: 0 }),
    });

    await lock.release();

    await expect(access(join(workspacePath, '.workspace.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it.each([
    ['zero', { device: 0, inode: 0 }],
    ['non-unique', { device: 1, inode: 1 }],
  ])(
    'does not delete a replacement owner when Windows reports a %s directory identity',
    async (_label, identity) => {
      const workspacePath = await createTemporaryWorkspace();
      const lockPath = join(workspacePath, '.workspace.lock');
      let identityReads = 0;
      let replaced = false;
      const lock = await acquireWorkspaceLock(workspacePath, {
        ownerToken: 'original-owner',
        pid: 101,
        isProcessAlive: () => true,
        getLockDirectoryIdentity: async () => {
          identityReads += 1;
          if (identityReads > 1 && !replaced) {
            replaced = true;
            await rm(lockPath, { recursive: true });
            await mkdir(lockPath);
            await writeFile(
              join(lockPath, 'owner-original-owner.json'),
              JSON.stringify({
                ownerToken: 'replacement-owner',
                pid: 202,
                createdAt: '2026-08-19T00:00:00.000Z',
              }),
              'utf8',
            );
          }
          return identity;
        },
      });

      await lock.release();

      expect(replaced).toBe(true);
      await expect(
        readFile(join(lockPath, 'owner-original-owner.json'), 'utf8'),
      ).resolves.toContain('replacement-owner');
    },
  );

  it('recovers a stale owner when Windows reports a zero directory identity', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeLockRecord(workspacePath, {
      ownerToken: 'stale-owner',
      pid: 101,
      createdAt: '2026-08-19T00:00:00.000Z',
    });
    let identityReads = 0;

    const recoveredLock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: 'recovered-owner',
      pid: 202,
      isProcessAlive: (pid) => pid === 202,
      getLockDirectoryIdentity: async () => {
        identityReads += 1;
        if (identityReads > 12) {
          throw new Error('Zero-identity stale recovery did not make progress.');
        }
        return { device: 0, inode: 0 };
      },
    });

    await expect(readdir(join(workspacePath, '.workspace.lock'))).resolves.toEqual([
      'owner-recovered-owner.json',
    ]);
    await recoveredLock.release();
  });
});
