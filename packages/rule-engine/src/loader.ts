import { inflateRawSync } from 'node:zlib';

import { DomainError } from '@eaw/domain';

import { calculateRulePackChecksum } from './checksum.js';
import { RulePackSchema, type RulePack } from './schemas.js';

const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 200;
const EXECUTABLE = /\.(?:bat|cmd|com|cjs|dll|exe|jar|js|mjs|msi|ps1|scr|sh|wasm)$/iu;

export interface LoadRulePackOptions {
  readonly appVersion: string;
}

export interface LoadedRulePack extends RulePack {
  readonly sourceFormat: 'json' | 'zip';
}

export function loadRulePack(
  input: Uint8Array | string,
  options: LoadRulePackOptions,
): LoadedRulePack {
  try {
    const sourceFormat = typeof input === 'string' ? 'json' : isZip(input) ? 'zip' : 'json';
    const value = sourceFormat === 'zip' ? readZipPack(input as Uint8Array) : parseJson(input);
    const pack = RulePackSchema.parse(value);
    if (compareVersions(options.appVersion, pack.manifest.minimumAppVersion) < 0)
      invalid('Rule pack requires a newer application version.');
    if (calculateRulePackChecksum(pack) !== pack.manifest.checksum)
      invalid('Rule pack checksum does not match.');
    return deepFreeze({ ...structuredClone(pack), sourceFormat });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('VALIDATION_ERROR', 'Rule pack is invalid.');
  }
}

function parseJson(input: string | Uint8Array): unknown {
  const bytes = typeof input === 'string' ? Buffer.byteLength(input) : input.byteLength;
  if (bytes > MAX_ARCHIVE_BYTES) invalid('Rule pack is too large.');
  return JSON.parse(
    typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input),
  );
}

function isZip(input: Uint8Array): boolean {
  return (
    input.byteLength >= 4 &&
    new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(0, true) === 0x04034b50
  );
}

function readZipPack(input: Uint8Array): unknown {
  if (input.byteLength > MAX_ARCHIVE_BYTES) invalid('Rule pack archive is too large.');
  const files = readZipEntries(input);
  const manifest = files.get('manifest.json');
  const rules = files.get('rules.json');
  if (!manifest || !rules) invalid('Rule pack archive must contain manifest.json and rules.json.');
  return { manifest: JSON.parse(decode(manifest)), rules: JSON.parse(decode(rules)) };
}

function readZipEntries(input: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const end = findEnd(view);
  const count = view.getUint16(end + 10, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (count > MAX_ENTRIES || centralOffset >= input.byteLength)
    invalid('Rule pack archive directory is invalid.');
  const result = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      invalid('Rule pack ZIP directory is invalid.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameEnd = cursor + 46 + nameLength;
    if (
      nameEnd > end ||
      (flags & 1) !== 0 ||
      ![0, 8].includes(method) ||
      uncompressedSize > MAX_ENTRY_BYTES
    )
      invalid('Rule pack ZIP entry is unsupported.');
    const name = decode(input.subarray(cursor + 46, nameEnd));
    safeEntryName(name);
    if (result.has(name)) invalid('Rule pack ZIP contains duplicate entries.');
    const contents = extractEntry(
      input,
      view,
      localOffset,
      compressedSize,
      uncompressedSize,
      method,
    );
    if (crc32(contents) !== expectedCrc) invalid('Rule pack ZIP checksum is invalid.');
    result.set(name, contents);
    cursor = nameEnd + extraLength + commentLength;
  }
  return result;
}

function findEnd(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let cursor = view.byteLength - 22; cursor >= minimum; cursor -= 1) {
    if (view.getUint32(cursor, true) === 0x06054b50) return cursor;
  }
  invalid('Rule pack ZIP end record is missing.');
}

function extractEntry(
  input: Uint8Array,
  view: DataView,
  offset: number,
  compressedSize: number,
  expectedSize: number,
  method: number,
): Uint8Array {
  if (offset + 30 > input.byteLength || view.getUint32(offset, true) !== 0x04034b50)
    invalid('Rule pack ZIP local entry is invalid.');
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + compressedSize;
  if (end > input.byteLength) invalid('Rule pack ZIP entry is truncated.');
  const value = method === 0 ? input.slice(start, end) : inflateRawSync(input.subarray(start, end));
  if (value.byteLength !== expectedSize || value.byteLength > MAX_ENTRY_BYTES)
    invalid('Rule pack ZIP entry size is invalid.');
  return value;
}

function safeEntryName(name: string): void {
  if (
    !name ||
    name.includes('\\') ||
    name.startsWith('/') ||
    name.split('/').some((part) => part === '..' || part === '') ||
    EXECUTABLE.test(name)
  ) {
    invalid('Rule pack ZIP entry path or type is unsafe.');
  }
}

function decode(input: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(input);
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string): readonly number[] => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(value);
    if (!match) invalid('Application version is invalid.');
    return match.slice(1, 4).map(Number);
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index])
      return (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
  }
  return 0;
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function invalid(message: string): never {
  throw new DomainError('VALIDATION_ERROR', message);
}
