import { createHash, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createBackupArchive, readBackupArchive } from './archive-security.js';
import { parseBackupManifest, type BackupManifest } from './manifest.js';

const appVersion = '0.1.0';

describe('portable workspace backup archive', () => {
  it('round-trips sorted relative files with exact checksums', () => {
    const files = new Map([
      ['workspace.json', bytes('{"version":1}\n')],
      ['database/workbench.sqlite', bytes('sqlite snapshot')],
      ['assets/products/保温杯 photo.txt', bytes('资产')],
    ]);
    const manifest = manifestFor(files);

    const restored = readBackupArchive(createBackupArchive(manifest, files), appVersion);

    expect(restored.manifest).toEqual(manifest);
    expect([...restored.files.keys()]).toEqual(manifest.files.map(({ path }) => path));
    for (const [path, contents] of files) {
      expect([...restored.files.get(path)!]).toEqual([...contents]);
    }
  });

  it.each([
    '../outside.txt',
    '/absolute.txt',
    'C:\\absolute.txt',
    '\\\\server\\share\\file.txt',
    'assets\\products\\photo.txt',
    'assets//products/photo.txt',
    'manifest.json',
  ])('rejects unsafe manifest payload path %s', (path) => {
    const files = new Map([[path, bytes('unsafe')]]);
    expect(() => parseBackupManifest(manifestFor(files), appVersion)).toThrow(TypeError);
  });

  it('rejects unsorted, duplicate, case-conflicting, unknown, and missing payload entries', () => {
    const first = fileEntry('workspace.json', bytes('{}'));
    const second = fileEntry('assets/A.txt', bytes('A'));
    const lower = fileEntry('assets/a.txt', bytes('a'));
    const base = manifestWith([second, first]);

    expect(() => parseBackupManifest(manifestWith([first, second]), appVersion)).toThrow(TypeError);
    expect(() => parseBackupManifest(manifestWith([first, first]), appVersion)).toThrow(TypeError);
    expect(() => parseBackupManifest(manifestWith([second, lower]), appVersion)).toThrow(TypeError);

    const validFiles = new Map([
      ['workspace.json', bytes('{}')],
      ['assets/A.txt', bytes('A')],
    ]);
    expect(() =>
      createBackupArchive(base, new Map([...validFiles, ['extra.txt', bytes('x')]])),
    ).toThrow(TypeError);
    expect(() => createBackupArchive(base, new Map([['workspace.json', bytes('{}')]]))).toThrow(
      TypeError,
    );
  });

  it('rejects manifest checksum, byte length, exact keys, timestamp, id, and version violations', () => {
    const valid = manifestFor(new Map([['workspace.json', bytes('{}')]]));
    const entry = valid.files[0]!;

    expect(() =>
      parseBackupManifest({ ...valid, files: [{ ...entry, sha256: '0'.repeat(64) }] }, appVersion),
    ).not.toThrow();
    expect(() => parseBackupManifest({ ...valid, extra: true }, appVersion)).toThrow(TypeError);
    expect(() =>
      parseBackupManifest({ ...valid, backupId: randomUUID().toUpperCase() }, appVersion),
    ).toThrow(TypeError);
    expect(() => parseBackupManifest({ ...valid, createdAt: '2026-09-11' }, appVersion)).toThrow(
      TypeError,
    );
    expect(() => parseBackupManifest({ ...valid, appVersion: '0.2.0' }, appVersion)).toThrow(
      TypeError,
    );
    expect(() => parseBackupManifest({ ...valid, formatVersion: 2 }, appVersion)).toThrow(
      TypeError,
    );
    expect(() =>
      parseBackupManifest({ ...valid, files: [{ ...entry, size: -1 }] }, appVersion),
    ).toThrow(TypeError);
  });

  it.each([
    {
      label: 'traversal',
      mutate: (archive: Uint8Array) => replaceName(archive, 'safe.txt', '../x.txt'),
    },
    {
      label: 'backslash',
      mutate: (archive: Uint8Array) => replaceName(archive, 'safe.txt', 'bad\\.txt'),
    },
    { label: 'bad crc', mutate: (archive: Uint8Array) => mutateCentral(archive, 16, 1) },
    { label: 'encrypted', mutate: (archive: Uint8Array) => mutateCentral(archive, 8, 1) },
    {
      label: 'unsupported method',
      mutate: (archive: Uint8Array) => mutateCentral(archive, 10, 99),
    },
    {
      label: 'oversized entry',
      mutate: (archive: Uint8Array) => mutateCentral(archive, 24, 512 * 1024 * 1024 + 1, true),
    },
  ])('rejects a malicious ZIP: $label', ({ mutate }) => {
    const archive = rawArchive([{ name: 'safe.txt', contents: bytes('payload') }]);
    expect(() => readBackupArchive(mutate(archive), appVersion)).toThrow(TypeError);
  });

  it('rejects duplicate and case-conflicting ZIP entries before extraction', () => {
    expect(() =>
      readBackupArchive(
        rawArchive([
          { name: 'manifest.json', contents: bytes('{}') },
          { name: 'manifest.json', contents: bytes('{}') },
        ]),
        appVersion,
      ),
    ).toThrow(TypeError);
    expect(() =>
      readBackupArchive(
        rawArchive([
          { name: 'A.txt', contents: bytes('A') },
          { name: 'a.txt', contents: bytes('a') },
        ]),
        appVersion,
      ),
    ).toThrow(TypeError);
  });

  it('rejects changed archive payload even when ZIP CRC is internally valid', () => {
    const original = new Map([['workspace.json', bytes('{}')]]);
    const manifest = manifestFor(original);
    const archive = rawArchive([
      { name: 'manifest.json', contents: bytes(JSON.stringify(manifest)) },
      { name: 'workspace.json', contents: bytes('{"changed":true}') },
    ]);

    expect(() => readBackupArchive(archive, appVersion)).toThrow(TypeError);
  });
});

function manifestFor(files: ReadonlyMap<string, Uint8Array>): BackupManifest {
  return manifestWith(
    [...files]
      .map(([path, contents]) => fileEntry(path, contents))
      .sort((a, b) => a.path.localeCompare(b.path)),
  );
}

function manifestWith(files: BackupManifest['files']): BackupManifest {
  return {
    format: 'eaw-workspace-backup',
    formatVersion: 1,
    appVersion,
    workspaceVersion: 1,
    backupId: '019cdd2a-b800-7000-8000-000000000001',
    createdAt: '2026-09-11T00:00:00.000Z',
    files,
  };
}

function fileEntry(path: string, contents: Uint8Array) {
  return {
    path,
    sha256: createHash('sha256').update(contents).digest('hex'),
    size: contents.byteLength,
  };
}

function bytes(value: string): Uint8Array {
  return Buffer.from(value, 'utf8');
}

function rawArchive(entries: readonly { name: string; contents: Uint8Array }[]): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const contents = Buffer.from(entry.contents);
    const local = Buffer.alloc(30 + name.length + contents.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc32(contents), 14);
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
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc32(contents), 16);
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
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function centralOffset(archive: Uint8Array): number {
  return new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(
    archive.byteLength - 6,
    true,
  );
}

function mutateCentral(
  input: Uint8Array,
  fieldOffset: number,
  value: number,
  uint32 = false,
): Uint8Array {
  const archive = Uint8Array.from(input);
  const view = new DataView(archive.buffer);
  const offset = centralOffset(archive) + fieldOffset;
  if (uint32) view.setUint32(offset, value, true);
  else view.setUint16(offset, value, true);
  return archive;
}

function replaceName(input: Uint8Array, current: string, replacement: string): Uint8Array {
  expect(Buffer.byteLength(current)).toBe(Buffer.byteLength(replacement));
  const archive = Uint8Array.from(input);
  const currentBytes = Buffer.from(current);
  const replacementBytes = Buffer.from(replacement);
  for (let offset = 0; offset <= archive.byteLength - currentBytes.length; offset += 1) {
    if (currentBytes.every((byte, index) => archive[offset + index] === byte)) {
      archive.set(replacementBytes, offset);
    }
  }
  return archive;
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
