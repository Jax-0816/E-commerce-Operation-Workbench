import { lstatSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

export type WorkspacePlatform = 'win32' | (string & {});
export type WorkspaceEnvironment = Readonly<Record<string, string | undefined>>;

const workspaceDirectoryName = 'EcommerceWorkbench';

export function resolveDefaultWorkspace(
  platform: WorkspacePlatform,
  environment: WorkspaceEnvironment,
): string {
  if (platform === 'win32') {
    const localAppData =
      environment.LOCALAPPDATA ??
      win32.join(environment.USERPROFILE ?? 'C:\\Users\\Default', 'AppData', 'Local');

    return win32.join(localAppData, workspaceDirectoryName, 'workspace');
  }

  const dataHome = environment.XDG_DATA_HOME ?? `${environment.HOME ?? '/tmp'}/.local/share`;
  return `${dataHome}/ecommerce-workbench/workspace`;
}

export function normalizeWorkspaceRelativePath(storedPath: string): string {
  if (storedPath.length === 0 || storedPath.includes('\0')) {
    throw new TypeError('Workspace paths must be non-empty and cannot contain null bytes.');
  }

  const normalized = storedPath.replaceAll('\\', '/');
  if (isAbsolute(normalized) || win32.isAbsolute(storedPath)) {
    throw new TypeError('Workspace paths must be relative.');
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new TypeError('Workspace paths cannot traverse above the workspace.');
  }

  const safeSegments = segments.filter((segment) => segment !== '' && segment !== '.');
  if (safeSegments.length === 0) {
    throw new TypeError('Workspace paths must identify a file or directory.');
  }

  return safeSegments.join('/');
}

export function resolveWorkspacePath(workspacePath: string, storedPath: string): string {
  const resolvedWorkspacePath = resolve(workspacePath);
  const resolvedAssetPath = resolve(
    resolvedWorkspacePath,
    normalizeWorkspaceRelativePath(storedPath),
  );
  const pathFromWorkspace = relative(resolvedWorkspacePath, resolvedAssetPath);

  if (
    pathFromWorkspace === '' ||
    pathFromWorkspace === '..' ||
    pathFromWorkspace.startsWith(`..${sep}`) ||
    isAbsolute(pathFromWorkspace)
  ) {
    throw new TypeError('Workspace path resolves outside the workspace.');
  }

  assertNoSymbolicLinkComponents(resolvedWorkspacePath, normalizeWorkspaceRelativePath(storedPath));

  return resolvedAssetPath;
}

function assertNoSymbolicLinkComponents(workspacePath: string, relativePath: string): void {
  assertDirectory(workspacePath);
  let currentPath = workspacePath;
  for (const segment of relativePath.split('/')) {
    currentPath = resolve(currentPath, segment);
    try {
      const entry = lstatSync(currentPath);
      if (entry.isSymbolicLink()) {
        throw new TypeError('Workspace paths cannot traverse symbolic links.');
      }
    } catch (error: unknown) {
      if (isFileMissing(error)) {
        return;
      }
      throw error;
    }
  }
}

function assertDirectory(path: string): void {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('Workspace root must be a real directory.');
  }
}

function isFileMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
