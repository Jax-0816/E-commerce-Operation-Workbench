import { fork, type ChildProcess } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createSecretConfigurationStatus, FileSecretStore } from './index.js';

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
  const directory = await mkdtemp(join(tmpdir(), 'eaw-secrets-'));
  const physicalDirectory = await realpath(directory);
  temporaryDirectories.push(physicalDirectory);
  return physicalDirectory;
}

const deadOwnerToken = '00000000-0000-4000-8000-000000000001';
const decoyFileToken = '00000000-0000-4000-8000-000000000002';

function mutationLockPath(workspacePath: string): string {
  return join(workspacePath, '..secrets.json.mutation.lock');
}

async function makeMutationLockOld(lockPath: string, ownerPath?: string): Promise<void> {
  const old = new Date(Date.now() - 60_000);
  if (ownerPath !== undefined) {
    await utimes(ownerPath, old, old);
  }
  await utimes(lockPath, old, old);
}

async function writeMutationOwnerFixture(
  workspacePath: string,
  fileToken: string,
  record: { token: string; pid: number; createdAt: string },
): Promise<string> {
  const lockPath = mutationLockPath(workspacePath);
  await mkdir(lockPath);
  const ownerPath = join(lockPath, `owner-${fileToken}.json`);
  await writeFile(ownerPath, JSON.stringify(record), 'utf8');
  return ownerPath;
}

async function createMutationWorker(workspacePath: string): Promise<string> {
  const workerPath = join(workspacePath, 'secret-mutation-worker.mjs');
  const moduleUrl = pathToFileURL(join(process.cwd(), 'dist', 'index.js')).href;
  await writeFile(
    workerPath,
    [
      `import { FileSecretStore } from ${JSON.stringify(moduleUrl)};`,
      'const [workspacePath, key, value] = process.argv.slice(2);',
      'const store = new FileSecretStore(workspacePath, {',
      '  onBeforeMutation: () => new Promise((resolve) => {',
      "    process.send?.('ready');",
      "    process.once('message', (message) => { if (message === 'continue') resolve(); });",
      '  }),',
      '});',
      'try {',
      '  await store.set(key, value);',
      "  process.send?.('done');",
      '} catch (error) {',
      '  process.send?.({ error: error instanceof Error ? error.message : String(error) });',
      '  process.exitCode = 1;',
      '}',
    ].join('\n'),
    'utf8',
  );
  return workerPath;
}

function waitForWorkerMessage(worker: ChildProcess, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: unknown): void => {
      if (typeof message === 'object' && message !== null && 'error' in message) {
        cleanup();
        reject(new Error(`Secret worker failed: ${String(message.error)}`));
        return;
      }
      if (message === expected) {
        cleanup();
        resolve();
      }
    };
    const onExit = (code: number | null): void => {
      cleanup();
      reject(new Error(`Secret worker exited before ${expected}: ${code ?? 'signal'}.`));
    };
    const cleanup = (): void => {
      worker.off('message', onMessage);
      worker.off('exit', onExit);
    };
    worker.on('message', onMessage);
    worker.once('exit', onExit);
  });
}

describe('file secret store', () => {
  it('sets, reads, detects, and deletes a secret with real local storage', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const store = new FileSecretStore(workspacePath);

    expect(await store.isConfigured('deepseek-api-key')).toBe(false);
    await store.set('deepseek-api-key', 'secret-value');
    expect(await store.isConfigured('deepseek-api-key')).toBe(true);
    expect(await store.get('deepseek-api-key')).toBe('secret-value');
    await store.delete('deepseek-api-key');
    expect(await store.isConfigured('deepseek-api-key')).toBe(false);
    expect(await store.get('deepseek-api-key')).toBeUndefined();
  });

  it('returns a browser-safe configuration status without exposing the secret value', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const store = new FileSecretStore(workspacePath);
    await store.set('deepseek-api-key', 'secret-value-that-must-not-reach-a-dto');

    const status = await createSecretConfigurationStatus(store, 'deepseek-api-key');

    expect(status).toEqual({ key: 'deepseek-api-key', configured: true });
    expect(JSON.stringify(status)).not.toContain('secret-value-that-must-not-reach-a-dto');
  });

  it('writes the secret file with owner-only permissions on POSIX systems', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const store = new FileSecretStore(workspacePath);
    await store.set('deepseek-api-key', 'secret-value');

    expect((await stat(join(workspacePath, '.secrets.json'))).mode & 0o777).toBe(0o600);
  });

  it('restores owner-only permissions when updating an existing secret file on POSIX systems', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const filePath = join(workspacePath, '.secrets.json');
    await writeFile(filePath, '{"deepseek-api-key":"old-secret"}\n', 'utf8');
    await chmod(filePath, 0o644);

    await new FileSecretStore(workspacePath).set('deepseek-api-key', 'updated-secret');

    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it('keeps existing permissive secret bytes unchanged until an atomic replacement is ready', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const filePath = join(workspacePath, '.secrets.json');
    await writeFile(filePath, '{"deepseek-api-key":"old-secret"}\n', 'utf8');
    await chmod(filePath, 0o644);
    let bytesBeforeReplace = '';

    await new FileSecretStore(workspacePath, {
      onTemporaryFileSynced: async () => {
        bytesBeforeReplace = await readFile(filePath, 'utf8');
      },
    }).set('deepseek-api-key', 'new-secret');

    expect(bytesBeforeReplace).toBe('{"deepseek-api-key":"old-secret"}\n');
    expect(await readFile(filePath, 'utf8')).toContain('new-secret');
  });

  it('rejects a symbolic secret file without changing its outside target', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = join(workspacePath, 'outside-secrets.json');
    await writeFile(outsidePath, '{"deepseek-api-key":"outside-secret"}\n', 'utf8');
    await symlink(outsidePath, join(workspacePath, '.secrets.json'));

    await expect(
      new FileSecretStore(workspacePath).set('deepseek-api-key', 'new-secret'),
    ).rejects.toThrow(TypeError);
    await expect(readFile(outsidePath, 'utf8')).resolves.toBe(
      '{"deepseek-api-key":"outside-secret"}\n',
    );
  });

  it('serializes concurrent secret mutations without losing valid JSON', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const store = new FileSecretStore(workspacePath);

    await Promise.all([
      store.set('first-key', 'first-secret'),
      store.set('second-key', 'second-secret'),
      store.delete('first-key'),
    ]);

    expect(await store.get('first-key')).toBeUndefined();
    expect(await store.get('second-key')).toBe('second-secret');
    expect(JSON.parse(await readFile(join(workspacePath, '.secrets.json'), 'utf8'))).toEqual({
      'second-key': 'second-secret',
    });
  });

  it('creates a new nested workspace before acquiring its secret mutation lock', async () => {
    const rootPath = await createTemporaryWorkspace();
    const workspacePath = join(rootPath, 'new', 'nested', 'workspace');

    await new FileSecretStore(workspacePath).set('deepseek-api-key', 'new-secret');

    await expect(readFile(join(workspacePath, '.secrets.json'), 'utf8')).resolves.toContain(
      'new-secret',
    );
  });

  it('recovers an old empty mutation lock left by a crash before owner creation', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = mutationLockPath(workspacePath);
    await mkdir(lockPath);
    await makeMutationLockOld(lockPath);

    await new FileSecretStore(workspacePath).set('deepseek-api-key', 'recovered-secret');

    await expect(readFile(join(workspacePath, '.secrets.json'), 'utf8')).resolves.toContain(
      'recovered-secret',
    );
  });

  it('does not steal a fresh empty mutation lock from an owner still creating its record', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = mutationLockPath(workspacePath);
    await mkdir(lockPath);

    await expect(
      new FileSecretStore(workspacePath, {
        mutationLockRetryAttempts: 1,
        mutationLockRetryDelayMs: 0,
      }).set('deepseek-api-key', 'new-secret'),
    ).rejects.toThrow('Secret mutation lock is unavailable.');
    await expect(readdir(lockPath)).resolves.toEqual([]);
  });

  it('recovers an old incomplete owner record left by a crash during owner creation', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const lockPath = mutationLockPath(workspacePath);
    await mkdir(lockPath);
    const ownerPath = join(lockPath, `owner-${deadOwnerToken}.json`);
    await writeFile(ownerPath, '{"token":', 'utf8');
    await makeMutationLockOld(lockPath, ownerPath);

    await new FileSecretStore(workspacePath).set('deepseek-api-key', 'recovered-secret');

    await expect(readFile(join(workspacePath, '.secrets.json'), 'utf8')).resolves.toContain(
      'recovered-secret',
    );
  });

  it('rejects a symbolic mutation lock without touching its outside target', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    const outsideLockPath = join(outsidePath, 'foreign-mutation-lock');
    await mkdir(outsideLockPath);
    await writeFile(join(outsideLockPath, 'foreign.txt'), 'outside-lock', 'utf8');
    await symlink(outsideLockPath, mutationLockPath(workspacePath));

    await expect(
      new FileSecretStore(workspacePath).set('deepseek-api-key', 'new-secret'),
    ).rejects.toThrow(TypeError);
    await expect(readFile(join(outsideLockPath, 'foreign.txt'), 'utf8')).resolves.toBe(
      'outside-lock',
    );
  });

  it('treats a filename-token mismatch as foreign and never probes or deletes it', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const ownerPath = await writeMutationOwnerFixture(workspacePath, decoyFileToken, {
      token: deadOwnerToken,
      pid: 101,
      createdAt: '2026-08-19T00:00:00.000Z',
    });
    let livenessChecks = 0;

    await expect(
      new FileSecretStore(workspacePath, {
        isProcessAlive: () => {
          livenessChecks += 1;
          return false;
        },
        mutationLockRetryAttempts: 1,
        mutationLockRetryDelayMs: 0,
      }).set('deepseek-api-key', 'new-secret'),
    ).rejects.toThrow('Secret mutation lock is unavailable.');

    expect(livenessChecks).toBe(0);
    await expect(readFile(ownerPath, 'utf8')).resolves.toContain(deadOwnerToken);
  });

  it('does not steal a strictly valid mutation lock from a live owner', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const ownerPath = await writeMutationOwnerFixture(workspacePath, deadOwnerToken, {
      token: deadOwnerToken,
      pid: 101,
      createdAt: '2026-08-19T00:00:00.000Z',
    });

    await expect(
      new FileSecretStore(workspacePath, {
        isProcessAlive: () => true,
        mutationLockRetryAttempts: 1,
        mutationLockRetryDelayMs: 0,
      }).set('deepseek-api-key', 'new-secret'),
    ).rejects.toThrow('Secret mutation lock is unavailable.');
    await expect(readFile(ownerPath, 'utf8')).resolves.toContain(deadOwnerToken);
  });

  it('recovers a strictly valid mutation lock from a dead owner', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeMutationOwnerFixture(workspacePath, deadOwnerToken, {
      token: deadOwnerToken,
      pid: 101,
      createdAt: '2026-08-19T00:00:00.000Z',
    });

    await new FileSecretStore(workspacePath, { isProcessAlive: () => false }).set(
      'deepseek-api-key',
      'recovered-secret',
    );

    await expect(readFile(join(workspacePath, '.secrets.json'), 'utf8')).resolves.toContain(
      'recovered-secret',
    );
    await expect(readdir(workspacePath)).resolves.not.toContain('..secrets.json.mutation.lock');
  });

  it('rejects a symbolic mutation owner without reading or deleting its target', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    const outsideOwnerPath = join(outsidePath, 'foreign-owner.json');
    await writeFile(
      outsideOwnerPath,
      JSON.stringify({
        token: deadOwnerToken,
        pid: 101,
        createdAt: '2026-08-19T00:00:00.000Z',
      }),
      'utf8',
    );
    const lockPath = mutationLockPath(workspacePath);
    await mkdir(lockPath);
    await symlink(outsideOwnerPath, join(lockPath, `owner-${deadOwnerToken}.json`));

    await expect(
      new FileSecretStore(workspacePath, { isProcessAlive: () => false }).set(
        'deepseek-api-key',
        'new-secret',
      ),
    ).rejects.toThrow(TypeError);
    await expect(readFile(outsideOwnerPath, 'utf8')).resolves.toContain(deadOwnerToken);
  });

  it('serializes two child-process mutations with a filesystem lock', async () => {
    const workspacePath = await createTemporaryWorkspace();
    const workerPath = await createMutationWorker(workspacePath);
    const first = fork(workerPath, [workspacePath, 'first-key', 'first-secret'], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const second = fork(workerPath, [workspacePath, 'second-key', 'second-secret'], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    await Promise.all([
      waitForWorkerMessage(first, 'ready'),
      waitForWorkerMessage(second, 'ready'),
    ]);
    first.send('continue');
    second.send('continue');
    await Promise.all([waitForWorkerMessage(first, 'done'), waitForWorkerMessage(second, 'done')]);

    expect(JSON.parse(await readFile(join(workspacePath, '.secrets.json'), 'utf8'))).toEqual({
      'first-key': 'first-secret',
      'second-key': 'second-secret',
    });
  });

  it('rejects a workspace whose secret-file ancestor is a symbolic link', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const rootPath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    await symlink(outsidePath, join(rootPath, 'linked-ancestor'));

    await expect(
      new FileSecretStore(join(rootPath, 'linked-ancestor', 'new-workspace')).set(
        'deepseek-api-key',
        'new-secret',
      ),
    ).rejects.toThrow(TypeError);
    await expect(
      readFile(join(outsidePath, 'new-workspace', '.secrets.json'), 'utf8'),
    ).rejects.toThrow();
  });
});
