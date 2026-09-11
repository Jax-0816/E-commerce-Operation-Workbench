# Portable Workspace Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SQLite-consistent, secret-free portable ZIP backups and fail-safe staged restore for the local workbench.

**Architecture:** `@eaw/workspace` owns the strict manifest, bounded ZIP codec, online SQLite snapshot, staging, and rollback-safe file swap. The application layer exposes explicit backup/restore use cases through ports; Fastify composes them with the live database and applies a validated pending restore before opening the next production database. React provides an explicit data-management workflow and never restores automatically while the current process is serving requests.

**Tech Stack:** TypeScript 6, Node.js 24.19.0 (`node:sqlite`, `node:zlib`, `node:crypto`, `node:fs`), Fastify 5, React 19, Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-11-portable-workspace-backup-design.md`

## Global Constraints

- Use Node.js 24.19.0 and pnpm 11.22.0; frozen install must remain unchanged.
- Do not add an archive dependency or invoke external ZIP/shell programs.
- Never archive `.secrets.json`, mutation/workspace locks, backups, exports, logs, WAL/SHM, absolute paths, or machine-specific paths.
- Every archive and extracted file is bounded, checksummed, duplicate/case-conflict checked, and symlink-safe.
- Restore does not hot-swap an open production database; it stages now and applies before database open on the next startup.
- A failed validation, migration, integrity check, or swap preserves the old workspace.
- Each verified task is committed and pushed to `origin/codex/phase-0`; confirm `HEAD...origin/codex/phase-0` is `0 0` before continuing.
- Every task checks Windows-sensitive behavior including Chinese/space paths, separators, drive/UNC paths, CRLF, case conflicts, process assumptions, symlinks, and SQLite portability.

---

### Task 1: Strict manifest and bounded ZIP codec

**Files:**

- Create: `packages/workspace/src/manifest.ts`
- Create: `packages/workspace/src/archive-security.ts`
- Create: `packages/workspace/src/archive-security.test.ts`
- Modify: `packages/workspace/src/index.ts`

**Interfaces:**

- Consumes: `normalizeWorkspaceRelativePath(storedPath: string): string`.
- Produces: `BackupManifest`, `BackupFileEntry`, `parseBackupManifest(value, currentAppVersion)`, `createBackupArchive(manifest, files)`, and `readBackupArchive(bytes, currentAppVersion)`.

- [x] **Step 1: Write the failing archive security tests**

Test one valid store-only ZIP round trip and rejection of `../`, `/absolute`, `C:\absolute`, duplicate names, case-only conflicts, backslash names, encrypted entries, bad CRC, unlisted entries, checksum/size mismatch, unsupported/newer versions, entry-count limits, per-entry limits, and inflated-total limits. Assert the valid manifest uses only sorted `/`-separated relative paths and cannot include `manifest.json` as a payload.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @eaw/workspace exec vitest run src/archive-security.test.ts`

Expected: FAIL because `archive-security.ts` and `manifest.ts` do not exist.

- [x] **Step 3: Implement strict manifest parsing**

Use exact-key record checks, ISO timestamp round-trip checks, canonical UUID checks, safe integer byte lengths, lowercase 64-character SHA-256, sorted unique paths, `format === 'eaw-workspace-backup'`, `formatVersion === 1`, `workspaceVersion === 1`, and `backup.appVersion <= currentAppVersion`.

- [x] **Step 4: Implement the bounded ZIP writer/reader**

Write store-only local/central/end records with CRC32. Read central-directory metadata before extraction; reject flags/methods/sizes/names that violate the spec. Decode UTF-8 fatally, compare local and central names, validate CRC32, SHA-256 and size, and return a deeply immutable `{ manifest, files: ReadonlyMap<string, Uint8Array> }`.

- [x] **Step 5: Run package gates and commit/push**

Run workspace focused/full tests, typecheck, lint, build, Prettier and `git diff --check`. Commit `feat: add secure workspace backup archive` and push only after all pass.

---

### Task 2: SQLite-consistent secret-free backup creation

**Files:**

- Create: `packages/workspace/src/backup.ts`
- Create: `packages/workspace/src/backup.integration.test.ts`
- Modify: `packages/workspace/src/index.ts`

**Interfaces:**

- Consumes: an open `DatabaseSync`, initialized `workspacePath`, `appVersion`, injected `now/idFactory`, and the Task 1 archive codec.
- Produces: `createWorkspaceBackup(input): Promise<WorkspaceBackupRecord>`, `listWorkspaceBackups(input)`, and `readWorkspaceBackup(input)`.

- [ ] **Step 1: Write failing integration tests**

Create a workspace under a Chinese/space path, keep WAL writes active, add asset/rule-pack files and `.secrets.json`, then assert the backup database passes `PRAGMA integrity_check`, contains the committed rows, includes allowed files, contains no secret value/name or absolute source path, and can be listed/read after restart. Add symlink and non-regular-file rejection plus deterministic cleanup after injected failure.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @eaw/workspace exec vitest run src/backup.integration.test.ts`

Expected: FAIL because `createWorkspaceBackup` is missing.

- [ ] **Step 3: Implement the online snapshot and safe collector**

Use `node:sqlite.backup()` into an exclusive temporary directory under `backups/`. Collect only `workspace.json`, the snapshot as `database/workbench.sqlite`, regular files below `assets/` and `rule-packs/`; reject symlinks at every level and sort paths before hashing.

- [ ] **Step 4: Publish and discover immutable backup files**

Write the archive to an exclusive temporary file, sync, rename to `<backupId>.eaw-backup.zip`, and clean the temporary directory in `finally`. Listing must parse/validate candidate archives and never return physical paths; reading requires a canonical backup ID and resolves only inside `backups/`.

- [ ] **Step 5: Run package gates and commit/push**

Run focused/full workspace tests, typecheck, lint, build, Prettier and `git diff --check`. Commit `feat: create consistent workspace backups`, push, and verify `0 0`.

---

### Task 3: Staged transactional restore and startup recovery

**Files:**

- Create: `packages/workspace/src/restore.ts`
- Create: `packages/workspace/src/restore.integration.test.ts`
- Modify: `packages/workspace/src/index.ts`

**Interfaces:**

- Consumes: Task 1 archive validator, initialized workspace path, current app version, and `validateDatabase(databasePath): Promise<void>` supplied by the production composition.
- Produces: `stageWorkspaceRestore(input): Promise<PendingRestore>`, `applyPendingWorkspaceRestore(input): Promise<RestoreStatus>`, and `readWorkspaceRestoreStatus(workspacePath)`.

- [ ] **Step 1: Write failing restore tests**

Cover a successful backup from one Chinese/space workspace restored into another, current local secret preservation, newer-version/corrupt/checksum/traversal/case-conflict rejection, database migration/integrity failure before marker creation, failure during each rename with reverse rollback, stale temporary cleanup, and idempotent restart after an applied restore.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @eaw/workspace exec vitest run src/restore.integration.test.ts`

Expected: FAIL because restore APIs do not exist.

- [ ] **Step 3: Implement validation and staging**

Read the archive through Task 1, extract each declared payload using exclusive file creation below a real staging directory, sync files, invoke `validateDatabase` against the staged SQLite, then atomically write a pending marker that contains only backup ID, stage directory name, created time and manifest hash.

- [ ] **Step 4: Implement rollback-safe apply**

Before workspace initialization/database open, revalidate the stage and database. Move existing `database`, `assets`, `rule-packs`, and `workspace.json` to a same-parent rollback directory, move staged replacements into place, and on any error reverse every completed rename. Never replace `.secrets.json`, `backups`, `exports`, `logs`, or locks. Persist a sanitized applied/failed status and make a repeated startup a no-op.

- [ ] **Step 5: Run package gates and commit/push**

Run focused/full workspace tests, typecheck, lint, build, Prettier and `git diff --check`. Commit `feat: add transactional workspace restore`, push, and verify `0 0`.

---

### Task 4: Data-management use cases, HTTP contracts, routes, and production composition

**Files:**

- Create: `packages/application/src/data-management/index.ts`
- Create: `packages/application/src/data-management/data-management.test.ts`
- Modify: `packages/application/src/index.ts`
- Create: `packages/contracts/src/data-management.ts`
- Create: `packages/contracts/src/data-management.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/server/src/routes/data-management.ts`
- Create: `apps/server/src/routes/data-management.test.ts`
- Modify: `apps/server/src/{context,app,runtime,index}.ts`
- Modify: `apps/server/src/runtime.integration.test.ts`

**Interfaces:**

- Consumes: workspace backup/list/read/stage/apply/status functions, live `OpenDatabase.sqlite`, `migrateDatabase`, `checkIntegrity`, `APP_VERSION`, migrations directory, and workspace path.
- Produces: `DataManagementApplication` methods `createBackup`, `listBackups`, `readBackup`, `stageRestore`, `restoreStatus`; the five `/api/v1/data-management` endpoints from the design.

- [ ] **Step 1: Write failing application and contract tests**

Assert use cases call only explicit ports, reject oversized/empty uploads, never expose paths, and return exact backup/status DTOs. Contracts must reject unknown fields, invalid IDs/timestamps/hash/size/version/status combinations and `pending` without `restartRequired: true`.

- [ ] **Step 2: Implement minimal use cases and strict schemas**

Keep binary bytes at the port boundary; expose only backup ID, created time, version, size, download URL, state and sanitized message. No secret store is a dependency of this feature.

- [ ] **Step 3: Write failing Fastify and restart tests**

Assert 404/503 before registration/composition, 201 create, 200 list/download/status, 202 ZIP stage, strict content type/body limit, sanitized corrupt-archive response, and a two-process-equivalent restart where pending restore applies before the production database opens.

- [ ] **Step 4: Implement routes and production startup ordering**

Register an `application/zip` parser with a bounded byte limit. Compose data management with the live database for backup and with a staged-database validator that opens, migrates, checks integrity, and closes. Call pending-restore apply before `initializeWorkspace`, workspace lock acquisition, and production database open; failure records status and continues with the preserved old workspace.

- [ ] **Step 5: Run application/contracts/server gates and commit/push**

Run all three packages' tests, typecheck, lint, build, Prettier and `git diff --check`. Commit `feat: expose portable workspace data management`, push, and verify `0 0`.

---

### Task 5: Data-management UI and Phase 12 cross-machine acceptance

**Files:**

- Create: `apps/web/src/features/data-management/api.ts`
- Create: `apps/web/src/features/data-management/data-management-panel.tsx`
- Create: `apps/web/src/features/data-management/data-management-panel.test.tsx`
- Modify: `apps/web/src/{app.tsx,styles.css}`
- Modify: `apps/web/src/routing/{workbench-router.tsx,workbench-router.test.tsx}`
- Modify: `apps/server/scripts/e2e-server.ts`
- Create: `tests/e2e/phase-12-backup-restore.spec.ts`

**Interfaces:**

- Consumes: Task 4 HTTP endpoints.
- Produces: `DataManagementApi`, `createBrowserDataManagementApi()`, and an implemented `/capabilities/data` page.

- [ ] **Step 1: Write failing React tests**

Assert initial list/status, explicit create only, accessible busy/success/error announcements, download link filename, secret-exclusion copy, ZIP-only file selection, explicit restore confirmation, restart-required message, and stale-response isolation. No action occurs on mount.

- [ ] **Step 2: Implement browser API and panel**

POST backup with no body, download through a same-origin URL, upload the selected `File` as `application/zip`, and render semantic history/status. Disable duplicate mutations and reset the file input only after a successful stage.

- [ ] **Step 3: Add deterministic Phase 12 acceptance**

Create a product/fact and configured fake secret, create/download a backup, mutate the source workspace, upload the archive into a separate Chinese/space workspace, restart the E2E server against that workspace, and verify the backed-up product is present while the source secret value and absolute path are absent from archive bytes. Corrupt restore must leave the target product intact.

- [ ] **Step 4: Run web/E2E gates and commit/push**

Run Web tests/typecheck/lint/build, changed-file Prettier, Phase 2/3/10/11/12 Playwright, and `git diff --check`. Commit `feat: add portable data management workspace`, push, and verify `0 0`.

---

### Task 6: Task 26 release gates and records

**Files:**

- Modify: `docs/superpowers/plans/2026-08-19-ecommerce-ai-workbench-implementation.md`
- Modify: `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`
- Modify: `docs/superpowers/plans/2026-09-11-portable-workspace-backup.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:** None beyond the completed Task 26 deliverable.

- [ ] **Step 1: Run every release gate under exact tools**

```bash
node scripts/check-versions.mjs
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:prompts
pnpm validate:rule-packs
pnpm test:e2e
git diff --check
```

Expected: every gate passes under Node.js 24.19.0 / pnpm 11.22.0 with zero paid AI calls.

- [ ] **Step 2: Run the Windows portability audit**

Verify no case-conflicting tracked paths, tracked symlinks, CRLF-sensitive parser, machine-specific absolute path, external archive command, or POSIX-only replacement assumption. Repeat the cross-machine restore test with `win32` path fixtures; Task 29 will repeat the complete project from a fresh GitHub clone on real Windows and Ubuntu.

- [ ] **Step 3: Update records and commit/push**

Mark Task 26 complete and Task 27 in progress. Record exact test counts, WAL snapshot/integrity evidence, archive attack rejection, secret/path exclusion, cross-machine success, rollback behavior, and GitHub sync. Commit `feat: add safe portable workspace backup`, push, and verify `0 0`.
