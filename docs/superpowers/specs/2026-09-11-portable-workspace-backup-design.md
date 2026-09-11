# 可移植工作区备份与事务恢复设计

**Status:** approved by the existing Task 26 master-plan scope and the user's instruction to continue inline.

## Goal

在工作台运行期间创建 SQLite 一致、不含密钥和机器路径的 ZIP 备份，并在新机器或当前工作区的下次启动时安全恢复。任何归档、校验、迁移、完整性或文件替换失败都不能破坏旧工作区。

## Scope

- ZIP 包含 `manifest.json`、`workspace.json`、SQLite 在线快照、`assets/**` 和 `rule-packs/**`。提示词、规则覆盖和业务数据已在 SQLite 中，随快照转移。
- 排除 `.secrets.json`、密钥 mutation lock、工作区 lock、`backups/**`、`exports/**`、`logs/**`、WAL/SHM 和迁移前快照。
- 备份创建、列表、下载，以及上传 ZIP 并安排下次启动恢复。
- 不在开着的进程中热替换 repository 所使用的 SQLite。上传后明确显示“需重启”；Task 27 的 Windows 启动器负责自动重启体验。
- 不做云同步、增量备份、密码加密、远程存储或自动定时备份。

## Archive contract

`manifest.json` 是 UTF-8 JSON，严格字段为：

```ts
interface BackupManifest {
  format: 'eaw-workspace-backup';
  formatVersion: 1;
  appVersion: string;
  workspaceVersion: 1;
  backupId: string;
  createdAt: string;
  files: readonly {
    path: string;
    sha256: string;
    size: number;
  }[];
}
```

`files` 使用正斜杠相对路径并按路径升序。每个条目只允许一次，必须同时通过 ZIP CRC32 和 manifest SHA-256/字节数校验。恢复必须拒绝绝对路径、`..`、反斜杠歧义、重复名、大小写冲突、符号链接、加密条目、未支持压缩方法、ZIP bomb 和未在 manifest 声明的文件。

## Backup flow

1. 在工作区 `backups/` 中创建不可预测的临时目录。
2. 对已打开的 `DatabaseSync` 调用 Node.js `sqlite.backup()`，保证 WAL 活跃时仍得到一个可独立打开的快照。
3. 仅遍历允许的工作区目录，对每个组件执行 `lstat` 并拒绝符号链接或非常规文件。
4. 计算 manifest，以 store-only ZIP 生成临时文件，`fsync` 后重命名为 `<backupId>.eaw-backup.zip`。
5. 无论成功失败都清理临时快照；不读取或写入密钥文件。

## Restore flow

1. 上传时限制归档和解压总量，完整解析 ZIP 中央目录并校验 manifest。
2. 在 `backups/restore-<id>/` 下解压到全新暂存目录，用独占创建防止跟随旧文件或符号链接。
3. 在暂存 SQLite 上执行当前迁移和 `PRAGMA integrity_check`；高于当前 app/workspace 版本的备份失败关闭。
4. 只有全部通过后才写入原子 pending marker。旧工作区此时完全未变。
5. 下次启动在获取 workspace lock/打开生产数据库之前，为受管目标创建同父目录 rollback 副本，逐项原子重命名。任何一项失败立即逆序回滚。
6. 成功后保留本机 `.secrets.json`，删除 pending marker 并记录不含秘密的恢复状态；失败后启动旧工作区并记录安全错误。

## API and UI

- `GET /api/v1/data-management/backups`：列出已验证本地备份。
- `POST /api/v1/data-management/backups`：创建备份，返回 201 和 manifest 摘要。
- `GET /api/v1/data-management/backups/:backupId/download`：下载 ZIP，不暴露本机路径。
- `POST /api/v1/data-management/restores`：接收 `application/zip` 原始字节，验证并暂存，返回 202 和 `restartRequired: true`。
- `GET /api/v1/data-management/restore-status`：返回 `idle | pending | applied | failed`和脱敏消息。

数据管理页只在用户显式点击时创建备份或上传恢复；必须显示备份时间、大小、版本、下载入口、“密钥不包含”和重启说明。

## Cross-platform invariants

- 运行时固定 Node.js 24.19.0 / pnpm 11.22.0，不调用外部 `zip`、`unzip`、shell 或 POSIX-only API。
- 所有归档路径均为 `/` 分隔的规范相对路径；落盘时通过已有 workspace path guard 转换。
- 测试使用包含中文和空格的目录，并用 `node:path.win32` 模拟 Windows 绝对路径、反斜杠和大小写冲突。
