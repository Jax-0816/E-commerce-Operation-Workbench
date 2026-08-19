import { lstat, mkdir, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const canonicalDirectories = [
  'database',
  'assets/products',
  'assets/competitors',
  'assets/imports',
  'assets/generated',
  'rule-packs',
  'exports',
  'backups',
  'logs',
] as const;

export interface InitializedWorkspace {
  readonly path: string;
}

export async function initializeWorkspace(workspacePath: string): Promise<InitializedWorkspace> {
  const path = resolve(workspacePath);
  await mkdir(path, { recursive: true });
  await assertDirectory(path);
  for (const directory of canonicalDirectories) {
    await ensureManagedDirectory(path, directory);
  }
  await createWorkspaceMetadata(path);

  return { path };
}

async function createWorkspaceMetadata(workspacePath: string): Promise<void> {
  await assertRegularFileOrMissing(join(workspacePath, 'workspace.json'));
  try {
    const file = await open(join(workspacePath, 'workspace.json'), 'wx', 0o600);
    try {
      await file.writeFile('{"version":1}\n', 'utf8');
    } finally {
      await file.close();
    }
  } catch (error: unknown) {
    if (isFileAlreadyPresent(error)) {
      return;
    }
    throw error;
  }
}

async function ensureManagedDirectory(
  workspacePath: string,
  relativeDirectory: string,
): Promise<void> {
  let currentPath = workspacePath;
  for (const segment of relativeDirectory.split('/')) {
    currentPath = join(currentPath, segment);
    try {
      await assertDirectory(currentPath);
    } catch (error: unknown) {
      if (!isFileMissing(error)) {
        throw error;
      }
      await mkdir(currentPath);
    }
  }
}

async function assertDirectory(path: string): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('Workspace-managed directories must not be symbolic links.');
  }
}

async function assertRegularFileOrMissing(path: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new TypeError('Workspace metadata must not be a symbolic link.');
    }
  } catch (error: unknown) {
    if (isFileMissing(error)) {
      return;
    }
    throw error;
  }
}

function isFileAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isFileMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
