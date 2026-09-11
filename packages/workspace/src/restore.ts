import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { createBackupArchive, readBackupArchive } from './archive-security.js';
import { isPathContained } from './filesystem.js';
import { parseBackupManifest, type BackupManifest } from './manifest.js';
import { resolveWorkspacePath } from './paths.js';

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const pendingFileName = '.pending-restore.json';
const statusFileName = 'restore-status.json';
const activationTargets = ['database', 'assets', 'rule-packs', 'workspace.json'] as const;
const maxStageBytes = 512 * 1024 * 1024;

export interface PendingRestore {
  readonly backupId: string;
  readonly restoreId: string;
  readonly restartRequired: true;
  readonly stagedAt: string;
}

export type RestoreStatus =
  | { readonly state: 'idle' }
  | (PendingRestore & { readonly state: 'pending' })
  | {
      readonly backupId: string;
      readonly restoreId: string;
      readonly state: 'applied';
      readonly completedAt: string;
    }
  | {
      readonly backupId: string;
      readonly restoreId: string;
      readonly state: 'failed';
      readonly completedAt: string;
      readonly message: string;
    };

interface PendingMarker {
  readonly backupId: string;
  readonly manifestSha256: string;
  readonly restoreId: string;
  readonly stageDirectory: string;
  readonly stagedAt: string;
}

export interface StageWorkspaceRestoreInput {
  readonly archive: Uint8Array;
  readonly currentAppVersion: string;
  readonly workspacePath: string;
  readonly validateDatabase: (databasePath: string) => void | Promise<void>;
  readonly idFactory?: () => string;
  readonly now?: () => Date;
}

export interface ApplyPendingWorkspaceRestoreInput {
  readonly currentAppVersion: string;
  readonly workspacePath: string;
  readonly validateDatabase: (databasePath: string) => void | Promise<void>;
  readonly now?: () => Date;
  readonly onBeforeTargetActivation?: (
    target: (typeof activationTargets)[number],
  ) => void | Promise<void>;
}

export async function stageWorkspaceRestore({
  archive,
  currentAppVersion,
  workspacePath,
  validateDatabase,
  idFactory = randomUUID,
  now = () => new Date(),
}: StageWorkspaceRestoreInput): Promise<PendingRestore> {
  const root = await trustedWorkspaceRoot(workspacePath);
  const backupDirectory = await trustedBackupDirectory(root);
  await assertMissing(join(backupDirectory, pendingFileName), 'A restore is already pending.');
  const restored = readBackupArchive(archive, currentAppVersion);
  assertRequiredRestoreFiles(restored.manifest);
  const restoreId = idFactory();
  if (!idPattern.test(restoreId)) throw new TypeError('Invalid restore identifier.');
  const stagedAt = now().toISOString();
  const stageDirectory = `.restore-stage-${restoreId}`;
  const stagePath = join(backupDirectory, stageDirectory);
  await mkdir(stagePath, { mode: 0o700 });
  let markerPublished = false;
  try {
    await ensureStageDirectories(stagePath);
    await writeExclusive(
      join(stagePath, 'manifest.json'),
      Buffer.from(JSON.stringify(restored.manifest)),
    );
    for (const [storedPath, contents] of restored.files) {
      const path = await prepareStageFile(stagePath, storedPath);
      await writeExclusive(path, contents);
    }
    await validateStagedDatabaseCopy(stagePath, backupDirectory, restoreId, validateDatabase);
    const marker: PendingMarker = {
      backupId: restored.manifest.backupId,
      manifestSha256: sha256(Buffer.from(JSON.stringify(restored.manifest))),
      restoreId,
      stageDirectory,
      stagedAt,
    };
    await writeExclusiveMarker(backupDirectory, marker);
    markerPublished = true;
    await writeRestoreStatus(backupDirectory, {
      ...pendingView(marker),
      state: 'pending',
    });
    return Object.freeze(pendingView(marker));
  } catch (error) {
    if (markerPublished) await unlinkIfPresent(join(backupDirectory, pendingFileName));
    await rm(stagePath, { recursive: true, force: true });
    throw error;
  }
}

export async function applyPendingWorkspaceRestore({
  currentAppVersion,
  workspacePath,
  validateDatabase,
  now = () => new Date(),
  onBeforeTargetActivation,
}: ApplyPendingWorkspaceRestoreInput): Promise<RestoreStatus> {
  const root = await trustedWorkspaceRoot(workspacePath);
  const backupDirectory = await trustedBackupDirectory(root);
  const marker = await readPendingMarker(backupDirectory);
  if (!marker) return readWorkspaceRestoreStatus(root);
  const stagePath = join(backupDirectory, marker.stageDirectory);
  const rollbackPath = join(backupDirectory, `.restore-rollback-${marker.restoreId}`);
  const moves: Array<{
    readonly name: (typeof activationTargets)[number];
    originalMoved: boolean;
    replacementMoved: boolean;
  }> = [];
  let rollbackCreated = false;
  try {
    await validateStage(stagePath, marker, currentAppVersion);
    await validateDatabase(join(stagePath, 'database', 'workbench.sqlite'));
    await mkdir(rollbackPath, { mode: 0o700 });
    rollbackCreated = true;
    for (const name of activationTargets) {
      const move = { name, originalMoved: false, replacementMoved: false };
      moves.push(move);
      const activePath = join(root, name);
      await assertRealTarget(activePath, name === 'workspace.json' ? 'file' : 'directory');
      await rename(activePath, join(rollbackPath, name));
      move.originalMoved = true;
      await onBeforeTargetActivation?.(name);
      await rename(join(stagePath, name), activePath);
      move.replacementMoved = true;
    }
    const status: RestoreStatus = Object.freeze({
      backupId: marker.backupId,
      restoreId: marker.restoreId,
      state: 'applied',
      completedAt: now().toISOString(),
    });
    await writeRestoreStatus(backupDirectory, status);
    await unlink(join(backupDirectory, pendingFileName));
    await Promise.all([safeRemove(rollbackPath), safeRemove(stagePath)]);
    return status;
  } catch {
    if (rollbackCreated) await rollbackMoves(root, stagePath, rollbackPath, moves);
    await unlinkIfPresent(join(backupDirectory, pendingFileName));
    await Promise.all([safeRemove(rollbackPath), safeRemove(stagePath)]);
    const status: RestoreStatus = Object.freeze({
      backupId: marker.backupId,
      restoreId: marker.restoreId,
      state: 'failed',
      completedAt: now().toISOString(),
      message: 'Restore failed; original workspace was preserved.',
    });
    await writeRestoreStatus(backupDirectory, status);
    return status;
  }
}

export async function readWorkspaceRestoreStatus(workspacePath: string): Promise<RestoreStatus> {
  const root = await trustedWorkspaceRoot(workspacePath);
  const backupDirectory = await trustedBackupDirectory(root);
  const marker = await readPendingMarker(backupDirectory);
  if (marker) return Object.freeze({ ...pendingView(marker), state: 'pending' });
  try {
    return parseStatus(JSON.parse(await readFile(join(backupDirectory, statusFileName), 'utf8')));
  } catch (error) {
    if (isMissing(error)) return Object.freeze({ state: 'idle' });
    throw new TypeError('Invalid workspace restore status.');
  }
}

async function validateStage(
  stagePath: string,
  marker: PendingMarker,
  currentAppVersion: string,
): Promise<void> {
  await assertRealTarget(stagePath, 'directory');
  const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(
    await readStableStageFile(join(stagePath, 'manifest.json'), 1024 * 1024),
  );
  if (sha256(Buffer.from(manifestText)) !== marker.manifestSha256) {
    throw new TypeError('Invalid staged restore manifest.');
  }
  const manifest = parseBackupManifest(JSON.parse(manifestText) as unknown, currentAppVersion);
  if (manifest.backupId !== marker.backupId)
    throw new TypeError('Invalid staged restore manifest.');
  const files = new Map<string, Uint8Array>();
  await collectStageFiles(stagePath, stagePath, files, { remaining: maxStageBytes });
  files.delete('manifest.json');
  createBackupArchive(manifest, files);
  assertRequiredRestoreFiles(manifest);
}

async function collectStageFiles(
  stageRoot: string,
  directoryPath: string,
  files: Map<string, Uint8Array>,
  budget: { remaining: number },
): Promise<void> {
  const directory = await lstat(directoryPath);
  if (directory.isSymbolicLink() || !directory.isDirectory()) {
    throw new TypeError('Restore staging directories must be real directories.');
  }
  if (!isPathContained(stageRoot, await realpath(directoryPath))) {
    throw new TypeError('Restore staging entries must remain inside staging.');
  }
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const path = join(directoryPath, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new TypeError('Restore staging cannot contain symlinks.');
    if (metadata.isDirectory()) {
      await collectStageFiles(stageRoot, path, files, budget);
    } else if (metadata.isFile()) {
      if (metadata.size > budget.remaining) throw new TypeError('Restore staging is too large.');
      const storedPath = relative(stageRoot, path).split(sep).join('/');
      const contents = await readStableStageFile(path, budget.remaining);
      budget.remaining -= contents.byteLength;
      files.set(storedPath, contents);
    } else {
      throw new TypeError('Restore staging entries must be regular files.');
    }
  }
}

async function readStableStageFile(path: string, maximumBytes: number): Promise<Uint8Array> {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile() || before.size > maximumBytes) {
    throw new TypeError('Restore staging entry is unsafe or too large.');
  }
  const file = await open(path, 'r');
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new TypeError('Restore staging entry changed while it was opened.');
    }
    const contents = await file.readFile();
    const after = await file.stat();
    if (
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      contents.byteLength !== after.size
    ) {
      throw new TypeError('Restore staging entry changed while it was read.');
    }
    return Uint8Array.from(contents);
  } finally {
    await file.close();
  }
}

async function validateStagedDatabaseCopy(
  stagePath: string,
  backupDirectory: string,
  restoreId: string,
  validateDatabase: (databasePath: string) => void | Promise<void>,
): Promise<void> {
  const validationPath = join(backupDirectory, `.restore-validation-${restoreId}`);
  await mkdir(validationPath, { mode: 0o700 });
  try {
    const databasePath = join(validationPath, 'workbench.sqlite');
    await copyFile(
      join(stagePath, 'database', 'workbench.sqlite'),
      databasePath,
      constants.COPYFILE_EXCL,
    );
    await validateDatabase(databasePath);
  } finally {
    await rm(validationPath, { recursive: true, force: true });
  }
}

async function ensureStageDirectories(stagePath: string): Promise<void> {
  for (const name of ['database', 'assets', 'rule-packs']) {
    await mkdir(join(stagePath, name), { mode: 0o700 });
  }
}

async function prepareStageFile(stagePath: string, storedPath: string): Promise<string> {
  const segments = storedPath.split('/');
  let current = stagePath;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (!isAlreadyPresent(error)) throw error;
    }
    await assertRealTarget(current, 'directory');
  }
  return join(stagePath, ...segments);
}

async function writeExclusive(path: string, contents: Uint8Array): Promise<void> {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(contents);
    await file.sync();
  } finally {
    await file.close();
  }
}

async function writeExclusiveMarker(backupDirectory: string, marker: PendingMarker): Promise<void> {
  const temporaryPath = join(backupDirectory, `.pending-${marker.restoreId}.tmp`);
  const finalPath = join(backupDirectory, pendingFileName);
  try {
    await writeExclusive(temporaryPath, Buffer.from(JSON.stringify(marker)));
    await link(temporaryPath, finalPath);
  } finally {
    await unlinkIfPresent(temporaryPath);
  }
}

async function writeRestoreStatus(
  backupDirectory: string,
  status: Exclude<RestoreStatus, { state: 'idle' }>,
): Promise<void> {
  const temporaryPath = join(
    backupDirectory,
    `.restore-status-${status.restoreId}-${randomUUID()}.tmp`,
  );
  await writeExclusive(temporaryPath, Buffer.from(JSON.stringify(status)));
  try {
    await rename(temporaryPath, join(backupDirectory, statusFileName));
  } finally {
    await unlinkIfPresent(temporaryPath);
  }
}

async function readPendingMarker(backupDirectory: string): Promise<PendingMarker | undefined> {
  try {
    return parseMarker(JSON.parse(await readFile(join(backupDirectory, pendingFileName), 'utf8')));
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw new TypeError('Invalid pending workspace restore.');
  }
}

function parseMarker(value: unknown): PendingMarker {
  const record = exactRecord(value, [
    'backupId',
    'manifestSha256',
    'restoreId',
    'stageDirectory',
    'stagedAt',
  ]);
  if (
    typeof record.backupId !== 'string' ||
    !idPattern.test(record.backupId) ||
    typeof record.restoreId !== 'string' ||
    !idPattern.test(record.restoreId) ||
    record.stageDirectory !== `.restore-stage-${record.restoreId}` ||
    typeof record.manifestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(record.manifestSha256) ||
    typeof record.stagedAt !== 'string' ||
    !isCanonicalTimestamp(record.stagedAt)
  ) {
    throw new TypeError('Invalid pending workspace restore.');
  }
  return {
    backupId: record.backupId,
    manifestSha256: record.manifestSha256,
    restoreId: record.restoreId,
    stageDirectory: record.stageDirectory,
    stagedAt: record.stagedAt,
  };
}

function parseStatus(value: unknown): RestoreStatus {
  const record = value as Record<string, unknown>;
  if (record?.state === 'applied') {
    exactRecord(value, ['backupId', 'completedAt', 'restoreId', 'state']);
    if (validCompletedRecord(record)) {
      return Object.freeze({
        backupId: record.backupId as string,
        restoreId: record.restoreId as string,
        state: 'applied',
        completedAt: record.completedAt as string,
      });
    }
  }
  if (record?.state === 'failed') {
    exactRecord(value, ['backupId', 'completedAt', 'message', 'restoreId', 'state']);
    if (
      validCompletedRecord(record) &&
      typeof record.message === 'string' &&
      record.message === 'Restore failed; original workspace was preserved.'
    ) {
      return Object.freeze({
        backupId: record.backupId as string,
        restoreId: record.restoreId as string,
        state: 'failed',
        completedAt: record.completedAt as string,
        message: record.message,
      });
    }
  }
  throw new TypeError('Invalid workspace restore status.');
}

function validCompletedRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.backupId === 'string' &&
    idPattern.test(record.backupId) &&
    typeof record.restoreId === 'string' &&
    idPattern.test(record.restoreId) &&
    typeof record.completedAt === 'string' &&
    isCanonicalTimestamp(record.completedAt)
  );
}

function pendingView(marker: PendingMarker): PendingRestore {
  return {
    backupId: marker.backupId,
    restoreId: marker.restoreId,
    restartRequired: true,
    stagedAt: marker.stagedAt,
  };
}

async function rollbackMoves(
  workspacePath: string,
  stagePath: string,
  rollbackPath: string,
  moves: readonly {
    readonly name: (typeof activationTargets)[number];
    readonly originalMoved: boolean;
    readonly replacementMoved: boolean;
  }[],
): Promise<void> {
  for (const move of [...moves].reverse()) {
    if (move.replacementMoved)
      await rename(join(workspacePath, move.name), join(stagePath, move.name));
    if (move.originalMoved)
      await rename(join(rollbackPath, move.name), join(workspacePath, move.name));
  }
}

async function assertRealTarget(path: string, kind: 'directory' | 'file'): Promise<void> {
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    (kind === 'file' ? !metadata.isFile() : !metadata.isDirectory())
  ) {
    throw new TypeError('Restore target has an unsafe file type.');
  }
}

function assertRequiredRestoreFiles(manifest: BackupManifest): void {
  const paths = new Set(manifest.files.map(({ path }) => path));
  if (!paths.has('database/workbench.sqlite') || !paths.has('workspace.json')) {
    throw new TypeError('Workspace backup is missing required files.');
  }
}

async function trustedWorkspaceRoot(workspacePath: string): Promise<string> {
  const root = resolve(workspacePath);
  await assertRealTarget(root, 'directory');
  return realpath(root);
}

async function trustedBackupDirectory(workspacePath: string): Promise<string> {
  const directory = dirname(resolveWorkspacePath(workspacePath, 'backups/.restore-probe'));
  await assertRealTarget(directory, 'directory');
  if (!isPathContained(workspacePath, await realpath(directory))) {
    throw new TypeError('Restore files must remain inside the workspace.');
  }
  return directory;
}

async function assertMissing(path: string, message: string): Promise<void> {
  try {
    await lstat(path);
    throw new TypeError(message);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function safeRemove(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // Restore is already committed or rolled back; stale private directories are ignored safely.
  }
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  ) {
    throw new TypeError('Invalid workspace restore record.');
  }
  return value as Record<string, unknown>;
}

function isCanonicalTimestamp(value: string): boolean {
  const date = new Date(value);
  return Number.isSafeInteger(date.getTime()) && date.toISOString() === value;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
