# Windows Setup and Start Design

**Status:** Approved under the existing Task 27 master-plan authorization

**Goal:** A user can clone the repository into a Windows path containing spaces or Chinese text, run one setup command, and start the local workbench without editing source files or risking existing workspace data.

## Scope

Task 27 adds an idempotent production bootstrap command, native PowerShell setup/start entry points, real PowerShell behavior tests, and Windows CI coverage. It does not package an installer, register a Windows service, expose the server beyond loopback, or change the workspace/backup formats.

## Architecture

PowerShell owns operating-system orchestration only: checking prerequisites, invoking pinned project commands, starting a process, polling health, opening the default browser, and reporting actionable errors. TypeScript remains authoritative for workspace initialization, SQLite migrations, prompt installation, and rule-pack validation/installation.

The production bootstrap command opens the same production composition used by normal startup and then closes it cleanly. Reusing that composition guarantees setup and start apply pending restores before workspace initialization, acquire the existing workspace lock, run migrations transactionally, recover interrupted workflows, and install current default resources through the same code path.

Default prompts remain active as today. The bundled incomplete Pinduoduo rule pack is installed once by `(platformId, region, version, checksum)` but is not activated automatically; activation remains an explicit user decision because its fee fields require review.

## Commands

### `scripts/setup.ps1`

- Accepts an optional `-WorkspacePath`; otherwise uses `%LOCALAPPDATA%\EcommerceWorkbench\workspace` through the application resolver.
- Sets strict PowerShell error behavior and resolves every repository file relative to `$PSScriptRoot`.
- Runs `node scripts/check-versions.mjs`, `pnpm install --frozen-lockfile`, `pnpm build`, then the compiled bootstrap CLI.
- Passes paths as argument-array elements rather than building command strings.
- May run repeatedly. It never deletes source files, workspace files, secrets, backups, or user records.

### `scripts/start.ps1`

- Validates the same Node/pnpm versions and requires the production build produced by setup.
- Accepts `-WorkspacePath`, a loopback port, a bounded health timeout, and `-NoBrowser` for automation.
- Starts `node apps/server/dist/index.js` with `HOST=127.0.0.1`, `PORT`, and optional `EAW_WORKSPACE_PATH` inherited only by the child process.
- Polls `http://127.0.0.1:<port>/api/v1/health` until it returns the expected `status: ok` and application version.
- Opens the browser only after health succeeds. Startup exit or timeout returns a nonzero error and terminates the started Node process.
- If the target port already serves a healthy matching workbench, it reuses that instance instead of starting a duplicate.

Shared PowerShell functions live in `scripts/windows/Workbench.psm1`; the two root scripts are thin parameter/exit-code entry points.

## Bootstrap and Default Resources

`apps/server/src/bootstrap.ts` exposes a callable `bootstrapWorkspace` and a CLI boundary. It resolves compiled asset/migration paths through file URLs, accepts a workspace path as a discrete CLI argument, constructs `createProductionApp`, and always closes the app in `finally`.

`apps/server/src/default-rule-packs.ts` reads the committed pack through strict rule schemas. It lists the target platform/region first and installs only when the exact version/checksum is absent. Existing packs, activation state, overrides, user data, and secrets remain untouched.

## Failure and Safety Rules

- Unsupported Node or pnpm fails before install/build/workspace mutation.
- Every native command checks `$LASTEXITCODE`; no later step runs after failure.
- Workspace paths inside the repository are rejected to preserve source/data separation.
- Production host is not user-configurable and remains `127.0.0.1`.
- Health polling uses a monotonic deadline and bounded request timeout.
- Error output may name the failed stage and public URL but must not print secrets or serialize the environment.
- Script implementation does not rely on Bash, symlinks, current working directory, case-sensitive paths, or LF-only parsing.

## Verification

Pester tests invoke real module/script behavior on Windows. They cover unsupported versions, native-command exit propagation, default workspace resolution, quoted Chinese/space paths, setup reruns, sentinel-data preservation, loopback-only start, health success, existing healthy-instance reuse, timeout cleanup, and `-NoBrowser`.

Vitest covers the TypeScript bootstrap and default-rule idempotency on all platforms. GitHub Actions retains the Windows/Ubuntu quality matrix and adds Windows-only Pester plus two consecutive setup runs against the same temporary workspace. The final gate includes frozen install, typecheck, lint, unit/integration tests, build, prompt/rule validation, and Git diff/portability audits.
