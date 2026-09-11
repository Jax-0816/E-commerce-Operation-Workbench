export { initializeWorkspace } from './bootstrap.js';
export type { InitializedWorkspace } from './bootstrap.js';
export { isPathContained } from './filesystem.js';
export { acquireWorkspaceLock } from './lock.js';
export type { AcquireWorkspaceLockOptions, WorkspaceLock } from './lock.js';
export {
  normalizeWorkspaceRelativePath,
  resolveDefaultWorkspace,
  resolveWorkspacePath,
} from './paths.js';
export type { WorkspaceEnvironment, WorkspacePlatform } from './paths.js';
export { createSecretConfigurationStatus, FileSecretStore } from './secrets.js';
export type { SecretConfigurationStatus, SecretStore } from './secrets.js';
export { createBackupArchive, readBackupArchive } from './archive-security.js';
export type { BackupArchive } from './archive-security.js';
export { isBackupPayloadPath, parseBackupManifest } from './manifest.js';
export type { BackupFileEntry, BackupManifest } from './manifest.js';
export { createWorkspaceBackup, listWorkspaceBackups, readWorkspaceBackup } from './backup.js';
export type {
  CreateWorkspaceBackupInput,
  ReadWorkspaceBackupInput,
  StoredWorkspaceBackup,
  WorkspaceBackupRecord,
} from './backup.js';
export {
  applyPendingWorkspaceRestore,
  readWorkspaceRestoreStatus,
  stageWorkspaceRestore,
} from './restore.js';
export type {
  ApplyPendingWorkspaceRestoreInput,
  PendingRestore,
  RestoreStatus,
  StageWorkspaceRestoreInput,
} from './restore.js';
