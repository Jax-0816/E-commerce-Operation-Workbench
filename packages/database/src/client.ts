import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { coreSchema } from './schema/core.js';

export interface OpenDatabase {
  readonly path: string;
  readonly sqlite: DatabaseSync;
  readonly drizzle: SqliteRemoteDatabase<typeof coreSchema>;
  close(): void;
}

function executeWithNodeSqlite(
  sqlite: DatabaseSync,
  query: string,
  parameters: unknown[],
  method: 'run' | 'all' | 'values' | 'get',
): { rows: unknown[] } {
  const statement = sqlite.prepare(query);
  const boundParameters = parameters as Parameters<typeof statement.all>;
  const values = (row: Record<string, unknown> | undefined): unknown[] | undefined =>
    row === undefined ? undefined : Object.values(row);

  switch (method) {
    case 'all':
      return {
        rows: statement
          .all(...boundParameters)
          .map((row) => values(row as Record<string, unknown>)),
      };
    case 'get':
      return {
        rows: values(
          statement.get(...boundParameters) as Record<string, unknown> | undefined,
        ) as unknown[],
      };
    case 'values':
      return {
        rows: statement
          .all(...boundParameters)
          .map((row) => values(row as Record<string, unknown>)),
      };
    case 'run':
      return { rows: [statement.run(...boundParameters)] };
  }
}

export function openDatabase(path: string): OpenDatabase {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    timeout: 5_000,
  });
  sqlite.exec('PRAGMA journal_mode = WAL;');

  const database = drizzle(
    async (query, parameters, method) => executeWithNodeSqlite(sqlite, query, parameters, method),
    { schema: coreSchema },
  );

  return {
    path,
    sqlite,
    drizzle: database,
    close: () => sqlite.close(),
  };
}
