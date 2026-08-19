import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  initializeWorkspace,
  normalizeWorkspaceRelativePath,
  resolveDefaultWorkspace,
  resolveWorkspacePath,
} from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) =>
        import('node:fs/promises').then(({ rm }) => rm(path, { recursive: true, force: true })),
      ),
  );
});

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-workspace-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('workspace bootstrap', () => {
  it('uses LOCALAPPDATA for the Windows default without depending on the host platform', () => {
    expect(
      resolveDefaultWorkspace('win32', { LOCALAPPDATA: 'C:\\Users\\Lin\\AppData\\Local' }),
    ).toBe('C:\\Users\\Lin\\AppData\\Local\\EcommerceWorkbench\\workspace');
  });

  it('uses an injected POSIX data directory without depending on the host environment', () => {
    expect(resolveDefaultWorkspace('linux', { XDG_DATA_HOME: '/home/lin/.data' })).toBe(
      '/home/lin/.data/ecommerce-workbench/workspace',
    );
  });

  it('creates the complete canonical tree without overwriting existing workspace data', async () => {
    const workspacePath = await createTemporaryWorkspace();
    await writeFile(join(workspacePath, 'workspace.json'), '{"existing":true}\n', 'utf8');
    await writeFile(join(workspacePath, 'keep.txt'), 'keep this data', 'utf8');

    const initialized = await initializeWorkspace(workspacePath);
    await initializeWorkspace(workspacePath);

    expect(initialized.path).toBe(workspacePath);
    await expect(readFile(join(workspacePath, 'workspace.json'), 'utf8')).resolves.toBe(
      '{"existing":true}\n',
    );
    await expect(readFile(join(workspacePath, 'keep.txt'), 'utf8')).resolves.toBe('keep this data');
    await Promise.all(
      [
        'database',
        'assets/products',
        'assets/competitors',
        'assets/imports',
        'assets/generated',
        'rule-packs',
        'exports',
        'backups',
        'logs',
      ].map((relativePath) => access(join(workspacePath, relativePath))),
    );
  });

  it('creates workspace metadata once when no metadata file exists', async () => {
    const workspacePath = await createTemporaryWorkspace();

    await initializeWorkspace(workspacePath);

    expect(JSON.parse(await readFile(join(workspacePath, 'workspace.json'), 'utf8'))).toEqual({
      version: 1,
    });
  });

  it('only accepts workspace-relative asset paths and resolves them inside the workspace', async () => {
    const workspacePath = await createTemporaryWorkspace();

    expect(normalizeWorkspaceRelativePath('assets/products/photo.png')).toBe(
      'assets/products/photo.png',
    );
    expect(resolveWorkspacePath(workspacePath, 'assets/products/photo.png')).toBe(
      join(workspacePath, 'assets/products/photo.png'),
    );
    expect(() => normalizeWorkspaceRelativePath('../outside.txt')).toThrow(TypeError);
    expect(() => normalizeWorkspaceRelativePath('/absolute.txt')).toThrow(TypeError);
    expect(() => normalizeWorkspaceRelativePath(win32.join('C:\\', 'outside.txt'))).toThrow(
      TypeError,
    );
  });

  it('rejects a canonical directory that is an existing symbolic link', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    await symlink(outsidePath, join(workspacePath, 'assets'));

    await expect(initializeWorkspace(workspacePath)).rejects.toThrow(TypeError);
    await expect(access(join(outsidePath, 'products'))).rejects.toThrow();
  });

  it('rejects an asset path with an existing symbolic-link component', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const workspacePath = await createTemporaryWorkspace();
    const outsidePath = await createTemporaryWorkspace();
    await mkdir(join(workspacePath, 'assets'));
    await symlink(outsidePath, join(workspacePath, 'assets', 'products'));

    expect(() => resolveWorkspacePath(workspacePath, 'assets/products/photo.png')).toThrow(
      TypeError,
    );
  });
});
