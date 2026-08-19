import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { DomainError } from '@eaw/domain';

const lockDirectoryName = '.workspace.lock';
const ownerFileName = 'owner.json';
const claimGraceMs = 30_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const claimNamePattern =
  /^claim-(\d+)-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/iu;

interface LockRecord {
  readonly ownerToken: string;
  readonly pid: number;
  readonly createdAt: string;
}

interface LockDirectoryIdentity {
  readonly device: number;
  readonly inode: number;
}

type LockState =
  | { readonly kind: 'empty'; readonly identity: LockDirectoryIdentity }
  | {
      readonly kind: 'owned';
      readonly identity: LockDirectoryIdentity;
      readonly record: LockRecord;
    }
  | {
      readonly kind: 'claim';
      readonly identity: LockDirectoryIdentity;
      readonly record: LockRecord;
      readonly claimedAt: number;
      readonly fileName: string;
    }
  | { readonly kind: 'foreign'; readonly identity: LockDirectoryIdentity };

export interface AcquireWorkspaceLockOptions {
  readonly ownerToken?: string;
  readonly pid?: number;
  readonly isProcessAlive?: (pid: number) => boolean | Promise<boolean>;
  readonly onStaleOwnerObserved?: (record: Readonly<LockRecord>) => void | Promise<void>;
  readonly onBeforeLockDirectoryRemoval?: (lockPath: string) => void | Promise<void>;
  readonly onOwnerRecordClaimed?: (claimPath: string, lockPath: string) => void | Promise<void>;
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
  if (!isLockRecord(record)) {
    throw new TypeError('Workspace lock owner must use a canonical UUID, PID, and timestamp.');
  }
  const isProcessAlive = options.isProcessAlive ?? defaultProcessLiveness;

  await ensureLockDirectory(lockPath, options.getLockDirectoryIdentity);
  for (;;) {
    const state = await readLockState(lockPath, options.getLockDirectoryIdentity);
    if (state.kind === 'empty') {
      if (!(await createOwner(lockPath, record))) continue;
      return createWorkspaceLock(lockPath, record, state.identity, options);
    }
    if (state.kind === 'foreign') throw lockedError();
    if (state.kind === 'claim') {
      if (!(await recoverAgedClaim(lockPath, state))) throw lockedError();
      continue;
    }
    if (await isProcessAlive(state.record.pid)) throw lockedError();

    await options.onStaleOwnerObserved?.(state.record);
    const claim = await claimOwner(lockPath, state.record, state.identity);
    if (claim === undefined) continue;
    await removeValidatedClaim(claim.path, claim.record, claim.claimedAt);
  }
}

function createWorkspaceLock(
  lockPath: string,
  record: LockRecord,
  identity: LockDirectoryIdentity,
  options: AcquireWorkspaceLockOptions,
): WorkspaceLock {
  return {
    ownerToken: record.ownerToken,
    release: async () => {
      await options.onBeforeLockDirectoryRemoval?.(lockPath);
      const claim = await claimOwner(lockPath, record, identity, options.getLockDirectoryIdentity);
      if (claim === undefined) return;
      await options.onOwnerRecordClaimed?.(claim.path, lockPath);
      await removeValidatedClaim(claim.path, claim.record, claim.claimedAt);
    },
  };
}

async function ensureLockDirectory(
  lockPath: string,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
): Promise<void> {
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error: unknown) {
    if (!isAlreadyPresent(error)) throw error;
  }
  await assertLockDirectory(lockPath, getIdentity);
}

async function createOwner(lockPath: string, record: LockRecord): Promise<boolean> {
  const ownerPath = join(lockPath, ownerFileName);
  let file;
  try {
    file = await open(ownerPath, 'wx', 0o600);
  } catch (error: unknown) {
    if (isAlreadyPresent(error)) return false;
    throw error;
  }
  try {
    await file.writeFile(JSON.stringify(record), 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
  const state = await readLockState(lockPath);
  if (state.kind !== 'owned' || !lockRecordsEqual(state.record, record)) {
    throw new TypeError('Workspace lock ownership changed during acquisition.');
  }
  return true;
}

async function readLockState(
  lockPath: string,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
): Promise<LockState> {
  const identity = await assertLockDirectory(lockPath, getIdentity);
  const entries = await readdir(lockPath, { withFileTypes: true });
  if (entries.length === 0) return { kind: 'empty', identity };
  if (entries.length !== 1) return { kind: 'foreign', identity };

  const entry = entries[0];
  if (entry.isSymbolicLink()) throw new TypeError('Workspace lock entry must not be a symlink.');
  if (!entry.isFile()) return { kind: 'foreign', identity };
  const entryPath = join(lockPath, entry.name);
  const metadata = await lstat(entryPath);
  if (metadata.isSymbolicLink()) {
    throw new TypeError('Workspace lock entry must not be a symlink.');
  }
  if (!metadata.isFile()) return { kind: 'foreign', identity };
  const record = parseLockRecord(await readFile(entryPath, 'utf8'));
  if (record === undefined) return { kind: 'foreign', identity };
  if (entry.name === ownerFileName) return { kind: 'owned', identity, record };

  const claim = parseClaimName(entry.name);
  return claim !== undefined && claim.ownerToken === record.ownerToken
    ? {
        kind: 'claim',
        identity,
        record,
        claimedAt: claim.claimedAt,
        fileName: entry.name,
      }
    : { kind: 'foreign', identity };
}

async function claimOwner(
  lockPath: string,
  expectedRecord: LockRecord,
  expectedIdentity: LockDirectoryIdentity,
  getIdentity?: AcquireWorkspaceLockOptions['getLockDirectoryIdentity'],
): Promise<
  | {
      readonly path: string;
      readonly record: LockRecord;
      readonly claimedAt: number;
    }
  | undefined
> {
  const state = await readLockState(lockPath, getIdentity);
  assertCompatibleIdentity(expectedIdentity, state.identity);
  if (state.kind !== 'owned' || !lockRecordsEqual(state.record, expectedRecord)) return undefined;

  const claimedAt = Date.now();
  const claimPath = join(lockPath, claimFileName(claimedAt, expectedRecord.ownerToken));
  try {
    await rename(join(lockPath, ownerFileName), claimPath);
  } catch (error: unknown) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  const claimedState = await readLockState(lockPath, getIdentity);
  if (
    claimedState.kind !== 'claim' ||
    claimedState.claimedAt !== claimedAt ||
    !lockRecordsEqual(claimedState.record, expectedRecord)
  ) {
    return undefined;
  }
  return { path: claimPath, record: expectedRecord, claimedAt };
}

async function recoverAgedClaim(
  lockPath: string,
  state: Extract<LockState, { kind: 'claim' }>,
): Promise<boolean> {
  if (Date.now() - state.claimedAt < claimGraceMs) return false;
  return removeValidatedClaim(join(lockPath, state.fileName), state.record, state.claimedAt);
}

async function removeValidatedClaim(
  claimPath: string,
  expectedRecord: LockRecord,
  expectedClaimedAt: number,
): Promise<boolean> {
  const claim = parseClaimName(basename(claimPath));
  if (
    claim === undefined ||
    claim.claimedAt !== expectedClaimedAt ||
    claim.ownerToken !== expectedRecord.ownerToken
  ) {
    return false;
  }
  try {
    const entry = await lstat(claimPath);
    if (entry.isSymbolicLink() || !entry.isFile()) return false;
    const record = parseLockRecord(await readFile(claimPath, 'utf8'));
    if (record === undefined || !lockRecordsEqual(record, expectedRecord)) return false;
    await unlink(claimPath);
    return true;
  } catch (error: unknown) {
    if (isMissing(error)) return false;
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

function assertCompatibleIdentity(
  expected: LockDirectoryIdentity,
  current: LockDirectoryIdentity,
): void {
  const bothVerifiable =
    expected.device !== 0 && expected.inode !== 0 && current.device !== 0 && current.inode !== 0;
  if (bothVerifiable && (expected.device !== current.device || expected.inode !== current.inode)) {
    throw new TypeError('Workspace lock directory changed ownership.');
  }
}

function parseLockRecord(value: string): LockRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isLockRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isLockRecord(value: unknown): value is LockRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Partial<LockRecord>;
  return (
    Object.keys(value).length === 3 &&
    typeof record.ownerToken === 'string' &&
    uuidPattern.test(record.ownerToken) &&
    typeof record.pid === 'number' &&
    Number.isSafeInteger(record.pid) &&
    record.pid > 0 &&
    typeof record.createdAt === 'string' &&
    isCanonicalTimestamp(record.createdAt)
  );
}

function isCanonicalTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function lockRecordsEqual(left: LockRecord, right: LockRecord): boolean {
  return (
    left.ownerToken === right.ownerToken &&
    left.pid === right.pid &&
    left.createdAt === right.createdAt
  );
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
