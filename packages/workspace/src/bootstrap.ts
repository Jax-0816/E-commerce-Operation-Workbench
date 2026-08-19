import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';

import { isPathContained } from './filesystem.js';

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
  const trustedRoot = await ensureSafeDirectoryPath(path);
  await assertSafeDirectory(path, trustedRoot);
  for (const directory of canonicalDirectories) {
    await ensureManagedDirectory(path, directory, trustedRoot);
  }
  await createWorkspaceMetadata(path, trustedRoot);

  return { path };
}

async function createWorkspaceMetadata(workspacePath: string, trustedRoot: string): Promise<void> {
  await assertSafeDirectory(workspacePath, trustedRoot);
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
  trustedRoot: string,
): Promise<void> {
  let currentPath = workspacePath;
  for (const segment of relativeDirectory.split('/')) {
    currentPath = join(currentPath, segment);
    try {
      await assertSafeDirectory(currentPath, trustedRoot);
    } catch (error: unknown) {
      if (!isFileMissing(error)) {
        throw error;
      }
      await assertSafeDirectory(dirname(currentPath), trustedRoot);
      await mkdir(currentPath);
      await assertSafeDirectory(currentPath, trustedRoot);
    }
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
      if (!isFileMissing(error)) {
        throw error;
      }
      await assertSafeDirectory(currentPath, trustedRoot);
      await mkdir(nextPath);
      await assertSafeDirectory(nextPath, trustedRoot);
    }
    currentPath = nextPath;
  }
  return trustedRoot;
}

async function assertSafeDirectory(path: string, trustedRoot: string): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('Workspace-managed directories must not be symbolic links.');
  }
  if (!isPathContained(trustedRoot, await realpath(path))) {
    throw new TypeError('Workspace-managed directories must remain inside their trusted root.');
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
