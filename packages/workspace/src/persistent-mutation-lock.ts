import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface PersistentMutationLockOptions {
  readonly isProcessAlive?: (pid: number) => boolean | Promise<boolean>;
  readonly retryAttempts?: number;
  readonly retryDelayMs?: number;
  readonly onOwnerClaimed?: (claimPath: string, lockPath: string) => void | Promise<void>;
}

interface OwnerRecord {
  readonly token: string;
  readonly pid: number;
  readonly createdAt: string;
}

type LockState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'owned'; readonly owner: OwnerRecord }
  | {
      readonly kind: 'claim';
      readonly owner: OwnerRecord;
      readonly claimedAt: number;
      readonly fileName: string;
    }
  | { readonly kind: 'foreign' };

const ownerFileName = 'owner.json';
const defaultRetryAttempts = 100;
const defaultRetryDelayMs = 5;
const claimGraceMs = 30_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const claimNamePattern =
  /^claim-(\d+)-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/iu;

export async function withPersistentMutationLock<T>(
  path: string,
  options: PersistentMutationLockOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = join(dirname(path), `.${basename(path)}.mutation.lock`);
  const owner: OwnerRecord = {
    token: randomUUID(),
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };
  const attempts = options.retryAttempts ?? defaultRetryAttempts;
  const delayMs = options.retryDelayMs ?? defaultRetryDelayMs;
  await ensureDirectory(lockPath);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await readState(lockPath);
    if (state.kind === 'empty') {
      if (await createOwner(lockPath, owner)) {
        return runWithOwner(lockPath, owner, options, operation);
      }
      continue;
    }
    if (state.kind === 'owned') {
      if (!(await (options.isProcessAlive ?? defaultProcessLiveness)(state.owner.pid))) {
        const claim = await claimOwner(lockPath, state.owner);
        if (claim !== undefined) {
          await options.onOwnerClaimed?.(claim.path, lockPath);
          await removeClaim(claim.path, claim.owner, claim.claimedAt);
          continue;
        }
      }
    } else if (state.kind === 'claim' && Date.now() - state.claimedAt >= claimGraceMs) {
      if (await removeClaim(join(lockPath, state.fileName), state.owner, state.claimedAt)) {
        continue;
      }
    }
    await new Promise<void>((resolveRetry) => setTimeout(resolveRetry, delayMs));
  }
  throw new Error('Secret mutation lock is unavailable.');
}

async function ensureDirectory(lockPath: string): Promise<void> {
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error: unknown) {
    if (!isAlreadyPresent(error)) throw error;
  }
  const entry = await lstat(lockPath);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('Secret mutation lock must be a real directory.');
  }
}

async function createOwner(lockPath: string, owner: OwnerRecord): Promise<boolean> {
  const path = join(lockPath, ownerFileName);
  let file;
  try {
    file = await open(path, 'wx', 0o600);
  } catch (error: unknown) {
    if (isAlreadyPresent(error)) return false;
    throw error;
  }
  try {
    await file.writeFile(JSON.stringify(owner), 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
  const state = await readState(lockPath);
  if (state.kind !== 'owned' || !ownersEqual(state.owner, owner)) {
    throw new TypeError('Secret mutation lock ownership changed during acquisition.');
  }
  return true;
}

async function runWithOwner<T>(
  lockPath: string,
  owner: OwnerRecord,
  options: PersistentMutationLockOptions,
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
    const claim = await claimOwner(lockPath, owner);
    if (claim !== undefined) {
      await options.onOwnerClaimed?.(claim.path, lockPath);
      await removeClaim(claim.path, claim.owner, claim.claimedAt);
    }
  } catch (error: unknown) {
    cleanupError = error;
  }
  if (operationError !== undefined) throw operationError;
  if (cleanupError !== undefined) throw cleanupError;
  return result as T;
}

async function readState(lockPath: string, transientRetries = 4): Promise<LockState> {
  const directory = await lstat(lockPath);
  if (directory.isSymbolicLink() || !directory.isDirectory()) {
    throw new TypeError('Secret mutation lock must be a real directory.');
  }
  const entries = await readdir(lockPath, { withFileTypes: true });
  if (entries.length === 0) return { kind: 'empty' };
  if (entries.length !== 1) return { kind: 'foreign' };

  const entry = entries[0];
  if (entry.isSymbolicLink()) {
    throw new TypeError('Secret mutation owner must not be a symbolic link.');
  }
  if (!entry.isFile()) return { kind: 'foreign' };
  const path = join(lockPath, entry.name);
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      throw new TypeError('Secret mutation owner must not be a symbolic link.');
    }
    if (!metadata.isFile()) return { kind: 'foreign' };
    const owner = parseOwner(await readFile(path, 'utf8'));
    if (owner === undefined) return { kind: 'foreign' };
    if (entry.name === ownerFileName) return { kind: 'owned', owner };

    const claim = parseClaimName(entry.name);
    return claim !== undefined && claim.ownerToken === owner.token
      ? { kind: 'claim', owner, claimedAt: claim.claimedAt, fileName: entry.name }
      : { kind: 'foreign' };
  } catch (error: unknown) {
    if (isMissing(error) && transientRetries > 0) {
      return readState(lockPath, transientRetries - 1);
    }
    throw error;
  }
}

async function claimOwner(
  lockPath: string,
  expected: OwnerRecord,
): Promise<
  { readonly path: string; readonly owner: OwnerRecord; readonly claimedAt: number } | undefined
> {
  const state = await readState(lockPath);
  if (state.kind !== 'owned' || !ownersEqual(state.owner, expected)) return undefined;
  const claimedAt = Date.now();
  const path = join(lockPath, claimFileName(claimedAt, expected.token));
  try {
    await rename(join(lockPath, ownerFileName), path);
  } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const claimed = await readState(lockPath);
  return claimed.kind === 'claim' &&
    claimed.claimedAt === claimedAt &&
    ownersEqual(claimed.owner, expected)
    ? { path, owner: expected, claimedAt }
    : undefined;
}

async function removeClaim(
  path: string,
  expected: OwnerRecord,
  expectedClaimedAt: number,
): Promise<boolean> {
  const claim = parseClaimName(basename(path));
  if (
    claim === undefined ||
    claim.claimedAt !== expectedClaimedAt ||
    claim.ownerToken !== expected.token
  ) {
    return false;
  }
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) return false;
    const owner = parseOwner(await readFile(path, 'utf8'));
    if (owner === undefined || !ownersEqual(owner, expected)) return false;
    await unlink(path);
    return true;
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function parseOwner(value: string): OwnerRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isOwner(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isOwner(value: unknown): value is OwnerRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const owner = value as Partial<OwnerRecord>;
  return (
    Object.keys(value).length === 3 &&
    typeof owner.token === 'string' &&
    uuidPattern.test(owner.token) &&
    typeof owner.pid === 'number' &&
    Number.isSafeInteger(owner.pid) &&
    owner.pid > 0 &&
    typeof owner.createdAt === 'string' &&
    isCanonicalTimestamp(owner.createdAt)
  );
}

function ownersEqual(left: OwnerRecord, right: OwnerRecord): boolean {
  return left.token === right.token && left.pid === right.pid && left.createdAt === right.createdAt;
}

function claimFileName(claimedAt: number, ownerToken: string): string {
  return `claim-${claimedAt}-${ownerToken}.json`;
}

function parseClaimName(
  fileName: string,
): { readonly claimedAt: number; readonly ownerToken: string } | undefined {
  const match = claimNamePattern.exec(fileName);
  if (match === null) return undefined;
  const claimedAt = Number(match[1]);
  return Number.isSafeInteger(claimedAt) && claimedAt >= 0
    ? { claimedAt, ownerToken: match[2] }
    : undefined;
}

function isCanonicalTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
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

function isAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
