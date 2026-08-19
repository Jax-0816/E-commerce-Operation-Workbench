import { chmod, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  temporaryDirectories.push(directory);
  return directory;
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
});
