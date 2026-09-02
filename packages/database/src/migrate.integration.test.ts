import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { appMetadata, checkIntegrity, migrateDatabase, openDatabase } from './index.js';

const temporaryDirectories: string[] = [];
const migrationsDirectory = join(process.cwd(), '..', '..', 'migrations');
const execFileAsync = promisify(execFile);

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
  it('lets pinned Drizzle Kit generate only an additive migration from the committed baseline', async () => {
    const fixtureDirectory = await mkdtemp(join(process.cwd(), '.drizzle-generate-'));
    temporaryDirectories.push(fixtureDirectory);
    const fixtureMigrations = join(fixtureDirectory, 'migrations');
    await cp(migrationsDirectory, fixtureMigrations, { recursive: true });
    const fixtureSchemaDirectory = join(fixtureDirectory, 'schema');
    await cp(join(process.cwd(), 'src', 'schema'), fixtureSchemaDirectory, { recursive: true });
    const currentSchema = await readFile(join(fixtureSchemaDirectory, 'core.ts'), 'utf8');
    const futureProbe =
      "export const futureProbe = sqliteTable('future_probe', { id: text('id').primaryKey() });\n\n";
    await writeFile(
      join(fixtureSchemaDirectory, 'core.ts'),
      currentSchema.replace(
        'export const coreSchema = {',
        `${futureProbe}export const coreSchema = {\n  futureProbe,`,
      ),
      'utf8',
    );

    const generation = await execFileAsync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules', 'drizzle-kit', 'bin.cjs'),
        'generate',
        '--dialect=sqlite',
        '--schema=./schema/*.ts',
        '--out=./migrations',
        '--name=additive_probe',
      ],
      { cwd: fixtureDirectory, env: { ...process.env, NO_COLOR: '1' } },
    );

    const generatedFilenames = await readdir(fixtureMigrations);
    const generatedFilename = generatedFilenames.find((filename) =>
      filename.endsWith('_additive_probe.sql'),
    );
    expect(
      generatedFilename,
      `${generatedFilenames.join(', ')}\n${generation.stdout}`,
    ).toBeDefined();
    const generatedSql = await readFile(join(fixtureMigrations, generatedFilename!), 'utf8');
    expect(generatedSql).toContain('CREATE TABLE `future_probe`');
    expect(generatedSql).not.toContain('CREATE TABLE `app_metadata`');
    expect(generatedSql).not.toContain('CREATE TABLE `workspace_settings`');
  });

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
    const migrationCount = (await readdir(migrationsDirectory)).filter((filename) =>
      /^\d+_[\w-]+\.sql$/u.test(filename),
    ).length;
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM __eaw_migrations').get()).toEqual(
      {
        count: migrationCount,
      },
    );
    database.close();
  });

  it('enforces one active rule pack per platform and immutable rule snapshots', async () => {
    const directory = await createTemporaryDirectory();
    const database = openDatabase(join(directory, 'workspace.sqlite'));
    await migrateDatabase(database, migrationsDirectory);

    const insertPack = database.sqlite.prepare(
      'INSERT INTO rule_packs (id, platform_id, region, version, checksum, manifest_json, rules_json, installed_at, activated_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertPack.run('pack-one', 'pinduoduo', 'CN', '2026.9.0', 'a'.repeat(64), '{}', '[]', 1, 1, 1);
    expect(() =>
      insertPack.run(
        'pack-two',
        'pinduoduo',
        'CN',
        '2026.9.1',
        'b'.repeat(64),
        '{}',
        '[]',
        2,
        2,
        1,
      ),
    ).toThrow();

    database.sqlite
      .prepare(
        'INSERT INTO rule_snapshots (id, rule_pack_id, platform_id, region, category_code, snapshot_hash, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('snapshot-one', 'pack-one', 'pinduoduo', 'CN', null, 'c'.repeat(64), '{}', 3);
    expect(() =>
      database.sqlite
        .prepare('UPDATE rule_snapshots SET snapshot_json = ? WHERE id = ?')
        .run('{"changed":true}', 'snapshot-one'),
    ).toThrow(/immutable/u);
    expect(() =>
      database.sqlite.prepare('DELETE FROM rule_snapshots WHERE id = ?').run('snapshot-one'),
    ).toThrow(/immutable/u);
    database.close();
  });

  it('stores one revisioned user override per platform region and rule key', async () => {
    const directory = await createTemporaryDirectory();
    const database = openDatabase(join(directory, 'workspace.sqlite'));
    await migrateDatabase(database, migrationsDirectory);

    const insertOverride = database.sqlite.prepare(
      'INSERT INTO rule_overrides (id, platform_id, region, rule_key, rule_json, revision_no, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertOverride.run('override-one', 'pinduoduo', 'CN', 'commission', '{}', 1, 1, 1);
    expect(() =>
      insertOverride.run('override-two', 'pinduoduo', 'CN', 'commission', '{}', 1, 2, 2),
    ).toThrow();
    expect(() =>
      insertOverride.run('override-three', 'pinduoduo', 'CN', 'service_fee', '{}', 0, 2, 2),
    ).toThrow();
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
