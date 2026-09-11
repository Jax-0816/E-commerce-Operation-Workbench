import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

import { isBackupPayloadPath, parseBackupManifest, type BackupManifest } from './manifest.js';

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const utf8Flag = 0x800;

export interface BackupArchive {
  readonly manifest: BackupManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

interface ZipEntry {
  readonly name: string;
  readonly contents: Uint8Array;
}

export function createBackupArchive(
  manifestValue: BackupManifest,
  filesValue: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  const manifest = parseBackupManifest(manifestValue, manifestValue.appVersion);
  const files = new Map(filesValue);
  assertPayloadsMatch(manifest, files);
  const entries: ZipEntry[] = [
    { name: 'manifest.json', contents: Buffer.from(JSON.stringify(manifest), 'utf8') },
    ...manifest.files
      .map(({ path }) => ({ path, contents: files.get(path)! }))
      .map(({ path, contents }) => ({ name: path, contents })),
  ];
  return writeZip(entries);
}

export function readBackupArchive(input: Uint8Array, currentAppVersion: string): BackupArchive {
  try {
    if (!(input instanceof Uint8Array) || input.byteLength > MAX_ARCHIVE_BYTES) throw invalid();
    const entries = readZip(input);
    const manifestBytes = entries.get('manifest.json');
    if (!manifestBytes) throw invalid();
    const manifest = parseBackupManifest(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)) as unknown,
      currentAppVersion,
    );
    entries.delete('manifest.json');
    assertPayloadsMatch(manifest, entries);
    return Object.freeze({ manifest, files: entries });
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw invalid();
  }
}

function assertPayloadsMatch(
  manifest: BackupManifest,
  files: ReadonlyMap<string, Uint8Array>,
): void {
  if (files.size !== manifest.files.length) throw invalid();
  for (const expected of manifest.files) {
    const contents = files.get(expected.path);
    if (
      !(contents instanceof Uint8Array) ||
      contents.byteLength !== expected.size ||
      sha256(contents) !== expected.sha256
    ) {
      throw invalid();
    }
  }
  for (const path of files.keys()) {
    if (!manifest.files.some((entry) => entry.path === path)) throw invalid();
  }
}

function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > MAX_ENTRIES) throw invalid();
  const names = new Set<string>();
  const lowerNames = new Set<string>();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let totalSize = 0;
  for (const entry of entries) {
    validateArchiveName(entry.name);
    const lowerName = entry.name.toLowerCase();
    if (names.has(entry.name) || lowerNames.has(lowerName)) throw invalid();
    names.add(entry.name);
    lowerNames.add(lowerName);
    if (entry.contents.byteLength > MAX_ENTRY_BYTES) throw invalid();
    totalSize += entry.contents.byteLength;
    if (totalSize > MAX_TOTAL_BYTES) throw invalid();
    const name = Buffer.from(entry.name, 'utf8');
    if (name.byteLength > 0xffff) throw invalid();
    const contents = Buffer.from(entry.contents);
    const checksum = crc32(contents);
    const local = Buffer.alloc(30 + name.length + contents.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(utf8Flag, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    contents.copy(local, 30 + name.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(utf8Flag, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(contents.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  const output = Buffer.concat([...localParts, ...centralParts, end]);
  if (output.byteLength > MAX_ARCHIVE_BYTES) throw invalid();
  return output;
}

function readZip(input: Uint8Array): Map<string, Uint8Array> {
  if (input.byteLength < 22) throw invalid();
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const endOffset = findEnd(view);
  const commentLength = view.getUint16(endOffset + 20, true);
  const count = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (
    view.getUint16(endOffset + 4, true) !== 0 ||
    view.getUint16(endOffset + 6, true) !== 0 ||
    view.getUint16(endOffset + 8, true) !== count ||
    endOffset + 22 + commentLength !== input.byteLength ||
    count > MAX_ENTRIES ||
    centralOffset + centralSize !== endOffset
  ) {
    throw invalid();
  }

  const result = new Map<string, Uint8Array>();
  const lowerNames = new Set<string>();
  const ranges: Array<readonly [number, number]> = [];
  let cursor = centralOffset;
  let totalSize = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > endOffset || view.getUint32(cursor, true) !== 0x02014b50) throw invalid();
    const madeBy = view.getUint16(cursor + 4, true);
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const disk = view.getUint16(cursor + 34, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > endOffset ||
      (flags & ~utf8Flag) !== 0 ||
      ![0, 8].includes(method) ||
      compressedSize > MAX_ENTRY_BYTES ||
      uncompressedSize > MAX_ENTRY_BYTES ||
      disk !== 0 ||
      isSymbolicLink(madeBy, externalAttributes)
    ) {
      throw invalid();
    }
    const name = decode(input.subarray(cursor + 46, cursor + 46 + nameLength));
    validateArchiveName(name);
    const lowerName = name.toLowerCase();
    if (result.has(name) || lowerNames.has(lowerName)) throw invalid();
    lowerNames.add(lowerName);
    totalSize += uncompressedSize;
    if (totalSize > MAX_TOTAL_BYTES) throw invalid();
    const extracted = extractEntry(input, view, {
      centralOffset,
      checksum,
      compressedSize,
      flags,
      localOffset,
      method,
      name,
      uncompressedSize,
    });
    const range: readonly [number, number] = [localOffset, extracted.end];
    if (ranges.some(([start, end]) => range[0] < end && start < range[1])) throw invalid();
    ranges.push(range);
    result.set(name, extracted.contents);
    cursor = next;
  }
  if (cursor !== endOffset) throw invalid();
  return result;
}

function extractEntry(
  input: Uint8Array,
  view: DataView,
  entry: {
    readonly centralOffset: number;
    readonly checksum: number;
    readonly compressedSize: number;
    readonly flags: number;
    readonly localOffset: number;
    readonly method: number;
    readonly name: string;
    readonly uncompressedSize: number;
  },
): { readonly contents: Uint8Array; readonly end: number } {
  const { localOffset } = entry;
  if (localOffset + 30 > entry.centralOffset || view.getUint32(localOffset, true) !== 0x04034b50) {
    throw invalid();
  }
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataOffset = localOffset + 30 + nameLength + extraLength;
  const end = dataOffset + entry.compressedSize;
  if (
    view.getUint16(localOffset + 6, true) !== entry.flags ||
    view.getUint16(localOffset + 8, true) !== entry.method ||
    view.getUint32(localOffset + 14, true) !== entry.checksum ||
    view.getUint32(localOffset + 18, true) !== entry.compressedSize ||
    view.getUint32(localOffset + 22, true) !== entry.uncompressedSize ||
    end > entry.centralOffset ||
    decode(input.subarray(localOffset + 30, localOffset + 30 + nameLength)) !== entry.name
  ) {
    throw invalid();
  }
  const compressed = input.subarray(dataOffset, end);
  const contents =
    entry.method === 0
      ? Uint8Array.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompressedSize) });
  if (contents.byteLength !== entry.uncompressedSize || crc32(contents) !== entry.checksum) {
    throw invalid();
  }
  return { contents: Uint8Array.from(contents), end };
}

function findEnd(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let cursor = view.byteLength - 22; cursor >= minimum; cursor -= 1) {
    if (view.getUint32(cursor, true) === 0x06054b50) return cursor;
  }
  throw invalid();
}

function validateArchiveName(name: string): void {
  if (name === 'manifest.json') return;
  if (!isBackupPayloadPath(name)) throw invalid();
}

function isSymbolicLink(madeBy: number, externalAttributes: number): boolean {
  const creator = madeBy >>> 8;
  const mode = externalAttributes >>> 16;
  return creator === 3 && (mode & 0o170000) === 0o120000;
}

function decode(input: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(input);
}

function sha256(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function invalid(): TypeError {
  return new TypeError('Invalid workspace backup archive.');
}
