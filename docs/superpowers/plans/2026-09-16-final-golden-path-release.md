# Final Golden Path and Release Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every behavior change follows superpowers:test-driven-development, every defect follows superpowers:systematic-debugging, and every completion claim follows superpowers:verification-before-completion.

**Goal:** Prove one deterministic, user-visible path from a blank workspace to a locked, source-traceable operation plan, then make that path and the existing recovery/offline checks mandatory on clean Windows and Ubuntu runners.

**Architecture:** Keep Playwright as an external consumer of the real Web and Server processes. The test may use read-only HTTP calls for exact persistence/audit assertions, but all business setup and user decisions in the canonical path happen through visible UI controls. AI stays behind the existing deterministic fake provider and writes an auditable call log; no paid provider or public network endpoint is allowed. CI reuses the same specification on both supported operating systems and retains traces only on failure.

**Tech Stack:** Node.js 24.19.0, pnpm 11.22.0, TypeScript 6.0.3, React 19, Fastify 5.12.1, SQLite, PowerShell 7/Pester 6.2.0, Playwright 1.62.1, GitHub Actions.

**Primary scope:** `tests/e2e/golden-path.spec.ts`, deterministic E2E fixtures/provider, `playwright.config.ts`, `.github/workflows/ci.yml`, README and persistent project records.

## Global Constraints

- Begin from the normal bootstrapped blank workspace; do not seed domain rows directly in SQLite.
- Complete through visible UI: product, confirmed fact, SKU, cost, competitor import, AI configuration, active rule pack, workflow/AI assets, pricing, Pinduoduo promotion, source selection, draft creation and explicit lock.
- HTTP may only verify exact immutable records, hashes, provider counts, restarts and absence of secret/path leakage; it must not replace a user-visible setup step in the canonical path.
- The fake provider must be deterministic, local, schema-valid and visibly identified as test-only. A real DeepSeek host or paid call is a release failure.
- Preserve the intentional one-time creative failure so the canonical path proves explicit recovery without re-running completed workflow nodes.
- Assert latest pricing and promotion trace, active rule checksum, exact workflow/content source IDs, locked plan source hash and unchanged values after reload/restart.
- Run with one worker and isolated temporary workspaces. At least the canonical workspace path contains Chinese characters and spaces on both Windows and Ubuntu.
- Keep `trace: retain-on-failure`; CI uploads Playwright traces/reports only on failure and never uploads workspace secrets.
- Existing Phase 2/3/10/11/12 scenarios remain as focused recovery regressions; the new canonical path does not delete or weaken them.
- After each green small task, commit, push, confirm `HEAD...origin/codex/phase-0` is `0 0`, then continue.

---

### Task 1: Canonical golden-path RED and deterministic fixture contract

**Files:**

- Create: `tests/e2e/golden-path.spec.ts`
- Create: `tests/e2e/fixtures/competitors/golden-path.csv`
- Modify only if fixture observability is missing: `apps/server/scripts/e2e-server.ts`

**Interfaces:**

- Produces one Playwright test named `completes the canonical workbench path and locks exact sources`.
- Consumes the real browser routes, existing deterministic provider, provider call log and strict public/read-only APIs.

- [x] **Step 1: Write the complete user-visible path before changing product code**

  Drive the following sequence through labels/roles instead of CSS implementation details:

  1. create a product from the blank dashboard;
  2. add and confirm one policy-eligible fact with evidence;
  3. generate one enabled SKU and save a confirmed per-unit cost;
  4. import the UTF-8 competitor CSV through preview and explicit confirmation;
  5. save the deterministic E2E key and activate the bundled Pinduoduo/CN rule pack;
  6. start the product-content workflow, observe the intentional creative failure, reload, explicitly resume and finish;
  7. lock the current title, every creative item and every detail section, rerunning only the workflow steps required to produce a final completed source revision;
  8. calculate a verified price and a Pinduoduo promotion with visible trace/history;
  9. select the exact workflow, pricing and promotion sources, create a draft with zero blockers and explicitly lock it;
  10. reload and restart the E2E server, then prove the locked revision and exact source hash remain unchanged.

- [x] **Step 2: Add exact audit assertions**

  Assert call order/count, completed-node reuse, confirmed fact ID in content evidence, current rule checksum, pricing/promotion record IDs, non-empty calculation traces, locked source IDs/hash, immutable history, no page errors and no unexpected HTTP failures. Reject any request whose host is outside loopback, except Vite's own local assets.

- [x] **Step 3: Run RED and record the first real behavior gap**

  ```bash
  pnpm exec playwright test tests/e2e/golden-path.spec.ts
  ```

  Record the first product-owned failure in `findings.md` and `progress.md`. Do not pre-emptively repair later steps or loosen the assertion.

---

### Task 2: Close observed product gaps one owner at a time

**Files:**

- Modify: only the module that owns the current first failing behavior
- Modify/Create: the owner's focused Vitest/integration test
- Modify: `tests/e2e/golden-path.spec.ts` only when the test itself made a false assumption
- Modify: `findings.md`
- Modify: `progress.md`

- [x] **Step 1: Diagnose before editing**

  Reproduce the first failure with Playwright trace, server output and the narrow public API. State whether the cause is product behavior, fixture behavior, timing, or an incorrect test assumption.

- [x] **Step 2: Write the owner-level RED regression**

  Add the smallest deterministic test at Contracts/Application/Server/Web level. Confirm that it fails for the same cause as the browser path.

- [x] **Step 3: Implement the minimal owner fix and verify GREEN**

  Run the owner test, owner workspace suite/typecheck/lint/build, then rerun only the canonical Playwright test. Repeat Steps 1–3 for the next real gap until the single path is green; never bundle speculative repairs.

- [x] **Step 4: Commit and push the green canonical path**

  ```bash
  git commit -m "test: add complete ecommerce workbench golden path"
  git push origin codex/phase-0
  ```

---

### Task 3: Cross-platform Playwright isolation and failure artifacts

**Files:**

- Modify: `playwright.config.ts`
- Modify: `apps/server/scripts/e2e-server.ts`
- Modify: `tests/e2e/*.spec.ts` only for proven cross-test isolation defects
- Modify: `.gitignore` if a generated Playwright directory is not already ignored

- [ ] **Step 1: Make workspace and call-log isolation explicit**

  Use run-unique temporary directories and log files. The canonical source workspace prefix must contain Chinese characters and spaces. Remove stale log ambiguity without deleting user paths; all cleanup remains limited to generated temporary paths.

- [ ] **Step 2: Prove fake-provider and offline boundaries**

  Keep the fake provider local and deterministic. Assert no request reaches a DeepSeek/public host, no raw test key appears in UI/server logs/backup bytes, and toggling browser offline blocks only public AI actions without issuing a mutation on reconnect.

- [ ] **Step 3: Run all Playwright scenarios together**

  ```bash
  pnpm test:e2e
  ```

  Expected: canonical + Phase 2/3/10/11/12 all pass serially, zero paid calls, no state collision, traces retained only on failure.

- [ ] **Step 4: Commit and push**

  ```bash
  git commit -m "test: harden cross-platform golden path fixtures"
  git push origin codex/phase-0
  ```

---

### Task 4: Mandatory Windows and Ubuntu browser release gates

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `playwright.config.ts` only if the runner proves a browser-selection issue
- Modify: `README.md`

- [ ] **Step 1: Add the browser gate to both matrix jobs**

  Install the Playwright-managed Chromium matching the lockfile, run `pnpm test:e2e` after build/resource validation on Windows and Ubuntu, keep Windows Pester, and upload the Playwright report/trace only when the browser step fails. Use OS-qualified artifact names.

- [ ] **Step 2: Validate YAML and local command parity**

  Confirm both jobs use Node 24.19.0, pnpm 11.22.0 and frozen install. The CI browser command must be exactly reproducible locally and must not use a saved user profile or machine-global workspace.

- [ ] **Step 3: Push and inspect the first real matrix run**

  ```bash
  git commit -m "ci: require golden path on windows and ubuntu"
  git push origin codex/phase-0
  ```

  If one OS fails, read its retained trace/log, add a focused regression, fix the owner and push again. Do not mark this task complete until both jobs are green from a clean checkout.

---

### Task 5: Upgrade, restore and release-candidate audit

**Files:**

- Modify/Create only if a gap exists: focused Database/Workspace migration or restore tests
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-19-ecommerce-ai-workbench-implementation.md`
- Modify: `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`
- Modify: `docs/superpowers/plans/2026-09-16-final-golden-path-release.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: Run the complete release gate**

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

  Run the complete Pester suite separately with local loopback permission. Record exact file/test counts, browser scenarios, provider calls and durations.

- [ ] **Step 2: Audit clean install, upgrade, restore and portability**

  Use tests/CI evidence to prove: clean bootstrapped workspace, all migrations over an existing supported workspace, failed restore leaves the old workspace usable, successful backup restore preserves the canonical product without secrets, offline local work remains available, Windows Chinese/space paths work, and no tracked file contains a machine path, case collision, invalid Windows name, CRLF drift or symlink.

- [ ] **Step 3: Mark `0.1.0` as release candidate**

  Document the canonical acceptance flow, exact supported versions, deterministic fake-AI boundary, Windows clone/setup/start steps, remaining non-goals and the final green GitHub run. Mark Task 29 and the master plan complete only after evidence exists.

- [ ] **Step 4: Commit, push and confirm final CI**

  ```bash
  git commit -m "test: verify complete ecommerce workbench golden path"
  git push origin codex/phase-0
  ```

  Confirm `HEAD...origin/codex/phase-0` is `0 0`, both final matrix jobs are green, no real paid AI call occurred, and the worktree contains no uncommitted project changes before declaring the project release candidate complete.
