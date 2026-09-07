import { parseUuidV7, type PlatformId, type UuidV7 } from '@eaw/domain';
import type { OpenDatabase } from '../client.js';

export type ContentRow = Record<string, unknown>;

export function uuid(value: unknown): UuidV7 {
  if (typeof value !== 'string') throw new TypeError('Invalid UUID.');
  return parseUuidV7(value);
}
export function nullableUuid(value: unknown): UuidV7 | null {
  return value === null ? null : uuid(value);
}
export function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError('Invalid integer.');
  return value;
}
export function json(value: unknown): unknown {
  if (typeof value !== 'string') throw new TypeError('Invalid JSON.');
  return JSON.parse(value) as unknown;
}
export function platform(value: unknown): PlatformId {
  if (value === 'pinduoduo' || value === 'taobao' || value === 'douyin') return value;
  throw new TypeError('Invalid platform.');
}
export function status(value: unknown): 'verified' | 'needs_review' {
  if (value === 'verified' || value === 'needs_review') return value;
  throw new TypeError('Invalid status.');
}
export function rollback(database: OpenDatabase): void {
  try {
    database.sqlite.exec('ROLLBACK;');
  } catch {
    /* Preserve the original error. */
  }
}
