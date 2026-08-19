import { chmod, mkdtemp, stat, writeFile } from 'node:fs/promises';
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
});
