import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const requiredInternalPackages = [
  '@eaw/domain',
  '@eaw/shared',
  '@eaw/application',
  '@eaw/contracts',
  '@eaw/database',
  '@eaw/workspace',
] as const;
const execFileAsync = promisify(execFile);

describe('standalone server lifecycle', () => {
  it('prepares every dist-only internal dependency before all standalone commands', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    const preparationScript = await readFile(
      new URL('../scripts/prepare-internal.mjs', import.meta.url),
      'utf8',
    );

    for (const packageName of requiredInternalPackages) {
      expect(preparationScript).toContain(packageName);
    }
    expect(manifest.scripts['prepare:internal']).toBe('node scripts/prepare-internal.mjs');
    for (const lifecycle of ['predev', 'prebuild', 'pretest', 'pretypecheck']) {
      expect(manifest.scripts[lifecycle]).toBe('pnpm run prepare:internal');
    }
    expect(manifest.scripts.prestart).toBe('pnpm run build');
  });

  it('recreates a missing secondary internal build artifact and restores it safely', async () => {
    const databasePackage = join(process.cwd(), '..', '..', 'packages', 'database');
    const artifact = join(databasePackage, 'dist', 'repositories', 'product-repository.js');
    const backup = `${artifact}.lifecycle-backup-${process.pid}-${randomUUID()}`;
    const fixtureLock = await acquireArtifactFixtureLock();
    let moved = false;
    try {
      await access(artifact);
      await rename(artifact, backup);
      moved = true;
      try {
        await execFileAsync('pnpm', ['run', 'prepare:internal'], {
          cwd: process.cwd(),
          env: process.env,
        });
        await expect(access(artifact)).resolves.toBeUndefined();
      } finally {
        if (moved) {
          await rm(artifact, { force: true });
          await rename(backup, artifact);
          moved = false;
        }
      }
    } finally {
      try {
        if (moved) {
          await rm(artifact, { force: true });
          await rename(backup, artifact);
        }
      } finally {
        await fixtureLock.release();
      }
    }
  }, 30_000);

  it('serializes competing artifact fixture owners', async () => {
    const lockPath = join(tmpdir(), `eaw-lifecycle-contention-${randomUUID()}.lock`);
    const first = await acquireArtifactFixtureLock(lockPath);
    let secondAcquired = false;
    const secondPromise = acquireArtifactFixtureLock(lockPath).then((lock) => {
      secondAcquired = true;
      return lock;
    });
    let second: ArtifactFixtureLock | undefined;
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(secondAcquired).toBe(false);
      await first.release();
      second = await secondPromise;
      expect(secondAcquired).toBe(true);
    } finally {
      await first.release();
      second ??= await secondPromise;
      await second.release();
    }
  });
});

interface ArtifactFixtureLock {
  release(): Promise<void>;
}

interface ArtifactFixtureOwner {
  readonly pid: number;
  readonly token: string;
}

const lockRetryMs = 50;
const lockTimeoutMs = 10_000;
const incompleteOwnerGraceMs = 5_000;

async function acquireArtifactFixtureLock(
  lockPath = defaultArtifactFixtureLockPath(),
): Promise<ArtifactFixtureLock> {
  const owner: ArtifactFixtureOwner = { pid: process.pid, token: randomUUID() };
  const deadline = Date.now() + lockTimeoutMs;

  for (;;) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      try {
        await writeFile(join(lockPath, 'owner.json'), JSON.stringify(owner), {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }
      return createArtifactFixtureLock(lockPath, owner);
    } catch (error) {
      if (!isAlreadyPresent(error)) throw error;
    }

    if (await retireStaleArtifactFixtureLock(lockPath)) continue;
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the server lifecycle artifact fixture lock.');
    }
    await new Promise((resolve) => setTimeout(resolve, lockRetryMs));
  }
}

function createArtifactFixtureLock(
  lockPath: string,
  owner: ArtifactFixtureOwner,
): ArtifactFixtureLock {
  let released = false;
  return {
    async release() {
      if (released) return;
      const current = await readArtifactFixtureOwner(lockPath);
      if (current?.token !== owner.token) {
        released = true;
        return;
      }
      const retiredPath = `${lockPath}.release-${owner.token}`;
      try {
        await rename(lockPath, retiredPath);
      } catch (error) {
        if (isMissing(error)) {
          released = true;
          return;
        }
        throw error;
      }
      const retiredOwner = await readArtifactFixtureOwner(retiredPath);
      if (retiredOwner?.token !== owner.token) {
        throw new Error('Server lifecycle artifact fixture ownership changed during release.');
      }
      await rm(retiredPath, { recursive: true, force: true });
      released = true;
    },
  };
}

async function retireStaleArtifactFixtureLock(lockPath: string): Promise<boolean> {
  const owner = await readArtifactFixtureOwner(lockPath);
  if (owner !== undefined && isProcessAlive(owner.pid)) return false;
  if (owner === undefined) {
    try {
      if (Date.now() - (await stat(lockPath)).mtimeMs < incompleteOwnerGraceMs) return false;
    } catch (error) {
      if (isMissing(error)) return true;
      throw error;
    }
  }

  const retiredPath = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
  try {
    await rename(lockPath, retiredPath);
  } catch (error) {
    if (isMissing(error)) return true;
    throw error;
  }
  await rm(retiredPath, { recursive: true, force: true });
  return true;
}

async function readArtifactFixtureOwner(
  lockPath: string,
): Promise<ArtifactFixtureOwner | undefined> {
  try {
    const value = JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'pid' in value &&
      typeof value.pid === 'number' &&
      Number.isInteger(value.pid) &&
      value.pid > 0 &&
      'token' in value &&
      typeof value.token === 'string'
    ) {
      return { pid: value.pid, token: value.token };
    }
    return undefined;
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isPermissionDenied(error);
  }
}

function defaultArtifactFixtureLockPath(): string {
  const workspaceKey = createHash('sha256')
    .update(join(process.cwd(), '..', '..'))
    .digest('hex')
    .slice(0, 16);
  return join(tmpdir(), `eaw-server-lifecycle-${workspaceKey}.lock`);
}

function isAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return hasErrorCode(error, 'EEXIST');
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return hasErrorCode(error, 'ENOENT');
}

function isPermissionDenied(error: unknown): error is NodeJS.ErrnoException {
  return hasErrorCode(error, 'EPERM');
}

function hasErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
