import { normalizeWorkspaceRelativePath } from './paths.js';

export interface BackupFileEntry {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}

export interface BackupManifest {
  readonly format: 'eaw-workspace-backup';
  readonly formatVersion: 1;
  readonly appVersion: string;
  readonly workspaceVersion: 1;
  readonly backupId: string;
  readonly createdAt: string;
  readonly files: readonly BackupFileEntry[];
}

const manifestKeys = [
  'appVersion',
  'backupId',
  'createdAt',
  'files',
  'format',
  'formatVersion',
  'workspaceVersion',
] as const;
const fileKeys = ['path', 'sha256', 'size'] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function parseBackupManifest(value: unknown, currentAppVersion: string): BackupManifest {
  const record = exactRecord(value, manifestKeys, 'backup manifest');
  if (
    record.format !== 'eaw-workspace-backup' ||
    record.formatVersion !== 1 ||
    record.workspaceVersion !== 1 ||
    typeof record.appVersion !== 'string' ||
    compareVersions(record.appVersion, currentAppVersion) > 0 ||
    typeof record.backupId !== 'string' ||
    !uuidPattern.test(record.backupId) ||
    typeof record.createdAt !== 'string' ||
    !isCanonicalTimestamp(record.createdAt) ||
    !Array.isArray(record.files)
  ) {
    throw invalid('backup manifest');
  }

  const files = record.files.map((value) => parseFile(value));
  for (let index = 0; index < files.length; index += 1) {
    const previous = files[index - 1];
    const current = files[index]!;
    if (previous && previous.path >= current.path) throw invalid('backup file order');
  }
  const lowerPaths = new Set(files.map(({ path }) => path.toLowerCase()));
  if (lowerPaths.size !== files.length) throw invalid('backup file path');

  return Object.freeze({
    format: 'eaw-workspace-backup',
    formatVersion: 1,
    appVersion: record.appVersion,
    workspaceVersion: 1,
    backupId: record.backupId,
    createdAt: record.createdAt,
    files: Object.freeze(files),
  });
}

export function isBackupPayloadPath(path: string): boolean {
  if (path.includes('\\') || path === 'manifest.json') return false;
  try {
    if (normalizeWorkspaceRelativePath(path) !== path) return false;
  } catch {
    return false;
  }
  return (
    path === 'workspace.json' ||
    path === 'database/workbench.sqlite' ||
    path.startsWith('assets/') ||
    path.startsWith('rule-packs/')
  );
}

function parseFile(value: unknown): BackupFileEntry {
  const record = exactRecord(value, fileKeys, 'backup file');
  if (
    typeof record.path !== 'string' ||
    !isBackupPayloadPath(record.path) ||
    typeof record.sha256 !== 'string' ||
    !sha256Pattern.test(record.sha256) ||
    !Number.isSafeInteger(record.size) ||
    (record.size as number) < 0
  ) {
    throw invalid('backup file');
  }
  return Object.freeze({
    path: record.path,
    sha256: record.sha256,
    size: record.size as number,
  });
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index]! - rightParts[index]!;
  }
  return 0;
}

function parseVersion(value: string): readonly number[] {
  const match = value.match(versionPattern);
  if (!match) throw invalid('application version');
  return match.slice(1).map(Number);
}

function isCanonicalTimestamp(value: string): boolean {
  const date = new Date(value);
  return Number.isSafeInteger(date.getTime()) && date.toISOString() === value;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  ) {
    throw invalid(label);
  }
  return value as Record<string, unknown>;
}

function invalid(label: string): TypeError {
  return new TypeError(`Invalid ${label}.`);
}
