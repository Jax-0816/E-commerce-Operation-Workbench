import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createProductionApp } from './runtime.js';

const directories: string[] = [];
const migrationsDirectory = join(process.cwd(), '..', '..', 'migrations');

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('production app composition', () => {
  it('serves products from a migrated workspace and releases resources for restart', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-runtime-')));
    directories.push(workspacePath);

    const first = await createProductionApp({ migrationsDirectory, workspacePath });
    const created = await first.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: '生产组合保温杯' },
    });
    expect(created.statusCode).toBe(201);
    await first.close();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    const listed = await restarted.inject({ method: 'GET', url: '/api/v1/products' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({ items: [{ name: '生产组合保温杯' }] });
    await restarted.close();
  });

  it('releases partial resources when migration fails', async () => {
    const workspacePath = await realpath(await mkdtemp(join(tmpdir(), 'eaw-server-failure-')));
    directories.push(workspacePath);
    const invalidMigrations = join(workspacePath, 'invalid-migrations');
    await mkdir(invalidMigrations);
    await writeFile(join(invalidMigrations, '0000_invalid.sql'), 'THIS IS INVALID SQL;\n', 'utf8');

    await expect(
      createProductionApp({ migrationsDirectory: invalidMigrations, workspacePath }),
    ).rejects.toThrow();

    const restarted = await createProductionApp({ migrationsDirectory, workspacePath });
    expect((await restarted.inject({ method: 'GET', url: '/api/v1/products' })).statusCode).toBe(
      200,
    );
    await restarted.close();
  });
});
