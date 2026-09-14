# Windows Setup and Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver idempotent PowerShell setup and production start commands that preserve user data, bind only to loopback, work from Chinese/space paths, and pass real Windows CI.

**Architecture:** Keep workspace, migration, prompt, and rule behavior in the existing TypeScript production composition. Add one bootstrap CLI, then use a focused PowerShell module for native command execution, path safety, process startup, bounded health polling, and optional browser opening; root scripts remain thin entry points.

**Tech Stack:** Node.js 24.19.0, pnpm 11.22.0, TypeScript 6.0.3, Fastify 5.12.1, PowerShell 7, Pester, GitHub Actions Windows/Ubuntu matrix.

**Spec:** `docs/superpowers/specs/2026-09-14-windows-setup-start-design.md`

## Global Constraints

- Node.js must satisfy `>=24.19.0 <25`; pnpm must equal `11.22.0`.
- Source and workspace data remain separate; setup rejects a workspace located inside the repository.
- Production binds only to `127.0.0.1`; scripts never accept a public host override.
- PowerShell sets strict errors, checks every native exit code, passes arguments as arrays, and resolves repository paths from `$PSScriptRoot` rather than the caller's current directory.
- Setup and start must preserve existing SQLite data, secrets, assets, backups, rule state, and generated history.
- The bundled incomplete rule pack may be installed but must not be activated automatically.
- No Bash, symlink, external ZIP, Docker, global source edits, paid provider calls, or hard-coded machine paths.
- Every implementation task follows RED → GREEN → refactor, then commits and pushes before the next task.

---

### Task 1: Idempotent production bootstrap and default rule installation

**Files:**

- Create: `apps/server/src/default-rule-packs.ts`
- Create: `apps/server/src/default-rule-packs.test.ts`
- Create: `apps/server/src/bootstrap.ts`
- Create: `apps/server/src/bootstrap.integration.test.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/server/package.json`

**Interfaces:**

- Consumes: `RulePacksApplication.list/import`, `createProductionApp`, `createServerStartupOptions`, committed `default-rule-packs/pinduoduo-cn/{manifest,rules}.json`.
- Produces: `ensureDefaultRulePacks(rules: Pick<RulePacksApplication, 'list' | 'import'>): Promise<void>` and `bootstrapWorkspace(input: { moduleUrl: string; workspacePath?: string; environment?: WorkspaceEnvironment; platform?: WorkspacePlatform }): Promise<void>`.

- [ ] **Step 1: Write failing default-resource tests**

  Add tests with a real in-memory application port that prove a fresh call imports the committed pack once, a second call imports nothing, an existing exact version/checksum remains unchanged, and an existing same version with a different checksum fails instead of overwriting history. The mutation each test catches is an unconditional import, silent checksum drift, or automatic activation.

  ```ts
  await ensureDefaultRulePacks(rules);
  await ensureDefaultRulePacks(rules);
  expect(await rules.list('pinduoduo', 'CN')).toHaveLength(1);
  expect((await rules.list('pinduoduo', 'CN'))[0]?.active).toBe(false);
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `pnpm --filter @eaw/server exec vitest run src/default-rule-packs.test.ts`

  Expected: FAIL because `default-rule-packs.ts` does not exist.

- [ ] **Step 3: Implement minimal default installation and compose it**

  Read and strictly parse both committed JSON files, list by `pinduoduo/CN`, compare version and checksum, import only when absent, and throw on same-version checksum drift. Call it immediately after `createRulePacksApplication` in `createProductionApp`; never call `activate`.

  ```ts
  const sameVersion = installed.find(
    ({ pack }) => pack.manifest.version === bundled.manifest.version,
  );
  if (sameVersion && sameVersion.pack.manifest.checksum !== bundled.manifest.checksum) {
    throw new Error('Bundled rule pack checksum changed without a version change.');
  }
  if (!sameVersion) await rules.import(JSON.stringify(bundled));
  ```

- [ ] **Step 4: Write and verify failing bootstrap integration tests**

  Run the wished-for `bootstrapWorkspace` twice against a real temporary workspace whose path contains `工作台 空格`. Assert `workspace.json`, `database/workbench.sqlite`, all current migrations, seven active prompts, and one inactive default rule pack; insert a sentinel product between calls and assert it survives. Also assert malformed CLI arguments exit nonzero without creating a workspace.

  Run: `pnpm --filter @eaw/server exec vitest run src/bootstrap.integration.test.ts`

  Expected: FAIL because `bootstrapWorkspace` and its CLI do not exist.

- [ ] **Step 5: Implement and verify the bootstrap CLI**

  Implement argument parsing for only `--workspace <path>`, resolve migrations from the compiled module URL, call `createProductionApp`, and always close in `finally`. Add `"bootstrap": "node dist/bootstrap.js"` to the server package.

  ```ts
  const app = await createProductionApp(options);
  try {
    await app.ready();
  } finally {
    await app.close();
  }
  ```

  Run the two focused tests, then Server tests/typecheck/lint/build and `git diff --check`.

- [ ] **Step 6: Commit and push**

  ```bash
  git add apps/server/src/default-rule-packs.ts apps/server/src/default-rule-packs.test.ts apps/server/src/bootstrap.ts apps/server/src/bootstrap.integration.test.ts apps/server/src/runtime.ts apps/server/package.json
  git commit -m "feat: add idempotent workspace bootstrap"
  git push origin codex/phase-0
  ```

  Verify `git rev-list --left-right --count HEAD...origin/codex/phase-0` is `0 0`.

---

### Task 2: Tested PowerShell command and path safety module

**Files:**

- Create: `scripts/windows/Workbench.psm1`
- Create: `tests/scripts/Workbench.Tests.ps1`
- Create: `tests/scripts/run-pester.ps1`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: `Invoke-WorkbenchNative`, `Assert-WorkbenchRuntime`, `Resolve-WorkbenchWorkspacePath`, and `Test-WorkbenchHealth` exported by `Workbench.psm1`.
- Consumes: root `package.json`, `scripts/check-versions.mjs`, `System.IO.Path`, and `Invoke-RestMethod`.

- [ ] **Step 1: Add the Windows Pester entry and failing behavior tests**

  Add a Windows-only CI step using the runner's PowerShell and Pester. Tests execute functions rather than inspect source text. Cover: unsupported Node/pnpm raises before a marker command runs; a child exit code becomes a terminating error; default workspace resolves below `LOCALAPPDATA`; explicit Chinese/space path remains exact; repository descendants are rejected; health accepts only `{ status: 'ok', appVersion: '0.1.0' }` and stops at a bounded deadline.

  ```powershell
  It 'preserves a quoted Chinese workspace path as one argument' {
    $resolved = Resolve-WorkbenchWorkspacePath -RepositoryRoot $repo -WorkspacePath $target
    $resolved | Should -Be ([IO.Path]::GetFullPath($target))
  }
  ```

- [ ] **Step 2: Run Pester and verify RED**

  Run: `pwsh -NoLogo -NoProfile -File tests/scripts/run-pester.ps1` (or `Invoke-Pester tests/scripts/Workbench.Tests.ps1 -CI` on Windows).

  Expected: FAIL because `scripts/windows/Workbench.psm1` does not exist.

- [ ] **Step 3: Implement the minimal module**

  Use `& $FilePath @ArgumentList`, inspect `$LASTEXITCODE`, and throw a stable stage error. Normalize with `[IO.Path]::GetFullPath`; compare repository containment with `OrdinalIgnoreCase`. Runtime validation delegates to the existing version checker. Health polling accepts injected request/sleep script blocks only as public orchestration dependencies; tests assert returned health values and elapsed/attempt behavior, never mock call existence.

  ```powershell
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Workbench command failed with exit code $LASTEXITCODE: $FilePath"
  }
  ```

- [ ] **Step 4: Verify GREEN and PowerShell portability**

  Run Pester on PowerShell 7, then root script Vitest, formatting, and `git diff --check`. Confirm module import works when the repository path and current directory differ.

- [ ] **Step 5: Commit and push**

  ```bash
  git add scripts/windows/Workbench.psm1 tests/scripts/Workbench.Tests.ps1 tests/scripts/run-pester.ps1 .github/workflows/ci.yml
  git commit -m "feat: add Windows command safety module"
  git push origin codex/phase-0
  ```

---

### Task 3: Idempotent `setup.ps1`

**Files:**

- Create: `scripts/setup.ps1`
- Create: `tests/scripts/setup.Tests.ps1`
- Modify: `scripts/windows/Workbench.psm1`
- Modify: `tests/scripts/run-pester.ps1`

**Interfaces:**

- Produces: `Invoke-WorkbenchSetup -RepositoryRoot <string> -WorkspacePath <string?>` and the root `scripts/setup.ps1 [-WorkspacePath <string>]` entry point.
- Consumes: `Assert-WorkbenchRuntime`, `Resolve-WorkbenchWorkspacePath`, `pnpm install --frozen-lockfile`, `pnpm build`, and `node apps/server/dist/bootstrap.js --workspace <path>`.

- [ ] **Step 1: Write the failing real setup test**

  Invoke `scripts/setup.ps1` from a different current directory against a temporary `工作台 安装` workspace. After the first run, add `keep.txt`; run setup again and assert the file contents, workspace metadata, database, and default resources remain. A separate fixture puts the workspace under the repository and expects failure before creation.

  ```powershell
  & $setup -WorkspacePath $workspace
  Set-Content -LiteralPath (Join-Path $workspace 'keep.txt') -Value 'keep'
  & $setup -WorkspacePath $workspace
  (Get-Content -Raw -LiteralPath (Join-Path $workspace 'keep.txt')).Trim() | Should -Be 'keep'
  ```

- [ ] **Step 2: Run Pester and verify RED**

  Expected: FAIL because `scripts/setup.ps1` and `Invoke-WorkbenchSetup` do not exist.

- [ ] **Step 3: Implement the minimal setup flow**

  `setup.ps1` imports the module via `$PSScriptRoot`, resolves the repository root, invokes setup, prints only the resolved workspace and success status, and exits nonzero on errors. The module executes exactly four stages in order and passes the workspace as one argument.

  ```powershell
  Invoke-WorkbenchNative node @('scripts/check-versions.mjs') $RepositoryRoot
  Invoke-WorkbenchNative pnpm @('install', '--frozen-lockfile') $RepositoryRoot
  Invoke-WorkbenchNative pnpm @('build') $RepositoryRoot
  Invoke-WorkbenchNative node @('apps/server/dist/bootstrap.js', '--workspace', $resolved) $RepositoryRoot
  ```

- [ ] **Step 4: Verify GREEN twice**

  Run focused Pester twice against the same workspace, Server bootstrap integration tests, root `typecheck`, and `git diff --check`. Confirm the source tree has no generated workspace or modified tracked file.

- [ ] **Step 5: Commit and push**

  ```bash
  git add scripts/setup.ps1 scripts/windows/Workbench.psm1 tests/scripts/setup.Tests.ps1 tests/scripts/run-pester.ps1
  git commit -m "feat: add idempotent Windows setup"
  git push origin codex/phase-0
  ```

---

### Task 4: Loopback production start, health wait, and browser handoff

**Files:**

- Create: `scripts/start.ps1`
- Create: `tests/scripts/start.Tests.ps1`
- Modify: `scripts/windows/Workbench.psm1`
- Modify: `tests/scripts/run-pester.ps1`

**Interfaces:**

- Produces: `Start-WorkbenchServer -RepositoryRoot <string> -WorkspacePath <string?> -Port <int> -HealthTimeoutSeconds <int> -NoBrowser <switch>` and `scripts/start.ps1` with the same user-facing options.
- Consumes: built `apps/server/dist/index.js`, `Test-WorkbenchHealth`, child environment `HOST/PORT/EAW_WORKSPACE_PATH`, and `/api/v1/health`.

- [ ] **Step 1: Write failing real start tests**

  After setup, allocate an available loopback port and invoke start with `-NoBrowser`. Assert the returned URL uses `127.0.0.1`, the real health payload is correct, the server sees the requested Chinese/space workspace, and a second start reuses the healthy PID recorded in the workspace run marker instead of creating another Node process. Add a failure case using an occupied/non-workbench port or an immediately exiting child; assert a bounded error and no surviving started PID.

  ```powershell
  $first = Start-WorkbenchServer @params -NoBrowser
  $second = Start-WorkbenchServer @params -NoBrowser
  $first.Url | Should -Be "http://127.0.0.1:$port"
  $second.ProcessId | Should -Be $first.ProcessId
  ```

- [ ] **Step 2: Run Pester and verify RED**

  Expected: FAIL because `Start-WorkbenchServer` and `scripts/start.ps1` do not exist.

- [ ] **Step 3: Implement minimal process and health orchestration**

  Reject ports outside `1..65535` and nonpositive timeouts. Reuse only a live PID from an atomic workspace marker whose port/version match and whose URL returns matching health; remove stale markers and reject unrelated occupied ports. Otherwise start the Node entry directly with loopback-only environment, redirect stdout/stderr to separate workspace `logs` files, and poll until health or deadline. On child exit/timeout, stop the exact started process, remove its marker, and throw. After health succeeds, atomically publish the PID/port/URL/version marker; only call `Start-Process $url` when `-NoBrowser` is absent.

  ```powershell
  $env:HOST = '127.0.0.1'
  $env:PORT = [string]$Port
  $env:EAW_WORKSPACE_PATH = $workspace
  $process = Start-Process -FilePath 'node' -ArgumentList @('apps/server/dist/index.js') -WorkingDirectory $RepositoryRoot -PassThru
  ```

  Restore the parent process environment in `finally` immediately after spawning so repeated shell use is not contaminated.

- [ ] **Step 4: Verify GREEN and cleanup**

  Run start Pester, then all script Pester tests. Assert test cleanup terminates the started server, ports are released, logs contain no secret fixture, and changing the caller current directory does not affect startup.

- [ ] **Step 5: Commit and push**

  ```bash
  git add scripts/start.ps1 scripts/windows/Workbench.psm1 tests/scripts/start.Tests.ps1 tests/scripts/run-pester.ps1
  git commit -m "feat: add healthy loopback Windows start"
  git push origin codex/phase-0
  ```

---

### Task 5: Windows CI, user documentation, and Task 27 release closeout

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-19-ecommerce-ai-workbench-implementation.md`
- Modify: `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`
- Modify: `docs/superpowers/plans/2026-09-14-windows-setup-start.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:** None beyond the completed Task 27 commands.

- [ ] **Step 1: Run the Windows CI acceptance from a fresh checkout**

  Windows CI must install exact tools/dependencies, run the normal quality/build gates, run Pester, invoke setup twice against the same path containing Chinese text and spaces, launch with `-NoBrowser`, verify health, and terminate the test server. Ubuntu retains the same root quality gates.

- [ ] **Step 2: Update README with actual v0.1 capabilities and commands**

  Replace the obsolete Phase 0 description. Document cloning, exact prerequisites, `powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1`, `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`, default workspace, custom workspace, loopback URL, data preservation, backup/restore, and safe troubleshooting for version/health errors.

- [ ] **Step 3: Run every release gate**

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

  Also run Pester locally when PowerShell is available and verify GitHub's Windows job is green. Expected: all pass with zero paid AI calls.

- [ ] **Step 4: Run the final portability audit**

  Verify no tracked case conflicts/symlinks, machine absolute paths, source-tree workspace, string-built native command, public bind, unbounded health loop, leaked child process, CRLF-sensitive parser, or unquoted Chinese/space path. Confirm setup reruns do not change the sentinel and startup logs contain no secret.

- [ ] **Step 5: Update records, commit, and push**

  Mark Task 27 complete and Task 28 in progress. Record exact Pester/root/E2E/Windows CI counts and commit:

  ```bash
  git add .github/workflows/ci.yml README.md docs/superpowers/plans/2026-08-19-ecommerce-ai-workbench-implementation.md docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md docs/superpowers/plans/2026-09-14-windows-setup-start.md task_plan.md findings.md progress.md
  git commit -m "feat: add windows setup and start workflow"
  git push origin codex/phase-0
  ```

  Verify `HEAD...origin/codex/phase-0` is `0 0` before Task 28.
