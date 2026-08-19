import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { DomainError } from '@eaw/domain';

const lockDirectoryName = '.workspace.lock';
const retiredLockGraceMs = 30_000;
const retiredLockNamePattern =
  /^\.workspace\.lock\.retired-(\d+)-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface LockRecord {
  readonly ownerToken: string;
  readonly pid: number;
  readonly createdAt: string;
}

interface LockDirectoryIdentity {
  readonly device: number;
  readonly inode: number;
}

export interface AcquireWorkspaceLockOptions {
  readonly ownerToken?: string;
  readonly pid?: number;
  readonly isProcessAlive?: (pid: number) => boolean | Promise<boolean>;
  readonly onStaleOwnerObserved?: (record: Readonly<LockRecord>) => void | Promise<void>;
  readonly onBeforeLockDirectoryRemoval?: (lockPath: string) => void | Promise<void>;
  readonly onLockDirectoryRetired?: (retiredPath: string) => void | Promise<void>;
  readonly getLockDirectoryIdentity?: (
    lockPath: string,
  ) => Promise<{ device: number; inode: number }>;
}

export interface WorkspaceLock {
  readonly ownerToken: string;
  release(): Promise<void>;
}

export async function acquireWorkspaceLock(
  workspacePath: string,
  options: AcquireWorkspaceLockOptions = {},
): Promise<WorkspaceLock> {
  const lockPath = join(resolve(workspacePath), lockDirectoryName);
  const record: LockRecord = {
    ownerToken: options.ownerToken ?? randomUUID(),
    pid: options.pid ?? process.pid,
    createdAt: new Date().toISOString(),
  };
  const isProcessAlive = options.isProcessAlive ?? defaultProcessLiveness;

  await cleanupRetiredLockDirectories(lockPath);

  for (;;) {
    const createdLock = await createLockDirectory(
      lockPath,
      record,
      options.getLockDirectoryIdentity,
    );
    if (createdLock !== undefined) {
      return {
        ownerToken: record.ownerToken,
        release: async () => {
          await options.onBeforeLockDirectoryRemoval?.(lockPath);
          await retireLockDirectory(
            lockPath,
            record,
            createdLock,
            options.getLockDirectoryIdentity,
            options.onLockDirectoryRetired,
          );
        },
      };
    }

    const staleOwner = await readOwnerRecord(lockPath, options.getLockDirectoryIdentity);
    if (staleOwner === undefined || (await isProcessAlive(staleOwner.record.pid))) {
      throw lockedError();
    }

    await options.onStaleOwnerObserved?.(staleOwner.record);
    if (
      !(await retireLockDirectory(
        lockPath,
        staleOwner.record,
        staleOwner.identity,
        options.getLockDirectoryIdentity,
      ))
    ) {
      continue;
    }
  }
}

async function createLockDirectory(
  lockPath: string,
  record: LockRecord,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
): Promise<LockDirectoryIdentity | undefined> {
  try {
    await mkdir(lockPath);
  } catch (error: unknown) {
    if (isAlreadyPresent(error)) {
      return undefined;
    }
    throw error;
  }

  try {
    const identity = await assertLockDirectory(lockPath, getIdentity);
    const file = await open(ownerRecordPath(lockPath, record.ownerToken), 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(record), 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    return identity;
  } catch (error: unknown) {
    await removeEmptyLockDirectory(lockPath);
    throw error;
  }
}

async function readOwnerRecord(
  lockPath: string,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
): Promise<{ readonly record: LockRecord; readonly identity: LockDirectoryIdentity } | undefined> {
  let ownerFileName: string;
  const identity = await assertLockDirectory(lockPath, getIdentity);
  try {
    const entries = await readdir(lockPath, { withFileTypes: true });
    if (
      entries.length !== 1 ||
      !entries[0].isFile() ||
      entries[0].isSymbolicLink() ||
      !entries[0].name.startsWith('owner-') ||
      !entries[0].name.endsWith('.json')
    ) {
      return undefined;
    }
    ownerFileName = entries[0].name;
  } catch {
    return undefined;
  }

  try {
    const ownerPath = join(lockPath, ownerFileName);
    const entry = await lstat(ownerPath);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      return undefined;
    }
    const content = await readFile(ownerPath, 'utf8');
    const record = parseLockRecord(content);
    return record !== undefined && ownerFileName === ownerRecordFileName(record.ownerToken)
      ? { record, identity }
      : undefined;
  } catch {
    return undefined;
  }
}

async function retireLockDirectory(
  lockPath: string,
  expectedRecord: LockRecord,
  expectedIdentity: LockDirectoryIdentity,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
  onRetired?: (retiredPath: string) => void | Promise<void>,
): Promise<boolean> {
  if (!(await ownsLockRecord(lockPath, expectedRecord, expectedIdentity, getIdentity))) {
    return false;
  }
  const exactRecord = await readExactLockRecord(lockPath);
  if (exactRecord === undefined || !lockRecordsEqual(exactRecord, expectedRecord)) return false;
  const retiredPath = join(
    dirname(lockPath),
    `${basename(lockPath)}.retired-${Date.now()}-${randomUUID()}`,
  );
  try {
    await rename(lockPath, retiredPath);
  } catch (error: unknown) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }

  await onRetired?.(retiredPath);
  const retiredRecord = await readExactLockRecord(retiredPath);
  if (retiredRecord === undefined || !lockRecordsEqual(retiredRecord, expectedRecord)) {
    return false;
  }
  await removeValidatedRetiredLockDirectory(retiredPath, retiredRecord);
  return true;
}

async function removeEmptyLockDirectory(
  lockPath: string,
  expectedIdentity?: LockDirectoryIdentity,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
): Promise<void> {
  if (expectedIdentity !== undefined) {
    assertCompatibleIdentity(expectedIdentity, await assertLockDirectory(lockPath, getIdentity));
  }
  try {
    await rmdir(lockPath);
  } catch (error: unknown) {
    if (isMissing(error) || isNotEmpty(error)) {
      return;
    }
    throw error;
  }
}

async function assertLockDirectory(
  lockPath: string,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
): Promise<LockDirectoryIdentity> {
  const entry = await lstat(lockPath);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('Workspace lock path must be a real directory.');
  }
  return getIdentity === undefined
    ? { device: entry.dev, inode: entry.ino }
    : getIdentity(lockPath);
}

function isVerifiable(identity: LockDirectoryIdentity): boolean {
  return identity.device !== 0 && identity.inode !== 0;
}

function assertCompatibleIdentity(
  expected: LockDirectoryIdentity,
  current: LockDirectoryIdentity,
): void {
  if (
    isVerifiable(expected) &&
    isVerifiable(current) &&
    (expected.device !== current.device || expected.inode !== current.inode)
  ) {
    throw new TypeError('Workspace lock directory changed ownership.');
  }
}

async function ownsLockRecord(
  lockPath: string,
  expectedRecord: LockRecord,
  expectedIdentity: LockDirectoryIdentity,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
): Promise<boolean> {
  let currentIdentity: LockDirectoryIdentity;
  try {
    currentIdentity = await assertLockDirectory(lockPath, getIdentity);
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }
  assertCompatibleIdentity(expectedIdentity, currentIdentity);

  const path = ownerRecordPath(lockPath, expectedRecord.ownerToken);
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new TypeError('Workspace lock owner must be a real regular file.');
    }
    const currentRecord = parseLockRecord(await readFile(path, 'utf8'));
    return currentRecord !== undefined && lockRecordsEqual(currentRecord, expectedRecord);
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function lockRecordsEqual(left: LockRecord, right: LockRecord): boolean {
  return (
    left.ownerToken === right.ownerToken &&
    left.pid === right.pid &&
    left.createdAt === right.createdAt
  );
}

async function readExactLockRecord(lockPath: string): Promise<LockRecord | undefined> {
  try {
    const directory = await lstat(lockPath);
    if (directory.isSymbolicLink() || !directory.isDirectory()) return undefined;
    const entries = await readdir(lockPath, { withFileTypes: true });
    if (
      entries.length !== 1 ||
      entries[0].isSymbolicLink() ||
      !entries[0].isFile() ||
      !entries[0].name.startsWith('owner-') ||
      !entries[0].name.endsWith('.json')
    ) {
      return undefined;
    }
    const ownerPath = join(lockPath, entries[0].name);
    const owner = await lstat(ownerPath);
    if (owner.isSymbolicLink() || !owner.isFile()) return undefined;
    const record = parseLockRecord(await readFile(ownerPath, 'utf8'));
    return record !== undefined && entries[0].name === ownerRecordFileName(record.ownerToken)
      ? record
      : undefined;
  } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function removeValidatedRetiredLockDirectory(
  retiredPath: string,
  expectedRecord: LockRecord,
): Promise<void> {
  const current = await readExactLockRecord(retiredPath);
  if (current === undefined || !lockRecordsEqual(current, expectedRecord)) return;
  try {
    await unlink(ownerRecordPath(retiredPath, expectedRecord.ownerToken));
  } catch (error: unknown) {
    if (!isMissing(error)) throw error;
    return;
  }
  try {
    await rmdir(retiredPath);
  } catch (error: unknown) {
    if (!isMissing(error) && !isNotEmpty(error)) throw error;
  }
}

async function cleanupRetiredLockDirectories(lockPath: string): Promise<void> {
  const parentPath = dirname(lockPath);
  let entries;
  try {
    entries = await readdir(parentPath, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissing(error)) return;
    throw error;
  }

  for (const entry of entries) {
    const match = retiredLockNamePattern.exec(entry.name);
    if (match === null || entry.isSymbolicLink() || !entry.isDirectory()) continue;
    const retiredAt = Number(match[1]);
    if (
      !Number.isSafeInteger(retiredAt) ||
      retiredAt < 0 ||
      Date.now() - retiredAt < retiredLockGraceMs
    ) {
      continue;
    }
    const retiredPath = join(parentPath, entry.name);
    const record = await readExactLockRecord(retiredPath);
    if (record !== undefined) {
      await removeValidatedRetiredLockDirectory(retiredPath, record);
    } else if (await isEmptyRealDirectory(retiredPath)) {
      try {
        await rmdir(retiredPath);
      } catch (error: unknown) {
        if (!isMissing(error) && !isNotEmpty(error)) throw error;
      }
    }
  }
}

async function isEmptyRealDirectory(path: string): Promise<boolean> {
  try {
    const entry = await lstat(path);
    return !entry.isSymbolicLink() && entry.isDirectory() && (await readdir(path)).length === 0;
  } catch (error: unknown) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function parseLockRecord(value: string): LockRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isLockRecord(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function isLockRecord(value: unknown): value is LockRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Partial<LockRecord>;
  return (
    Object.keys(value).length === 3 &&
    typeof record.ownerToken === 'string' &&
    record.ownerToken.length > 0 &&
    typeof record.pid === 'number' &&
    Number.isInteger(record.pid) &&
    record.pid >= 0 &&
    typeof record.createdAt === 'string' &&
    !Number.isNaN(Date.parse(record.createdAt))
  );
}

function ownerRecordPath(lockPath: string, ownerToken: string): string {
  return join(lockPath, ownerRecordFileName(ownerToken));
}

function ownerRecordFileName(ownerToken: string): string {
  return `owner-${encodeURIComponent(ownerToken)}.json`;
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

function lockedError(): DomainError {
  return new DomainError('WORKSPACE_LOCKED', 'A workspace writer lock is already present.');
}

function isAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isNotEmpty(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOTEMPTY' || error.code === 'EEXIST')
  );
}
