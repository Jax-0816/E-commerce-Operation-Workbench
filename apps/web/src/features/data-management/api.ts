export interface BackupRecord {
  readonly appVersion: string;
  readonly backupId: string;
  readonly createdAt: string;
  readonly size: number;
  readonly downloadUrl: string;
}

export type RestoreStatus =
  | { readonly state: 'idle' }
  | {
      readonly state: 'pending';
      readonly backupId: string;
      readonly restoreId: string;
      readonly stagedAt: string;
      readonly restartRequired: true;
    }
  | {
      readonly state: 'applied';
      readonly backupId: string;
      readonly restoreId: string;
      readonly completedAt: string;
    }
  | {
      readonly state: 'failed';
      readonly backupId: string;
      readonly restoreId: string;
      readonly completedAt: string;
      readonly message: string;
    };

export interface DataManagementApi {
  listBackups(): Promise<readonly BackupRecord[]>;
  createBackup(): Promise<BackupRecord>;
  stageRestore(file: File): Promise<RestoreStatus>;
  restoreStatus(): Promise<RestoreStatus>;
}

export function createBrowserDataManagementApi(fetcher: typeof fetch = fetch): DataManagementApi {
  const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error('数据管理操作失败');
    return response.json() as Promise<T>;
  };
  return {
    async listBackups() {
      const response = await request<{ readonly items: readonly BackupRecord[] }>(
        '/api/v1/data-management/backups',
      );
      return response.items;
    },
    createBackup: () =>
      request('/api/v1/data-management/backups', {
        method: 'POST',
      }),
    stageRestore: (file) =>
      request('/api/v1/data-management/restores', {
        method: 'POST',
        headers: { 'content-type': 'application/zip' },
        body: file,
      }),
    restoreStatus: () => request('/api/v1/data-management/restore-status'),
  };
}
