import { useEffect, useRef, useState } from 'react';

import type { BackupRecord, DataManagementApi, RestoreStatus } from './api.js';

export function DataManagementPanel({
  api,
}: {
  readonly api: DataManagementApi;
}): React.JSX.Element {
  const [backups, setBackups] = useState<readonly BackupRecord[]>([]);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>({ state: 'idle' });
  const [selectedFile, setSelectedFile] = useState<File>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'create' | 'restore'>();
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    setError('');
    void Promise.all([api.listBackups(), api.restoreStatus()])
      .then(([records, status]) => {
        if (!current) return;
        setBackups(records);
        setRestoreStatus(status);
      })
      .catch(() => {
        if (current) setError('读取备份与恢复状态失败，请重试');
      });
    return () => {
      current = false;
    };
  }, [api]);

  const createBackup = async () => {
    if (busy) return;
    setBusy('create');
    setAnnouncement('正在创建备份');
    setError('');
    try {
      const created = await api.createBackup();
      setBackups((current) => [
        created,
        ...current.filter(({ backupId }) => backupId !== created.backupId),
      ]);
      setAnnouncement('备份已创建，可下载并保存到其他电脑');
    } catch {
      setAnnouncement('');
      setError('创建备份失败，请重试');
    } finally {
      setBusy(undefined);
    }
  };

  const stageRestore = async () => {
    if (busy || !selectedFile || !confirmed) return;
    setBusy('restore');
    setAnnouncement('正在验证备份文件');
    setError('');
    try {
      const status = await api.stageRestore(selectedFile);
      setRestoreStatus(status);
      setSelectedFile(undefined);
      setConfirmed(false);
      if (fileInput.current) fileInput.current.value = '';
      setAnnouncement('备份已验证，请重启工作台后恢复');
    } catch {
      setAnnouncement('');
      setError('恢复文件验证失败，现有工作区未更改');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section aria-label="工作区数据管理" className="data-management-panel">
      <div className="data-management-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PORTABLE BACKUP</p>
              <h2>可移植工作区备份</h2>
            </div>
            <button disabled={busy !== undefined} onClick={() => void createBackup()} type="button">
              {busy === 'create' ? '创建中…' : '创建新备份'}
            </button>
          </div>
          <p className="notice">备份不包含 API 密钥、本机绝对路径、日志或临时文件。</p>
          {backups.length === 0 ? (
            <p className="empty-state">尚无可用备份。</p>
          ) : (
            <ul className="backup-list">
              {backups.map((backup) => (
                <li key={backup.backupId}>
                  <div>
                    <strong>{backup.backupId}</strong>
                    <span>
                      {formatTime(backup.createdAt)} · v{backup.appVersion} ·{' '}
                      {formatBytes(backup.size)}
                    </span>
                  </div>
                  <a download={`${backup.backupId}.eaw-backup.zip`} href={backup.downloadUrl}>
                    下载 ZIP
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SAFE RESTORE</p>
              <h2>从备份恢复</h2>
            </div>
            <strong className={restoreStatus.state === 'failed' ? 'status-risk' : 'status-muted'}>
              {restoreStatusLabel(restoreStatus)}
            </strong>
          </div>
          <p>恢复会先完整验证 ZIP 和数据库；当前数据只会在下次启动时事务替换。</p>
          <label>
            选择备份 ZIP
            <input
              accept=".zip,application/zip"
              aria-label="选择备份 ZIP"
              disabled={busy !== undefined}
              onChange={(event) => {
                const file = event.target.files?.[0];
                setConfirmed(false);
                setAnnouncement('');
                if (!file || !isZip(file)) {
                  setSelectedFile(undefined);
                  setError('请选择有效的 ZIP 备份文件');
                  return;
                }
                setSelectedFile(file);
                setError('');
              }}
              ref={fileInput}
              type="file"
            />
          </label>
          {selectedFile ? (
            <div className="restore-confirmation">
              <p>已选择：{selectedFile.name}</p>
              <label>
                <input
                  aria-label="确认下次启动恢复"
                  checked={confirmed}
                  disabled={busy !== undefined}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  type="checkbox"
                />
                我确认在下次启动时用此备份替换业务数据
              </label>
              <button
                className="button-secondary"
                disabled={!confirmed || busy !== undefined}
                onClick={() => void stageRestore()}
                type="button"
              >
                {busy === 'restore' ? '验证中…' : '确认安排恢复'}
              </button>
            </div>
          ) : null}
        </section>
      </div>
      {announcement ? <p role="status">{announcement}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function isZip(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.zip') &&
    (file.type === '' || file.type === 'application/zip')
  );
}

function restoreStatusLabel(status: RestoreStatus): string {
  switch (status.state) {
    case 'idle':
      return '无待恢复任务';
    case 'pending':
      return '等待重启';
    case 'applied':
      return '最近恢复成功';
    case 'failed':
      return '最近恢复失败';
  }
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
