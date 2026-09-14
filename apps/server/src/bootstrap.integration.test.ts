import { access, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@eaw/database';
import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapWorkspace, parseBootstrapArguments } from './bootstrap.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('production workspace bootstrap', () => {
  it('is repeatable in a Chinese path with spaces and preserves existing data', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'eaw-bootstrap-')));
    temporaryDirectories.push(root);
    const workspacePath = join(root, '工作台 空格');

    await bootstrapWorkspace({ moduleUrl: import.meta.url, workspacePath });

    const first = openDatabase(join(workspacePath, 'database', 'workbench.sqlite'));
    first.sqlite
      .prepare(
        'INSERT INTO products (id, name, active_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        '018f47d7-4f8f-7a31-8f40-111111111111',
        '保留商品',
        '保留商品',
        1_700_000_000_000,
        1_700_000_000_000,
      );
    first.close();

    await bootstrapWorkspace({ moduleUrl: import.meta.url, workspacePath });

    const database = openDatabase(join(workspacePath, 'database', 'workbench.sqlite'));
    try {
      expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM products').get()).toEqual({
        count: 1,
      });
      expect(
        database.sqlite.prepare('SELECT COUNT(*) AS count FROM __eaw_migrations').get(),
      ).toEqual({ count: 16 });
      expect(
        database.sqlite.prepare('SELECT COUNT(*) AS count FROM prompt_templates').get(),
      ).toEqual({ count: 7 });
      expect(
        database.sqlite.prepare('SELECT COUNT(*) AS count FROM prompt_activations').get(),
      ).toEqual({ count: 7 });
      expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM rule_packs').get()).toEqual({
        count: 1,
      });
      expect(database.sqlite.prepare('SELECT active FROM rule_packs').get()).toEqual({ active: 0 });
    } finally {
      database.close();
    }
    await expect(access(join(workspacePath, 'workspace.json'))).resolves.toBeUndefined();
  }, 20_000);

  it('accepts only an optional paired workspace argument', () => {
    expect(parseBootstrapArguments([])).toEqual({});
    expect(parseBootstrapArguments(['--workspace', 'C:\\工作台 空格'])).toEqual({
      workspacePath: 'C:\\工作台 空格',
    });
    expect(() => parseBootstrapArguments(['--workspace'])).toThrow(
      'Bootstrap arguments are invalid.',
    );
    expect(() => parseBootstrapArguments(['--unknown', 'value'])).toThrow(
      'Bootstrap arguments are invalid.',
    );
  });
});
