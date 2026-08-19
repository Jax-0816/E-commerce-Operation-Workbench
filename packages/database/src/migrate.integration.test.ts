import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { appMetadata, checkIntegrity, migrateDatabase, openDatabase } from './index.js';

const temporaryDirectories: string[] = [];
const migrationsDirectory = join(process.cwd(), '..', '..', 'migrations');

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-database-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('database migrations', () => {
  it('migrates a fresh SQLite database and reports a healthy pragma result', async () => {
    const directory = await createTemporaryDirectory();
    const database = openDatabase(join(directory, 'workspace.sqlite'));

    await migrateDatabase(database, migrationsDirectory);

    expect(
      database.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_metadata'")
        .get(),
    ).toEqual({ name: 'app_metadata' });
    await database.drizzle
      .insert(appMetadata)
      .values({ key: 'through-drizzle', value: 'typed repository facade' })
      .run();
    await expect(
      database.drizzle
        .select({ value: appMetadata.value })
        .from(appMetadata)
        .where(eq(appMetadata.key, 'through-drizzle'))
        .get(),
    ).resolves.toEqual({ value: 'typed repository facade' });
    expect(await checkIntegrity(database)).toEqual({ ok: true, result: 'ok' });
    database.close();
  });

  it('records migrations so rerunning them preserves existing data', async () => {
    const directory = await createTemporaryDirectory();
    const database = openDatabase(join(directory, 'workspace.sqlite'));
    await migrateDatabase(database, migrationsDirectory);
    database.sqlite
      .prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)')
      .run('installation-id', 'persisted-value');

    await migrateDatabase(database, migrationsDirectory);

    expect(
      database.sqlite
        .prepare('SELECT value FROM app_metadata WHERE key = ?')
        .get('installation-id'),
    ).toEqual({ value: 'persisted-value' });
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM __eaw_migrations').get()).toEqual(
      { count: 1 },
    );
    database.close();
  });

  it('rolls back a failing migration and preserves a usable database file', async () => {
    const directory = await createTemporaryDirectory();
    const databasePath = join(directory, 'nested workspace', 'workspace.sqlite');
    const database = openDatabase(databasePath);
    await migrateDatabase(database, migrationsDirectory);
    database.sqlite
      .prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)')
      .run('keep', 'me');
    database.close();

    const invalidMigrationsDirectory = join(directory, 'invalid-migrations');
    await mkdir(invalidMigrationsDirectory, { recursive: true });
    await writeFile(
      join(invalidMigrationsDirectory, '0001_invalid.sql'),
      'CREATE TABLE should_not_exist (id TEXT);\nTHIS IS NOT VALID SQL;\n',
      'utf8',
    );

    const reopened = openDatabase(databasePath);
    await expect(migrateDatabase(reopened, invalidMigrationsDirectory)).rejects.toThrow();
    reopened.close();

    const migrationBackup = openDatabase(`${databasePath}.pre-migration.sqlite`);
    expect(
      migrationBackup.sqlite.prepare('SELECT value FROM app_metadata WHERE key = ?').get('keep'),
    ).toEqual({ value: 'me' });
    migrationBackup.close();

    const restored = openDatabase(databasePath);
    expect(
      restored.sqlite.prepare('SELECT value FROM app_metadata WHERE key = ?').get('keep'),
    ).toEqual({
      value: 'me',
    });
    expect(
      restored.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_not_exist'",
        )
        .get(),
    ).toBeUndefined();
    expect(await checkIntegrity(restored)).toEqual({ ok: true, result: 'ok' });
    restored.close();

    await expect(readFile(databasePath)).resolves.toBeInstanceOf(Buffer);
  });
});
