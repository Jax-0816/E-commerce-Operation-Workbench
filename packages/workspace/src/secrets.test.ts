import { fork, type ChildProcess } from 'node:child_process';
import { chmod, mkdtemp, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises';
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
