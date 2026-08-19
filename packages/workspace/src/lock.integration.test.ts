import {
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
const token = {
  first: '00000000-0000-4000-8000-000000000001',
  second: '00000000-0000-4000-8000-000000000002',
  stale: '00000000-0000-4000-8000-000000000003',
  contenderA: '00000000-0000-4000-8000-000000000004',
  contenderB: '00000000-0000-4000-8000-000000000005',
  replacement: '00000000-0000-4000-8000-000000000006',
  claim: '00000000-0000-4000-8000-000000000007',
} as const;
const createdAt = '2026-08-19T00:00:00.000Z';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-lock-'));
  const physicalDirectory = await realpath(directory);
  temporaryDirectories.push(physicalDirectory);
  return physicalDirectory;
}

function lockRecord(ownerToken: string, pid: number): object {
  return { ownerToken, pid, createdAt };
}

async function writeOwner(workspacePath: string, ownerToken: string, pid: number): Promise<void> {
  const lockPath = join(workspacePath, '.workspace.lock');
  await mkdir(lockPath);
  await writeFile(
    join(lockPath, 'owner.json'),
    JSON.stringify(lockRecord(ownerToken, pid)),
    'utf8',
  );
}

describe('workspace locking', () => {
  it('rejects a second writer while the first owner remains alive', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const first = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.first,
      pid: 101,
      isProcessAlive: (pid) => pid === 101,
    });

    await expect(
      acquireWorkspaceLock(workspacePath, {
        ownerToken: token.second,
        pid: 202,
        isProcessAlive: () => true,
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(
      readFile(join(workspacePath, '.workspace.lock', 'owner.json'), 'utf8'),
    ).resolves.toContain(token.first);
    await first.release();
  });

  it('recovers a lock only when its strict recorded owner is no longer alive', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeOwner(workspacePath, token.stale, 101);

    const recovered = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.second,
      pid: 202,
      isProcessAlive: (pid) => pid === 202,
    });

    await expect(
      readFile(join(workspacePath, '.workspace.lock', 'owner.json'), 'utf8'),
    ).resolves.toContain(token.second);
    await recovered.release();
  });

  it('keeps malformed or foreign owner states in place', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    await mkdir(lockPath);
    await writeFile(join(lockPath, 'owner.json'), '{not-json', 'utf8');

    await expect(
      acquireWorkspaceLock(workspacePath, { ownerToken: token.first, isProcessAlive: () => false }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(readFile(join(lockPath, 'owner.json'), 'utf8')).resolves.toBe('{not-json');
  });

  it('does not release when another entry makes the canonical directory foreign', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.first,
      pid: 101,
      isProcessAlive: () => true,
    });
    await writeFile(join(lockPath, 'foreign.json'), 'foreign', 'utf8');

    await lock.release();

    await expect(readdir(lockPath)).resolves.toEqual(['foreign.json', 'owner.json']);
  });

  it('allows only one stale contender to claim the fixed owner slot', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeOwner(workspacePath, token.stale, 101);
    let observed = 0;
    let resume: (() => void) | undefined;
    const bothObserved = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const pause = async (): Promise<void> => {
      observed += 1;
      if (observed === 2) resume?.();
      await bothObserved;
    };

    const outcomes = await Promise.allSettled([
      acquireWorkspaceLock(workspacePath, {
        ownerToken: token.contenderA,
        pid: 201,
        isProcessAlive: (pid) => pid !== 101,
        onStaleOwnerObserved: pause,
      }),
      acquireWorkspaceLock(workspacePath, {
        ownerToken: token.contenderB,
        pid: 202,
        isProcessAlive: (pid) => pid !== 101,
        onStaleOwnerObserved: pause,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const ownerBytes = await readFile(join(workspacePath, '.workspace.lock', 'owner.json'), 'utf8');
    expect(ownerBytes.includes(token.contenderA) || ownerBytes.includes(token.contenderB)).toBe(
      true,
    );
    expect(await readdir(join(workspacePath, '.workspace.lock'))).toEqual(['owner.json']);
    const winner = outcomes.find((outcome) => outcome.status === 'fulfilled');
    if (winner?.status === 'fulfilled') await winner.value.release();
  });

  it('blocks a new owner while release has atomically claimed the owner slot', async () => {
    const workspacePath = await createTemporaryWorkspace();
    let contenderRejected = false;
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.first,
      pid: 101,
      isProcessAlive: () => true,
      onOwnerRecordClaimed: async () => {
        await expect(
          acquireWorkspaceLock(workspacePath, {
            ownerToken: token.second,
            pid: 202,
            isProcessAlive: () => true,
          }),
        ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
        contenderRejected = true;
      },
    });

    await lock.release();

    expect(contenderRejected).toBe(true);
    await expect(readdir(join(workspacePath, '.workspace.lock'))).resolves.toEqual([]);
  });

  it('recovers a strictly bound aged claim left by a crashed releaser', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    const claimedAt = Date.now() - 60_000;
    await mkdir(lockPath);
    await writeFile(
      join(lockPath, `claim-${claimedAt}-${token.claim}.json`),
      JSON.stringify(lockRecord(token.claim, 101)),
      'utf8',
    );

    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.second,
      pid: 202,
      isProcessAlive: () => true,
    });

    await expect(readdir(lockPath)).resolves.toEqual(['owner.json']);
    await lock.release();
  });

  it('keeps a fresh strict claim as an acquisition barrier', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    await mkdir(lockPath);
    await writeFile(
      join(lockPath, `claim-${Date.now()}-${token.claim}.json`),
      JSON.stringify(lockRecord(token.claim, 101)),
      'utf8',
    );

    await expect(
      acquireWorkspaceLock(workspacePath, { ownerToken: token.second, pid: 202 }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
  });

  it.each([
    ['PID zero', { ownerToken: token.first, pid: 0, createdAt }],
    ['unsafe PID', { ownerToken: token.first, pid: Number.MAX_SAFE_INTEGER + 1, createdAt }],
    ['noncanonical timestamp', { ownerToken: token.first, pid: 101, createdAt: '2026-08-19' }],
    ['invalid token', { ownerToken: 'not-a-uuid', pid: 101, createdAt }],
  ])('fails closed for a strict owner slot containing %s', async (_label, record) => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    await mkdir(lockPath);
    await writeFile(join(lockPath, 'owner.json'), JSON.stringify(record), 'utf8');

    await expect(
      acquireWorkspaceLock(workspacePath, {
        ownerToken: token.second,
        pid: 202,
        isProcessAlive: () => false,
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(readFile(join(lockPath, 'owner.json'), 'utf8')).resolves.toBe(
      JSON.stringify(record),
    );
  });

  it('fails closed when a claim filename token does not bind to its record', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    await mkdir(lockPath);
    const claimPath = join(lockPath, `claim-${Date.now() - 60_000}-${token.claim}.json`);
    await writeFile(claimPath, JSON.stringify(lockRecord(token.first, 101)), 'utf8');

    await expect(
      acquireWorkspaceLock(workspacePath, {
        ownerToken: token.second,
        pid: 202,
        isProcessAlive: () => false,
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_LOCKED' } satisfies Partial<DomainError>);
    await expect(readFile(claimPath, 'utf8')).resolves.toContain(token.first);
  });

  it('rejects a symbolic lock directory without touching its external owner record', async () => {
    if (process.platform === 'win32') return;
    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    await mkdir(join(outsidePath, 'external-lock'));
    await writeFile(join(outsidePath, 'external-lock', 'owner.json'), 'outside', 'utf8');
    await symlink(join(outsidePath, 'external-lock'), join(workspacePath, '.workspace.lock'));

    await expect(
      acquireWorkspaceLock(workspacePath, { ownerToken: token.first, pid: 101 }),
    ).rejects.toThrow(TypeError);
    await expect(readFile(join(outsidePath, 'external-lock', 'owner.json'), 'utf8')).resolves.toBe(
      'outside',
    );
  });

  it('rejects release after the canonical directory is replaced by a symlink', async () => {
    if (process.platform === 'win32') return;
    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.first,
      pid: 101,
    });
    await rm(join(workspacePath, '.workspace.lock'), { recursive: true });
    await mkdir(join(outsidePath, 'external-lock'));
    await writeFile(
      join(outsidePath, 'external-lock', 'owner.json'),
      JSON.stringify(lockRecord(token.first, 101)),
      'utf8',
    );
    await symlink(join(outsidePath, 'external-lock'), join(workspacePath, '.workspace.lock'));

    await expect(lock.release()).rejects.toThrow(TypeError);
    await expect(
      readFile(join(outsidePath, 'external-lock', 'owner.json'), 'utf8'),
    ).resolves.toContain(token.first);
  });

  it('releases normally when Windows reports a zero directory identity', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.first,
      pid: 101,
      getLockDirectoryIdentity: async () => ({ device: 0, inode: 0 }),
    });

    await lock.release();

    await expect(readdir(join(workspacePath, '.workspace.lock'))).resolves.toEqual([]);
  });

  it.each([
    ['zero', { device: 0, inode: 0 }],
    ['non-unique', { device: 1, inode: 1 }],
  ])('does not move a replacement owner with a %s directory identity', async (_label, identity) => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = join(workspacePath, '.workspace.lock');
    let armed = false;
    let replaced = false;
    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.first,
      pid: 101,
      getLockDirectoryIdentity: async () => {
        if (armed && !replaced) {
          replaced = true;
          await rm(lockPath, { recursive: true });
          await mkdir(lockPath);
          await writeFile(
            join(lockPath, 'owner.json'),
            JSON.stringify(lockRecord(token.replacement, 202)),
            'utf8',
          );
        }
        return identity;
      },
    });
    armed = true;

    await lock.release();

    expect(replaced).toBe(true);
    await expect(readFile(join(lockPath, 'owner.json'), 'utf8')).resolves.toContain(
      token.replacement,
    );
  });

  it('recovers a stale owner with a zero directory identity and leaves the container persistent', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeOwner(workspacePath, token.stale, 101);

    const lock = await acquireWorkspaceLock(workspacePath, {
      ownerToken: token.second,
      pid: 202,
      isProcessAlive: (pid) => pid === 202,
      getLockDirectoryIdentity: async () => ({ device: 0, inode: 0 }),
    });

    await expect(
      readFile(join(workspacePath, '.workspace.lock', 'owner.json'), 'utf8'),
    ).resolves.toContain(token.second);
    await lock.release();
    await expect(readdir(join(workspacePath, '.workspace.lock'))).resolves.toEqual([]);
  });
});
