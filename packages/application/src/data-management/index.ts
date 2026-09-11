import { DomainError } from '@eaw/domain';
import type {
  PendingRestore,
  RestoreStatus,
  StoredWorkspaceBackup,
  WorkspaceBackupRecord,
} from '@eaw/workspace';

export const MAX_RESTORE_UPLOAD_BYTES = 512 * 1024 * 1024;

export interface BackupView extends WorkspaceBackupRecord {
  readonly downloadUrl: string;
}

export interface BackupDownload {
  readonly bytes: Uint8Array;
  readonly fileName: string;
}

export type RestoreStatusView =
  | { readonly state: 'idle' }
  | (PendingRestore & { readonly state: 'pending' })
  | Exclude<RestoreStatus, { state: 'idle' } | (PendingRestore & { state: 'pending' })>;

export interface DataManagementApplication {
  createBackup(): Promise<BackupView>;
  listBackups(): Promise<readonly BackupView[]>;
  readBackup(backupId: string): Promise<BackupDownload>;
  stageRestore(archive: Uint8Array): Promise<RestoreStatusView>;
  restoreStatus(): Promise<RestoreStatusView>;
}

export interface DataManagementApplicationDependencies {
  readonly createBackup: () => Promise<WorkspaceBackupRecord>;
  readonly listBackups: () => Promise<readonly WorkspaceBackupRecord[]>;
  readonly readBackup: (backupId: string) => Promise<StoredWorkspaceBackup>;
  readonly stageRestore: (archive: Uint8Array) => Promise<PendingRestore>;
  readonly restoreStatus: () => Promise<RestoreStatus>;
  readonly maxRestoreBytes?: number;
}

export function createDataManagementApplication({
  createBackup,
  listBackups,
  readBackup,
  stageRestore,
  restoreStatus,
  maxRestoreBytes = MAX_RESTORE_UPLOAD_BYTES,
}: DataManagementApplicationDependencies): DataManagementApplication {
  if (!Number.isSafeInteger(maxRestoreBytes) || maxRestoreBytes < 1) {
    throw new TypeError('Invalid restore upload limit.');
  }
  return {
    async createBackup() {
      return backupView(await createBackup());
    },
    async listBackups() {
      return Object.freeze((await listBackups()).map(backupView));
    },
    async readBackup(backupId) {
      const stored = await readBackup(backupId);
      return Object.freeze({
        bytes: Uint8Array.from(stored.bytes),
        fileName: `${stored.record.backupId}.eaw-backup.zip`,
      });
    },
    async stageRestore(archive) {
      if (archive.byteLength < 1 || archive.byteLength > maxRestoreBytes) {
        throw new DomainError('VALIDATION_ERROR', 'Workspace restore upload is invalid.');
      }
      try {
        return Object.freeze({
          ...(await stageRestore(Uint8Array.from(archive))),
          state: 'pending',
        });
      } catch (error) {
        if (error instanceof TypeError) {
          throw new DomainError('VALIDATION_ERROR', 'Workspace restore archive is invalid.');
        }
        throw error;
      }
    },
    async restoreStatus() {
      return restoreStatusView(await restoreStatus());
    },
  };
}

function backupView(record: WorkspaceBackupRecord): BackupView {
  return Object.freeze({
    appVersion: record.appVersion,
    backupId: record.backupId,
    createdAt: record.createdAt,
    size: record.size,
    downloadUrl: `/api/v1/data-management/backups/${record.backupId}/download`,
  });
}

function restoreStatusView(status: RestoreStatus): RestoreStatusView {
  if (status.state === 'idle') return Object.freeze({ state: 'idle' });
  if (status.state === 'pending') return Object.freeze({ ...status });
  if (status.state === 'applied') {
    return Object.freeze({
      state: 'applied',
      backupId: status.backupId,
      restoreId: status.restoreId,
      completedAt: status.completedAt,
    });
  }
  return Object.freeze({
    state: 'failed',
    backupId: status.backupId,
    restoreId: status.restoreId,
    completedAt: status.completedAt,
    message: status.message,
  });
}
