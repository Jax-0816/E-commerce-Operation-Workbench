import { createHash, randomUUID } from 'node:crypto';
import { lstat, link, mkdtemp, open, readdir, realpath, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { backup, type DatabaseSync } from 'node:sqlite';

import { createBackupArchive, readBackupArchive } from './archive-security.js';
import { isPathContained } from './filesystem.js';
import { parseBackupManifest, type BackupFileEntry } from './manifest.js';
import { resolveWorkspacePath } from './paths.js';

const backupFilePattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.eaw-backup\.zip$/u;
const maxBackupFileBytes = 512 * 1024 * 1024;

export interface WorkspaceBackupRecord {
  readonly appVersion: string;
  readonly backupId: string;
  readonly createdAt: string;
  readonly size: number;
}

export interface CreateWorkspaceBackupInput {
  readonly appVersion: string;
  readonly database: DatabaseSync;
  readonly workspacePath: string;
  readonly idFactory?: () => string;
  readonly now?: () => Date;
  readonly onSnapshotCreated?: (snapshotPath: string) => void | Promise<void>;
}

export interface ReadWorkspaceBackupInput {
  readonly backupId: string;
  readonly currentAppVersion: string;
  readonly workspacePath: string;
}

export interface StoredWorkspaceBackup {
  readonly bytes: Uint8Array;
  readonly record: WorkspaceBackupRecord;
}

export async function createWorkspaceBackup({
  appVersion,
  database,
  workspacePath,
  idFactory = randomUUID,
  now = () => new Date(),
  onSnapshotCreated,
}: CreateWorkspaceBackupInput): Promise<WorkspaceBackupRecord> {
  const root = await trustedWorkspaceRoot(workspacePath);
  const backupDirectory = await trustedBackupDirectory(root);
  const temporaryDirectory = await mkdtemp(join(backupDirectory, '.creating-'));
  try {
    const snapshotPath = join(temporaryDirectory, 'workbench.sqlite');
    await backup(database, snapshotPath);
    await onSnapshotCreated?.(snapshotPath);
    const files = await collectBackupFiles(root, snapshotPath);
    const backupId = idFactory();
    const createdAt = now().toISOString();
    const manifest = parseBackupManifest(
      {
        format: 'eaw-workspace-backup',
        formatVersion: 1,
        appVersion,
        workspaceVersion: 1,
        backupId,
        createdAt,
        files: [...files]
          .map(([path, contents]): BackupFileEntry => ({
            path,
            sha256: createHash('sha256').update(contents).digest('hex'),
            size: contents.byteLength,
          }))
          .sort((left, right) => comparePaths(left.path, right.path)),
      },
      appVersion,
    );
    const archive = createBackupArchive(manifest, files);
    const temporaryArchivePath = join(temporaryDirectory, 'archive.zip');
    const temporaryArchive = await open(temporaryArchivePath, 'wx', 0o600);
    try {
      await temporaryArchive.writeFile(archive);
      await temporaryArchive.sync();
    } finally {
      await temporaryArchive.close();
    }
    const finalPath = join(backupDirectory, `${backupId}.eaw-backup.zip`);
    await link(temporaryArchivePath, finalPath);
    return Object.freeze({ appVersion, backupId, createdAt, size: archive.byteLength });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function listWorkspaceBackups(input: {
  readonly currentAppVersion: string;
  readonly workspacePath: string;
}): Promise<readonly WorkspaceBackupRecord[]> {
  const backupDirectory = await trustedBackupDirectory(
    await trustedWorkspaceRoot(input.workspacePath),
  );
  const records: WorkspaceBackupRecord[] = [];
  for (const entry of await readdir(backupDirectory, { withFileTypes: true })) {
    const match = entry.isFile() ? entry.name.match(backupFilePattern) : undefined;
    if (!match) continue;
    try {
      records.push(
        (
          await readWorkspaceBackup({
            backupId: match[1]!,
            currentAppVersion: input.currentAppVersion,
            workspacePath: input.workspacePath,
          })
        ).record,
      );
    } catch {
      // Invalid or partially copied files are not advertised as usable backups.
    }
  }
  return Object.freeze(
    records.sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        right.backupId.localeCompare(left.backupId),
    ),
  );
}

export async function readWorkspaceBackup(
  input: ReadWorkspaceBackupInput,
): Promise<StoredWorkspaceBackup> {
  if (!backupFilePattern.test(`${input.backupId}.eaw-backup.zip`)) {
    throw new TypeError('Invalid workspace backup identifier.');
  }
  const root = await trustedWorkspaceRoot(input.workspacePath);
  const backupDirectory = await trustedBackupDirectory(root);
  const path = join(backupDirectory, `${input.backupId}.eaw-backup.zip`);
  const bytes = await readStableRegularFile(path);
  const { manifest } = readBackupArchive(bytes, input.currentAppVersion);
  if (manifest.backupId !== input.backupId)
    throw new TypeError('Invalid workspace backup archive.');
  return Object.freeze({
    bytes: Uint8Array.from(bytes),
    record: Object.freeze({
      appVersion: manifest.appVersion,
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      size: bytes.byteLength,
    }),
  });
}

async function collectBackupFiles(
  workspacePath: string,
  snapshotPath: string,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const entries: Array<readonly [string, Uint8Array]> = [
    ['database/workbench.sqlite', await readStableRegularFile(snapshotPath)],
    ['workspace.json', await readStableRegularFile(join(workspacePath, 'workspace.json'))],
  ];
  await collectDirectory(workspacePath, 'assets', entries);
  await collectDirectory(workspacePath, 'rule-packs', entries);
  entries.sort(([left], [right]) => comparePaths(left, right));
  return new Map(entries);
}

async function collectDirectory(
  workspacePath: string,
  relativeDirectory: string,
  output: Array<readonly [string, Uint8Array]>,
): Promise<void> {
  const directoryPath = resolveWorkspacePath(workspacePath, `${relativeDirectory}/.backup-probe`);
  await walk(workspacePath, dirname(directoryPath), output);
}

async function walk(
  workspacePath: string,
  directoryPath: string,
  output: Array<readonly [string, Uint8Array]>,
): Promise<void> {
  const directory = await lstat(directoryPath);
  if (directory.isSymbolicLink() || !directory.isDirectory()) {
    throw new TypeError('Backup directories must be real directories.');
  }
  if (!isPathContained(workspacePath, await realpath(directoryPath))) {
    throw new TypeError('Backup directories must remain inside the workspace.');
  }
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const path = join(directoryPath, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new TypeError('Backup files must not be symbolic links.');
    if (metadata.isDirectory()) {
      await walk(workspacePath, path, output);
    } else if (metadata.isFile()) {
      const storedPath = relative(workspacePath, path).split(sep).join('/');
      output.push([storedPath, await readStableRegularFile(path)]);
    } else {
      throw new TypeError('Backup entries must be regular files or directories.');
    }
  }
}

async function readStableRegularFile(path: string): Promise<Uint8Array> {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new TypeError('Backup entries must be regular files.');
  }
  const file = await open(path, 'r');
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new TypeError('Backup entry changed while it was opened.');
    }
    if (opened.size > maxBackupFileBytes) throw new TypeError('Backup entry is too large.');
    const contents = await file.readFile();
    const after = await file.stat();
    if (
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      contents.byteLength !== after.size
    ) {
      throw new TypeError('Backup entry changed while it was read.');
    }
    return Uint8Array.from(contents);
  } finally {
    await file.close();
  }
}

async function trustedWorkspaceRoot(workspacePath: string): Promise<string> {
  const root = resolve(workspacePath);
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new TypeError('Workspace root must be a real directory.');
  }
  return realpath(root);
}

async function trustedBackupDirectory(workspacePath: string): Promise<string> {
  return dirname(resolveWorkspacePath(workspacePath, 'backups/.backup-probe'));
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
