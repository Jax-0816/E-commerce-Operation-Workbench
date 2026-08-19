import { randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
} from 'node:fs/promises';
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
  readonly mutationLockRetryAttempts?: number;
  readonly mutationLockRetryDelayMs?: number;
}

const pathLocks = new Map<string, Promise<void>>();
const defaultMutationLockRetryAttempts = 100;
const defaultMutationLockRetryDelayMs = 5;
const defaultMutationLockStaleAfterMs = 30_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface MutationOwnerRecord {
  readonly token: string;
  readonly pid: number;
  readonly createdAt: string;
}

interface MutationLockMetadata {
  readonly device: number;
  readonly inode: number;
  readonly modifiedAtMs: number;
}

type MutationLockState =
  | { readonly kind: 'empty'; readonly directory: MutationLockMetadata }
  | {
      readonly kind: 'incomplete';
      readonly directory: MutationLockMetadata;
      readonly fileName: string;
      readonly fileModifiedAtMs: number;
      readonly content: string;
    }
  | {
      readonly kind: 'owned';
      readonly directory: MutationLockMetadata;
      readonly owner: MutationOwnerRecord;
    }
  | { readonly kind: 'foreign'; readonly directory: MutationLockMetadata };

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
  const owner: MutationOwnerRecord = {
    token: randomUUID(),
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };
  const retryAttempts = options.mutationLockRetryAttempts ?? defaultMutationLockRetryAttempts;
  const retryDelayMs = options.mutationLockRetryDelayMs ?? defaultMutationLockRetryDelayMs;
  for (let attempt = 0; attempt < retryAttempts; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
    } catch (error: unknown) {
      if (!isAlreadyPresent(error)) {
        throw error;
      }
      if (await recoverMutationLock(lockPath, options)) {
        continue;
      }
      await new Promise<void>((resolveRetry) => setTimeout(resolveRetry, retryDelayMs));
      continue;
    }

    try {
      await writeMutationOwner(lockPath, owner);
      return await runWithOwnedMutationLock(lockPath, owner, operation);
    } catch (error: unknown) {
      try {
        if (await removeMutationOwner(lockPath, owner)) {
          await removeEmptyMutationLock(lockPath);
        }
      } catch {
        // Preserve the original acquisition error and leave any foreign replacement untouched.
      }
      throw error;
    }
  }
  throw new Error('Secret mutation lock is unavailable.');
}

async function runWithOwnedMutationLock<T>(
  lockPath: string,
  owner: MutationOwnerRecord,
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
    if (await removeMutationOwner(lockPath, owner)) await removeEmptyMutationLock(lockPath);
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

async function writeMutationOwner(lockPath: string, owner: MutationOwnerRecord): Promise<void> {
  await assertMutationLockDirectory(lockPath);
  const file = await open(mutationOwnerPath(lockPath, owner.token), 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(owner));
    await file.sync();
  } finally {
    await file.close();
  }
  const state = await readMutationLockState(lockPath);
  if (state.kind !== 'owned' || !mutationOwnersEqual(state.owner, owner)) {
    throw new TypeError('Secret mutation lock ownership changed during acquisition.');
  }
}

async function recoverMutationLock(
  lockPath: string,
  options: FileSecretStoreOptions,
): Promise<boolean> {
  let state: MutationLockState;
  try {
    state = await readMutationLockState(lockPath);
  } catch (error: unknown) {
    if (isMissing(error)) return true;
    throw error;
  }
  if (state.kind === 'foreign') return false;

  if (state.kind === 'owned') {
    if (await (options.isProcessAlive ?? defaultProcessLiveness)(state.owner.pid)) {
      return false;
    }
    if (!(await removeMutationOwner(lockPath, state.owner))) return false;
    await removeEmptyMutationLock(lockPath);
    return true;
  }

  const lastModifiedAt =
    state.kind === 'empty'
      ? state.directory.modifiedAtMs
      : Math.max(state.directory.modifiedAtMs, state.fileModifiedAtMs);
  if (Date.now() - lastModifiedAt < defaultMutationLockStaleAfterMs) return false;

  if (state.kind === 'incomplete' && !(await removeIncompleteMutationOwner(lockPath, state))) {
    return false;
  }
  if (state.kind === 'empty' && !(await mutationLockStateMatches(lockPath, state))) {
    return false;
  }
  await removeEmptyMutationLock(lockPath);
  return true;
}

async function readMutationLockState(lockPath: string): Promise<MutationLockState> {
  const directory = await assertMutationLockDirectory(lockPath);
  const entries = await readdir(lockPath, { withFileTypes: true });
  if (entries.length === 0) return { kind: 'empty', directory };
  if (entries.length !== 1) return { kind: 'foreign', directory };

  const entry = entries[0];
  if (entry.isSymbolicLink()) {
    throw new TypeError('Secret mutation owner must not be a symbolic link.');
  }
  if (!entry.isFile()) return { kind: 'foreign', directory };

  const ownerPath = join(lockPath, entry.name);
  const ownerEntry = await lstat(ownerPath);
  if (ownerEntry.isSymbolicLink()) {
    throw new TypeError('Secret mutation owner must not be a symbolic link.');
  }
  if (!ownerEntry.isFile()) return { kind: 'foreign', directory };

  const fileToken = mutationOwnerTokenFromFileName(entry.name);
  if (fileToken === undefined) return { kind: 'foreign', directory };
  const content = await readFile(ownerPath, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return {
      kind: 'incomplete',
      directory,
      fileName: entry.name,
      fileModifiedAtMs: ownerEntry.mtimeMs,
      content,
    };
  }
  if (!isMutationOwnerRecord(value) || value.token !== fileToken) {
    return { kind: 'foreign', directory };
  }
  return { kind: 'owned', directory, owner: value };
}

async function removeMutationOwner(
  lockPath: string,
  expectedOwner: MutationOwnerRecord,
): Promise<boolean> {
  let first: MutationLockState;
  try {
    first = await readMutationLockState(lockPath);
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (
    first.kind !== 'owned' ||
    !mutationOwnersEqual(first.owner, expectedOwner) ||
    !(await mutationLockStateMatches(lockPath, first))
  ) {
    return false;
  }
  return claimAndRemoveMutationEntry(
    lockPath,
    `owner-${expectedOwner.token}.json`,
    async (claimPath) => mutationClaimContainsOwner(claimPath, expectedOwner),
  );
}

async function removeIncompleteMutationOwner(
  lockPath: string,
  expected: Extract<MutationLockState, { kind: 'incomplete' }>,
): Promise<boolean> {
  if (!(await mutationLockStateMatches(lockPath, expected))) return false;
  return claimAndRemoveMutationEntry(lockPath, expected.fileName, async (claimPath) =>
    mutationClaimContainsBytes(claimPath, expected.content),
  );
}

async function mutationLockStateMatches(
  lockPath: string,
  expected: MutationLockState,
): Promise<boolean> {
  let current: MutationLockState;
  try {
    current = await readMutationLockState(lockPath);
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (!mutationDirectoryMetadataMatches(current.directory, expected.directory)) return false;
  if (current.kind !== expected.kind) return false;
  if (current.kind === 'owned' && expected.kind === 'owned') {
    return mutationOwnersEqual(current.owner, expected.owner);
  }
  if (current.kind === 'incomplete' && expected.kind === 'incomplete') {
    return (
      current.fileName === expected.fileName &&
      current.fileModifiedAtMs === expected.fileModifiedAtMs &&
      current.content === expected.content
    );
  }
  return current.kind === 'empty' && expected.kind === 'empty';
}

async function claimAndRemoveMutationEntry(
  lockPath: string,
  sourceName: string,
  claimMatches: (claimPath: string) => Promise<boolean>,
): Promise<boolean> {
  const sourcePath = join(lockPath, sourceName);
  const claimPath = join(lockPath, `retire-${randomUUID()}.json`);
  try {
    await rename(sourcePath, claimPath);
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }

  if (await claimMatches(claimPath)) {
    await unlink(claimPath);
    return true;
  }
  await restoreForeignMutationClaim(claimPath, sourcePath);
  return false;
}

async function mutationClaimContainsOwner(
  claimPath: string,
  expectedOwner: MutationOwnerRecord,
): Promise<boolean> {
  const content = await readRegularMutationClaim(claimPath);
  if (content === undefined) return false;
  try {
    const value: unknown = JSON.parse(content);
    return isMutationOwnerRecord(value) && mutationOwnersEqual(value, expectedOwner);
  } catch {
    return false;
  }
}

async function mutationClaimContainsBytes(
  claimPath: string,
  expectedContent: string,
): Promise<boolean> {
  return (await readRegularMutationClaim(claimPath)) === expectedContent;
}

async function readRegularMutationClaim(claimPath: string): Promise<string | undefined> {
  try {
    const entry = await lstat(claimPath);
    if (entry.isSymbolicLink() || !entry.isFile()) return undefined;
    return readFile(claimPath, 'utf8');
  } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function restoreForeignMutationClaim(claimPath: string, sourcePath: string): Promise<void> {
  try {
    await link(claimPath, sourcePath);
    await unlink(claimPath);
  } catch (error: unknown) {
    if (!isAlreadyPresent(error) && !isMissing(error)) {
      // Leaving the claim in place prevents acquisition and preserves the foreign entry.
    }
  }
}

function mutationDirectoryMetadataMatches(
  current: MutationLockMetadata,
  expected: MutationLockMetadata,
): boolean {
  const bothIdentitiesAreUsable =
    current.device !== 0 && current.inode !== 0 && expected.device !== 0 && expected.inode !== 0;
  return (
    (!bothIdentitiesAreUsable ||
      (current.device === expected.device && current.inode === expected.inode)) &&
    current.modifiedAtMs === expected.modifiedAtMs
  );
}

async function removeEmptyMutationLock(lockPath: string): Promise<void> {
  let state: MutationLockState;
  try {
    state = await readMutationLockState(lockPath);
  } catch (error: unknown) {
    if (isMissing(error)) return;
    throw error;
  }
  if (state.kind !== 'empty') return;
  try {
    await rmdir(lockPath);
  } catch (error: unknown) {
    if (!isMissing(error) && !isNotEmpty(error)) throw error;
  }
}

async function assertMutationLockDirectory(lockPath: string): Promise<MutationLockMetadata> {
  const entry = await lstat(lockPath);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('Secret mutation lock must be a real directory.');
  }
  return { device: entry.dev, inode: entry.ino, modifiedAtMs: entry.mtimeMs };
}

function mutationOwnerPath(lockPath: string, token: string): string {
  return join(lockPath, `owner-${token}.json`);
}

function mutationOwnerTokenFromFileName(fileName: string): string | undefined {
  const match = /^owner-(.+)\.json$/u.exec(fileName);
  return match !== null && uuidPattern.test(match[1]) ? match[1] : undefined;
}

function isMutationOwnerRecord(value: unknown): value is MutationOwnerRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const owner = value as Partial<MutationOwnerRecord>;
  return (
    Object.keys(value).length === 3 &&
    typeof owner.token === 'string' &&
    uuidPattern.test(owner.token) &&
    typeof owner.pid === 'number' &&
    Number.isInteger(owner.pid) &&
    owner.pid > 0 &&
    typeof owner.createdAt === 'string' &&
    isCanonicalTimestamp(owner.createdAt)
  );
}

function isCanonicalTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function mutationOwnersEqual(left: MutationOwnerRecord, right: MutationOwnerRecord): boolean {
  return left.token === right.token && left.pid === right.pid && left.createdAt === right.createdAt;
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
