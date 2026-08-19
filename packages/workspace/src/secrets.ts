import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, join, parse, relative, resolve, sep } from 'node:path';

import { isPathContained } from './filesystem.js';

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

export interface FileSecretStoreOptions {
  readonly onTemporaryFileSynced?: (temporaryPath: string) => void | Promise<void>;
  readonly onBeforeMutation?: () => void | Promise<void>;
  readonly isProcessAlive?: (pid: number) => boolean | Promise<boolean>;
}

const pathLocks = new Map<string, Promise<void>>();

export class FileSecretStore implements SecretStore {
  readonly #filePath: string;
  readonly #options: FileSecretStoreOptions;

  constructor(workspacePath: string, options: FileSecretStoreOptions = {}) {
    this.#filePath = join(resolve(workspacePath), '.secrets.json');
    this.#options = options;
  }

  async get(key: string): Promise<string | undefined> {
    validateSecretKey(key);
    return (await this.readSecrets())[key];
  }

  async set(key: string, value: string): Promise<void> {
    validateSecretKey(key);
    await this.#options.onBeforeMutation?.();
    await withPathLock(this.#filePath, async () => {
      await ensureSafeDirectoryPath(dirname(this.#filePath));
      await withFilesystemMutationLock(this.#filePath, this.#options, async () => {
        const secrets = await this.readSecrets();
        secrets[key] = value;
        await this.writeSecrets(secrets);
      });
    });
  }

  async delete(key: string): Promise<void> {
    validateSecretKey(key);
    await this.#options.onBeforeMutation?.();
    await withPathLock(this.#filePath, async () => {
      await ensureSafeDirectoryPath(dirname(this.#filePath));
      await withFilesystemMutationLock(this.#filePath, this.#options, async () => {
        const secrets = await this.readSecrets();
        if (key in secrets) {
          delete secrets[key];
          await this.writeSecrets(secrets);
        }
      });
    });
  }

  async isConfigured(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  private async readSecrets(): Promise<Record<string, string>> {
    await validateExistingAncestors(dirname(this.#filePath));
    await assertRegularFileOrMissing(this.#filePath);
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
      if (isMissing(error)) {
        return {};
      }
      throw error;
    }
  }

  private async writeSecrets(secrets: Record<string, string>): Promise<void> {
    const directoryPath = dirname(this.#filePath);
    const trustedRoot = await ensureSafeDirectoryPath(directoryPath);
    await assertSafeDirectory(directoryPath, trustedRoot);
    await assertRegularFileOrMissing(this.#filePath);

    const temporaryPath = join(directoryPath, `.${basename(this.#filePath)}.${randomUUID()}.tmp`);
    let replaced = false;
    try {
      const temporaryFile = await open(temporaryPath, 'wx', 0o600);
      try {
        await temporaryFile.writeFile(`${JSON.stringify(secrets)}\n`, 'utf8');
        await temporaryFile.sync();
      } finally {
        await temporaryFile.close();
      }

      await this.#options.onTemporaryFileSynced?.(temporaryPath);
      await assertSafeDirectory(directoryPath, trustedRoot);
      await assertRegularFileOrMissing(this.#filePath);
      await rename(temporaryPath, this.#filePath);
      replaced = true;
      await syncDirectory(directoryPath);
    } finally {
      if (!replaced) {
        await rm(temporaryPath, { force: true });
      }
    }
  }
}

export async function createSecretConfigurationStatus(
  store: SecretStore,
  key: string,
): Promise<SecretConfigurationStatus> {
  validateSecretKey(key);
  return { key, configured: await store.isConfigured(key) };
}

async function withPathLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = pathLocks.get(path) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolveCurrent) => {
    release = resolveCurrent;
  });
  pathLocks.set(path, current);
  await previous;

  try {
    return await operation();
  } finally {
    release?.();
    if (pathLocks.get(path) === current) {
      pathLocks.delete(path);
    }
  }
}

async function withFilesystemMutationLock<T>(
  path: string,
  options: FileSecretStoreOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = join(dirname(path), `.${basename(path)}.mutation.lock`);
  const ownerToken = randomUUID();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      await writeMutationOwner(lockPath, ownerToken);
      return await runWithOwnedMutationLock(lockPath, ownerToken, operation);
    } catch (error: unknown) {
      if (!isAlreadyPresent(error)) {
        throw error;
      }
      const owner = await readMutationOwner(lockPath);
      if (
        owner !== undefined &&
        !(await (options.isProcessAlive ?? defaultProcessLiveness)(owner.pid))
      ) {
        if (await removeMutationOwner(lockPath, owner.token)) {
          await removeEmptyMutationLock(lockPath);
          continue;
        }
      }
      await new Promise<void>((resolveRetry) => setTimeout(resolveRetry, 5));
    }
  }
  throw new Error('Secret mutation lock is unavailable.');
}

async function runWithOwnedMutationLock<T>(
  lockPath: string,
  token: string,
  operation: () => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error: unknown) {
    operationError = error;
  }

  let cleanupError: unknown;
  try {
    if (await removeMutationOwner(lockPath, token)) await removeEmptyMutationLock(lockPath);
  } catch (error: unknown) {
    if (!isMissing(error) && !isNotEmpty(error)) {
      cleanupError = error;
    }
  }
  if (operationError !== undefined) {
    throw operationError;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  return result as T;
}

async function writeMutationOwner(lockPath: string, token: string): Promise<void> {
  const file = await open(join(lockPath, `owner-${token}.json`), 'wx', 0o600);
  try {
    await file.writeFile(
      JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
}
async function readMutationOwner(
  lockPath: string,
): Promise<{ token: string; pid: number } | undefined> {
  try {
    const names = await import('node:fs/promises').then(({ readdir }) => readdir(lockPath));
    const name = names.find((value) => value.startsWith('owner-') && value.endsWith('.json'));
    if (name === undefined) return undefined;
    const value: unknown = JSON.parse(await readFile(join(lockPath, name), 'utf8'));
    const owner = value as { token?: unknown; pid?: unknown };
    return typeof owner.token === 'string' && typeof owner.pid === 'number'
      ? { token: owner.token, pid: owner.pid }
      : undefined;
  } catch {
    return undefined;
  }
}
async function removeMutationOwner(lockPath: string, token: string): Promise<boolean> {
  try {
    await rm(join(lockPath, `owner-${token}.json`));
    return true;
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }
}
async function removeEmptyMutationLock(lockPath: string): Promise<void> {
  try {
    await rmdir(lockPath);
  } catch (error: unknown) {
    if (!isMissing(error) && !isNotEmpty(error)) throw error;
  }
}
function defaultProcessLiveness(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return !(
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ESRCH'
    );
  }
}

async function assertRegularFileOrMissing(path: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new TypeError('Secret storage must be a regular file.');
    }
  } catch (error: unknown) {
    if (isMissing(error)) {
      return;
    }
    throw error;
  }
}

async function ensureSafeDirectoryPath(path: string): Promise<string> {
  const rootPath = parse(path).root;
  const trustedRoot = await realpath(rootPath);
  await assertSafeDirectory(rootPath, trustedRoot);
  let currentPath = rootPath;
  for (const segment of relative(rootPath, path).split(sep).filter(Boolean)) {
    const nextPath = join(currentPath, segment);
    try {
      await assertSafeDirectory(nextPath, trustedRoot);
    } catch (error: unknown) {
      if (!isMissing(error)) {
        throw error;
      }
      await assertSafeDirectory(currentPath, trustedRoot);
      await mkdir(nextPath, { mode: 0o700 });
      await assertSafeDirectory(nextPath, trustedRoot);
    }
    currentPath = nextPath;
  }
  return trustedRoot;
}

async function validateExistingAncestors(path: string): Promise<void> {
  const rootPath = parse(path).root;
  const trustedRoot = await realpath(rootPath);
  let currentPath = rootPath;
  await assertSafeDirectory(currentPath, trustedRoot);
  for (const segment of relative(rootPath, path).split(sep).filter(Boolean)) {
    currentPath = join(currentPath, segment);
    try {
      await assertSafeDirectory(currentPath, trustedRoot);
    } catch (error: unknown) {
      if (isMissing(error)) {
        return;
      }
      throw error;
    }
  }
}

async function assertSafeDirectory(path: string, trustedRoot: string): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('Secret storage directory must not be a symbolic link.');
  }
  if (!isPathContained(trustedRoot, await realpath(path))) {
    throw new TypeError('Secret storage directory must remain inside its trusted root.');
  }
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const directory = await open(path, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error: unknown) {
    if (!isUnsupportedDirectorySync(error)) {
      throw error;
    }
  }
}

function validateSecretKey(key: string): void {
  if (key.trim().length === 0) {
    throw new TypeError('Secret keys must be non-empty.');
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isNotEmpty(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOTEMPTY' || error.code === 'EEXIST')
  );
}

function isUnsupportedDirectorySync(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EINVAL' || error.code === 'EPERM' || error.code === 'EISDIR')
  );
}
