import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { DomainError } from '@eaw/domain';

const lockDirectoryName = '.workspace.lock';

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

  for (;;) {
    const createdLock = await createLockDirectory(lockPath, record);
    if (createdLock !== undefined) {
      return {
        ownerToken: record.ownerToken,
        release: async () => {
          if (!(await removeOwnerRecord(lockPath, record.ownerToken, createdLock))) {
            return;
          }
          await options.onBeforeLockDirectoryRemoval?.(lockPath);
          await removeEmptyLockDirectory(lockPath, createdLock);
        },
      };
    }

    const staleOwner = await readOwnerRecord(lockPath);
    if (staleOwner === undefined || (await isProcessAlive(staleOwner.record.pid))) {
      throw lockedError();
    }

    await options.onStaleOwnerObserved?.(staleOwner.record);
    if (!(await removeOwnerRecord(lockPath, staleOwner.record.ownerToken, staleOwner.identity))) {
      continue;
    }
    await removeEmptyLockDirectory(lockPath, staleOwner.identity);
  }
}

async function createLockDirectory(
  lockPath: string,
  record: LockRecord,
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
    const identity = await assertLockDirectory(lockPath);
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
): Promise<{ readonly record: LockRecord; readonly identity: LockDirectoryIdentity } | undefined> {
  let ownerFileName: string;
  const identity = await assertLockDirectory(lockPath);
  try {
    const ownerFiles = (await readdir(lockPath)).filter(
      (entry) => entry.startsWith('owner-') && entry.endsWith('.json'),
    );
    if (ownerFiles.length !== 1) {
      return undefined;
    }
    ownerFileName = ownerFiles[0];
  } catch {
    return undefined;
  }

  try {
    const content = await readFile(join(lockPath, ownerFileName), 'utf8');
    const record = parseLockRecord(content);
    return record !== undefined && ownerFileName === ownerRecordFileName(record.ownerToken)
      ? { record, identity }
      : undefined;
  } catch {
    return undefined;
  }
}

async function removeOwnerRecord(
  lockPath: string,
  ownerToken: string,
  expectedIdentity: LockDirectoryIdentity,
): Promise<boolean> {
  assertSameIdentity(expectedIdentity, await assertLockDirectory(lockPath));
  try {
    await unlink(ownerRecordPath(lockPath, ownerToken));
    return true;
  } catch (error: unknown) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

async function removeEmptyLockDirectory(
  lockPath: string,
  expectedIdentity?: LockDirectoryIdentity,
): Promise<void> {
  if (expectedIdentity !== undefined) {
    assertSameIdentity(expectedIdentity, await assertLockDirectory(lockPath));
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

async function assertLockDirectory(lockPath: string): Promise<LockDirectoryIdentity> {
  const entry = await lstat(lockPath);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('Workspace lock path must be a real directory.');
  }
  return { device: entry.dev, inode: entry.ino };
}

function assertSameIdentity(expected: LockDirectoryIdentity, current: LockDirectoryIdentity): void {
  if (expected.device !== current.device || expected.inode !== current.inode) {
    throw new TypeError('Workspace lock directory changed ownership.');
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
