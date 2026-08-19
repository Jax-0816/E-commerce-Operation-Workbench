import { mkdir, open } from 'node:fs/promises';
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
  await Promise.all(
    canonicalDirectories.map((directory) => mkdir(join(path, directory), { recursive: true })),
  );
  await createWorkspaceMetadata(path);

  return { path };
}

async function createWorkspaceMetadata(workspacePath: string): Promise<void> {
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

function isFileAlreadyPresent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
