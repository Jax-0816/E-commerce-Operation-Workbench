import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { backup } from 'node:sqlite';

import type { OpenDatabase } from './client.js';

interface Migration {
  readonly checksum: string;
  readonly filename: string;
  readonly sql: string;
}

function checksum(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

function disallowsTransactionControl(sql: string): boolean {
  return /(?:^|;)\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(sql);
}

async function readMigrations(migrationsDirectory: string): Promise<Migration[]> {
  const filenames = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+_[\w-]+\.sql$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await readFile(join(migrationsDirectory, filename), 'utf8');
      if (disallowsTransactionControl(sql)) {
        throw new TypeError(
          `Migration ${filename} must not contain transaction control statements.`,
        );
      }
      return { filename, sql, checksum: checksum(sql) };
    }),
  );
}

function ensureMigrationTable(database: OpenDatabase): void {
  database.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __eaw_migrations (
      filename TEXT PRIMARY KEY NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);
}

function appliedMigrations(database: OpenDatabase): Map<string, string> {
  return new Map(
    database.sqlite
      .prepare('SELECT filename, checksum FROM __eaw_migrations ORDER BY filename')
      .all()
      .map((migration) => {
        const { checksum: migrationChecksum, filename } = migration;
        if (typeof filename !== 'string' || typeof migrationChecksum !== 'string') {
          throw new TypeError('Migration metadata is invalid.');
        }
        return [filename, migrationChecksum] as const;
      }),
  );
}

export async function migrateDatabase(
  database: OpenDatabase,
  migrationsDirectory: string,
): Promise<void> {
  const migrations = await readMigrations(migrationsDirectory);
  if (database.path !== ':memory:') {
    await backup(database.sqlite, `${database.path}.pre-migration.sqlite`);
  }

  database.sqlite.exec('BEGIN IMMEDIATE;');
  try {
    ensureMigrationTable(database);
    const applied = appliedMigrations(database);

    for (const migration of migrations) {
      const appliedChecksum = applied.get(migration.filename);
      if (appliedChecksum !== undefined) {
        if (appliedChecksum !== migration.checksum) {
          throw new Error(`Migration checksum changed after application: ${migration.filename}`);
        }
        continue;
      }

      database.sqlite.exec(migration.sql);
      database.sqlite
        .prepare(
          'INSERT INTO __eaw_migrations (filename, checksum, applied_at) VALUES (?, ?, unixepoch() * 1000)',
        )
        .run(migration.filename, migration.checksum);
    }

    database.sqlite.exec('COMMIT;');
  } catch (error) {
    try {
      database.sqlite.exec('ROLLBACK;');
    } catch {
      // The transaction may not have started when SQLite rejects the migration preflight.
    }
    throw error;
  }
}
