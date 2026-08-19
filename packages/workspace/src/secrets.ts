import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  isConfigured(key: string): Promise<boolean>;
}

export interface SecretConfigurationStatus {
  readonly key: string;
  readonly configured: boolean;
}

export class FileSecretStore implements SecretStore {
  readonly #filePath: string;

  constructor(workspacePath: string) {
    this.#filePath = join(resolve(workspacePath), '.secrets.json');
  }

  async get(key: string): Promise<string | undefined> {
    validateSecretKey(key);
    return (await this.readSecrets())[key];
  }

  async set(key: string, value: string): Promise<void> {
    validateSecretKey(key);
    const secrets = await this.readSecrets();
    secrets[key] = value;
    await this.writeSecrets(secrets);
  }

  async delete(key: string): Promise<void> {
    validateSecretKey(key);
    const secrets = await this.readSecrets();
    if (key in secrets) {
      delete secrets[key];
      await this.writeSecrets(secrets);
    }
  }

  async isConfigured(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  private async readSecrets(): Promise<Record<string, string>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#filePath, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new TypeError('Secret store contents must be an object.');
      }

      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    } catch (error: unknown) {
      if (isFileMissing(error)) {
        return {};
      }
      throw error;
    }
  }

  private async writeSecrets(secrets: Record<string, string>): Promise<void> {
    await mkdir(resolve(this.#filePath, '..'), { recursive: true, mode: 0o700 });
    await writeFile(this.#filePath, `${JSON.stringify(secrets)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await chmod(this.#filePath, 0o600);
  }
}

export async function createSecretConfigurationStatus(
  store: SecretStore,
  key: string,
): Promise<SecretConfigurationStatus> {
  validateSecretKey(key);
  return { key, configured: await store.isConfigured(key) };
}

function validateSecretKey(key: string): void {
  if (key.trim().length === 0) {
    throw new TypeError('Secret keys must be non-empty.');
  }
}

function isFileMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
