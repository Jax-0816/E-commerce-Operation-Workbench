import { open, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { DomainError } from '@eaw/domain';

const lockFilename = '.workspace.lock';

interface LockRecord {
  readonly ownerToken: string;
  readonly pid: number;
  readonly createdAt: string;
}

export interface AcquireWorkspaceLockOptions {
  readonly ownerToken?: string;
  readonly pid?: number;
  readonly isProcessAlive?: (pid: number) => boolean | Promise<boolean>;
}

export interface WorkspaceLock {
  readonly ownerToken: string;
  release(): Promise<void>;
}

export async function acquireWorkspaceLock(
  workspacePath: string,
  options: AcquireWorkspaceLockOptions = {},
): Promise<WorkspaceLock> {
  const lockPath = join(resolve(workspacePath), lockFilename);
  const record: LockRecord = {
    ownerToken: options.ownerToken ?? randomUUID(),
    pid: options.pid ?? process.pid,
    createdAt: new Date().toISOString(),
  };
  const isProcessAlive = options.isProcessAlive ?? defaultProcessLiveness;

  if (!(await createLock(lockPath, record))) {
    const existingRecord = await readLock(lockPath);
    if (existingRecord === undefined || (await isProcessAlive(existingRecord.pid))) {
      throw lockedError();
    }

    await deleteLockIfUnchanged(lockPath, existingRecord);
    if (!(await createLock(lockPath, record))) {
      throw lockedError();
    }
  }

  return {
    ownerToken: record.ownerToken,
    release: async () => deleteLockIfOwned(lockPath, record.ownerToken),
  };
}

async function createLock(lockPath: string, record: LockRecord): Promise<boolean> {
  try {
    const file = await open(lockPath, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(record), 'utf8');
    } finally {
      await file.close();
    }
    return true;
  } catch (error: unknown) {
    if (isFileAlreadyPresent(error)) {
      return false;
    }
    throw error;
  }
}

async function readLock(lockPath: string): Promise<LockRecord | undefined> {
  try {
    return parseLockRecord(await readFile(lockPath, 'utf8'));
  } catch (error: unknown) {
    if (isFileMissing(error)) {
      return undefined;
    }
    return undefined;
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

async function deleteLockIfUnchanged(lockPath: string, expected: LockRecord): Promise<void> {
  const current = await readLock(lockPath);
  if (!sameLock(current, expected)) {
    throw lockedError();
  }

  try {
    await unlink(lockPath);
  } catch (error: unknown) {
    if (!isFileMissing(error)) {
      throw error;
    }
  }
}

async function deleteLockIfOwned(lockPath: string, ownerToken: string): Promise<void> {
  const current = await readLock(lockPath);
  if (current?.ownerToken !== ownerToken) {
    return;
  }

  try {
    await unlink(lockPath);
  } catch (error: unknown) {
    if (!isFileMissing(error)) {
      throw error;
    }
  }
}

function sameLock(left: LockRecord | undefined, right: LockRecord): boolean {
  return (
    left?.ownerToken === right.ownerToken &&
    left.pid === right.pid &&
    left.createdAt === right.createdAt
  );
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

function isFileAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isFileMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
