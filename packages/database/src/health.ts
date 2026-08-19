import type { OpenDatabase } from './client.js';

export interface IntegrityCheck {
  readonly ok: boolean;
  readonly result: string;
}

export async function checkIntegrity(database: OpenDatabase): Promise<IntegrityCheck> {
  const row = database.sqlite.prepare('PRAGMA integrity_check;').get() as
    { integrity_check: string } | undefined;
  const result = row?.integrity_check ?? 'unknown';
  return { ok: result === 'ok', result };
}
