# Project Governance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-wide AI collaboration contract, a concise current-work index, and narrow ignore rules for verified local generated artifacts without changing product behavior.

**Architecture:** Governance remains a documentation layer at the repository root. `AGENTS.md` defines how work is performed, `TODO.md` points to current status and historical evidence without replacing it, and `.gitignore` keeps local package and graph outputs out of source control.

**Tech Stack:** Markdown, Git ignore rules, Prettier, Git, existing Node.js 24.19.0 and pnpm 11.22.0 quality gates.

**Spec:** `docs/superpowers/specs/2026-09-21-project-governance-optimization-design.md`

## Global Constraints

- Do not change application code, dependencies, migrations, API contracts, schemas, runtime configuration, or product behavior.
- Do not modify `pnpm-lock.yaml`, `.env`, `.env.local`, `.env.*.local`, or any file containing real credentials.
- Preserve `README.md`, `task_plan.md`, `progress.md`, and `findings.md`; link to them instead of copying or deleting their histories.
- Add only `.pnpm-store/` and `graphify-out/` to `.gitignore`.
- Keep the project Windows-first and preserve the exact Node.js `24.19.0` / pnpm `11.22.0` toolchain requirements.
- Never claim a quality gate passed without fresh command output.
- Push to GitHub only if the user separately requests it.

## Review Focus

- A task begins when one of `README.md`, `AGENTS.md`, or `TODO.md` is missing: read the files that exist, report the missing file, and do not create optional documents implicitly.
- A user explicitly authorizes a file change in the current message: that authorization satisfies the execution-mode confirmation gate, while the remaining planning and safety gates still apply.
- CodeGraph is unavailable or `.codegraph/` is absent: skip CodeGraph and use normal repository tools without indexing the repository automatically.
- A generated directory is ignored: verify only `.pnpm-store/` and `graphify-out/` disappear from `git status`; source, fixtures, and reports outside those directories must remain visible.
- A full quality gate cannot run because the exact toolchain or environment is unavailable: record the exact skipped or failed command and do not substitute inference for a failed check.

---

## File Structure

- Create `AGENTS.md`: repository-wide AI behavior contract and task lifecycle.
- Create `TODO.md`: concise current status, next decisions, verification entry point, and links to historical planning evidence.
- Modify `.gitignore`: ignore only the two verified local generated directories.
- Do not modify any product, test, dependency, migration, or historical planning file.

### Task 1: Create the repository collaboration contract

**Files:**

- Create: `AGENTS.md`
- Reference: `README.md`
- Reference: `docs/superpowers/specs/2026-09-21-project-governance-optimization-design.md`

**Interfaces:**

- Consumes: repository facts and quality commands documented in `README.md`.
- Produces: the mandatory operating contract read before future repository work.

- [ ] **Step 1: Verify the contract is currently absent**

Run:

```bash
test ! -e AGENTS.md
```

Expected: exit code `0`. If the file now exists, stop and inspect it instead of overwriting it.

- [ ] **Step 2: Create `AGENTS.md` with the approved rule structure**

Create a Markdown file with the title `# AGENTS.md — AI 项目协作最高规则` and these sections in this exact order:

1. `0. 文件定位与优先级`
2. `1. 核心原则（不可覆盖）`
3. `2. 执行模式（强制显式路由）`
4. `3. 执行生命周期（仅执行模式强制）`
5. `4. 变更控制铁律`
6. `5. 验证系统（分级强制）`
7. `6. 工具使用与失败处理`
8. `7. 安全硬约束`
9. `8. 文档维护规则`
10. `9. 多 Agent 角色与协作（可选扩展）`
11. `10. 完成定义（DoD）`
12. `11. 最终约束`

The content must preserve the approved user contract and include these repository-specific statements verbatim:

```markdown
AI 启动任何任务前，必须按顺序读取：

1. `README.md` — 项目概览、启动方式
2. `AGENTS.md` — AI 行为规则
3. `TODO.md` — 当前进度与待办事项
```

```markdown
当用户当前指令已明确授权修改项目文件时，该指令即为进入执行模式的确认；仍必须完成影响分析、修改前计划、验证和交付说明。
```

```markdown
如果仓库根目录存在 `.codegraph/`，在需要理解或定位代码时优先使用 CodeGraph。如果不存在，直接使用常规工具，不得自行创建索引。
```

Protected paths must include `node_modules/`, `dist/`, `build/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `.env`, `.env.local`, `.env.*.local`, authentication/payment/privacy configuration, and all files containing real secrets. The delivery template must require `已完成`, `修改文件`, `验证方式`, `风险提示`, and `建议下一步`.

- [ ] **Step 3: Validate required sections and edge-case rules**

Run:

```bash
test "$(rg -c '^## [0-9]+\.' AGENTS.md)" -eq 12
rg -n 'README\.md|TODO\.md|\.codegraph/|pnpm-lock\.yaml|\.env\.\*\.local|已完成|验证方式' AGENTS.md
pnpm exec prettier --check AGENTS.md
git diff --check -- AGENTS.md
```

Expected: 12 numbered top-level sections; every required rule has at least one match; Prettier and diff checks exit `0`.

- [ ] **Step 4: Commit the collaboration contract**

```bash
git add AGENTS.md
git commit -m "docs: add repository agent contract"
```

### Task 2: Create the current-work index

**Files:**

- Create: `TODO.md`
- Reference: `README.md`
- Reference: `task_plan.md`
- Reference: `progress.md`
- Reference: `findings.md`

**Interfaces:**

- Consumes: the verified `0.1.0` release-candidate state and historical planning evidence.
- Produces: the default current task entry point required by `AGENTS.md`.

- [ ] **Step 1: Verify the task index is currently absent**

Run:

```bash
test ! -e TODO.md
```

Expected: exit code `0`. If the file now exists, stop and merge carefully instead of overwriting it.

- [ ] **Step 2: Create `TODO.md` as an index, not a copied history log**

Use this exact structure and status model:

```markdown
# TODO

## 当前状态

- 版本：`0.1.0` 发布候选
- 产品基线：商品建档、事实与 SKU、成本定价、促销、竞品、AI 内容、工作流、运营方案、备份恢复已完成。
- 发布证据：GitHub Actions `35179433382` 在 Windows 与 Ubuntu 通过完整质量门禁和 6 条 Playwright 场景。

## 当前待办

- [ ] 完成项目治理优化：落地 `AGENTS.md`、`TODO.md` 和本地生成物忽略规则。
- [ ] 确定 `0.1.0` 正式发布节奏与版本标签。
- [ ] 在启动下一个产品功能前，明确 v0.2 范围与非目标。

## 验证入口

Follow the exact commands from `README.md` under `开发与质量门禁`; do not duplicate a second command list here.

## 历史与依据

- [`README.md`](README.md) — 产品概览与当前发布基线
- [`task_plan.md`](task_plan.md) — 历史任务计划
- [`progress.md`](progress.md) — 实施进度记录
- [`findings.md`](findings.md) — 技术发现与问题处理
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — 已批准设计
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — 实施计划
```

Translate the single English verification sentence into concise Chinese during implementation while keeping the meaning unchanged.

- [ ] **Step 3: Validate every status claim and link target**

Run:

```bash
rg -n '0\.1\.0|35179433382|AGENTS\.md|v0\.2|task_plan\.md|progress\.md|findings\.md' TODO.md
for path in README.md task_plan.md progress.md findings.md docs/superpowers/specs docs/superpowers/plans; do test -e "$path" || exit 1; done
pnpm exec prettier --check TODO.md
git diff --check -- TODO.md
```

Expected: all current-state facts and evidence links are present; every referenced path exists; formatting and diff checks exit `0`.

- [ ] **Step 4: Commit the current-work index**

```bash
git add TODO.md
git commit -m "docs: add current project todo index"
```

### Task 3: Ignore verified local generated artifacts

**Files:**

- Modify: `.gitignore`

**Interfaces:**

- Consumes: the observed untracked `.pnpm-store/` and `graphify-out/` directories.
- Produces: clean Git status without hiding any product source paths.

- [ ] **Step 1: Prove the generated directories are currently visible**

Run:

```bash
git status --short --untracked-files=normal
```

Expected before the change: output contains `?? .pnpm-store/` and `?? graphify-out/`.

- [ ] **Step 2: Add exactly two root ignore rules**

Append these lines to `.gitignore`:

```gitignore
.pnpm-store/
graphify-out/
```

Do not add broad patterns such as `*.json`, `reports/`, or `docs/`.

- [ ] **Step 3: Validate ignore behavior and source visibility**

Run:

```bash
test "$(rg -n '^\.pnpm-store/$|^graphify-out/$' .gitignore | wc -l | tr -d ' ')" -eq 2
git check-ignore -v .pnpm-store/v11/index.db graphify-out/graph.json
test -z "$(git status --short --untracked-files=normal | rg '^\?\? (\.pnpm-store|graphify-out)/')"
git status --short
git diff --check -- .gitignore
```

Expected: exactly two matching rules; both representative generated files are ignored by the intended lines; neither directory appears as untracked; `AGENTS.md`, `TODO.md`, the design, the plan, and `.gitignore` remain visible/tracked as appropriate.

- [ ] **Step 4: Commit the ignore rules**

```bash
git add .gitignore
git commit -m "chore: ignore local generated artifacts"
```

### Task 4: Run the governance and repository verification gates

**Files:**

- Verify: `AGENTS.md`
- Verify: `TODO.md`
- Verify: `.gitignore`
- Verify: `docs/superpowers/specs/2026-09-21-project-governance-optimization-design.md`
- Verify: `docs/superpowers/plans/2026-09-21-project-governance-optimization.md`

**Interfaces:**

- Consumes: all governance artifacts from Tasks 1–3.
- Produces: fresh evidence for the delivery report; no new product interface.

- [ ] **Step 1: Run document and Git integrity checks**

Run:

```bash
pnpm exec prettier --check AGENTS.md TODO.md docs/superpowers/specs/2026-09-21-project-governance-optimization-design.md docs/superpowers/plans/2026-09-21-project-governance-optimization.md
git diff --check HEAD~3..HEAD
git status --short --branch
```

Expected: Prettier and diff checks exit `0`; no untracked generated directories; only intentionally unpushed local commits may be reported.

- [ ] **Step 2: Verify the exact toolchain**

Run:

```bash
node scripts/check-versions.mjs
```

Expected: exit `0` with Node.js `24.19.0` and pnpm `11.22.0`. If it fails, record the exact installed versions and do not run misleading substitutes.

- [ ] **Step 3: Run repository static and runtime gates**

Run each command separately and retain its exit status:

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:prompts
pnpm validate:rule-packs
```

Expected: every command exits `0`. If a command fails, investigate whether the change caused it; do not modify unrelated product code to hide a pre-existing failure.

- [ ] **Step 4: Decide whether browser tests are proportionate**

For this documentation-only change, do not install browsers or run Playwright unless Chromium is already installed and the environment can safely start the local server. In the delivery report, state either:

```text
Playwright not run: governance/documentation-only change; no product behavior changed.
```

or provide the fresh `pnpm test:e2e` result if it was run.

- [ ] **Step 5: Confirm the final change boundary**

Run:

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git status --short --branch
```

Expected: commits and diff contain only the approved design, implementation plan, `AGENTS.md`, `TODO.md`, and `.gitignore`; no lockfile, secret, product source, migration, or historical planning file changed.

- [ ] **Step 6: Deliver the required report**

Use the repository contract template:

```markdown
已完成：

1. ...

修改文件：

- `path`: reason

验证方式：

- 命令：result
- 验收点：result

风险提示：

- ...

建议下一步：

- ...
```

Do not push to GitHub unless the user separately requests it.
