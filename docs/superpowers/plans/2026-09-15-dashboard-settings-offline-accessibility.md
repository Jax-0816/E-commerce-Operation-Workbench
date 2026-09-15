# Dashboard, Settings, Offline, and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every behavior change follows superpowers:test-driven-development, and every completion claim follows superpowers:verification-before-completion.

**Goal:** Deliver an actionable risk dashboard, redacted system settings, truthful offline capability behavior, and keyboard/narrow-screen reliability without exposing secrets or disabling local work.

**Architecture:** Add strict dashboard/system contracts and read-only application aggregators, compose them into the existing production runtime, then keep the browser thin. Connectivity remains an injectable browser concern; it gates only public-internet-dependent actions. Shell accessibility and error recovery are global but do not change domain behavior.

**Tech Stack:** Node.js 24.19.0, pnpm 11.22.0, TypeScript 6.0.3, Zod, Fastify 5.12.1, React 19, React Router 7, Vitest/jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-dashboard-settings-offline-accessibility-design.md`

## Global Constraints

- Dashboard and system reads are side-effect free and make zero provider calls.
- Counts describe current/latest records only; historical revisions do not inflate current risk.
- Malformed persisted financial snapshots fail closed instead of becoming zero or profit.
- Responses never include API keys, environment variables, absolute paths, database filenames, PIDs, logs, or raw provider errors.
- Offline mode disables only internet-dependent actions. Local CRUD, finance, history, rule management, imports, backups, and restore staging remain usable.
- Reconnection never auto-starts, resumes, retries, tests, or regenerates anything.
- Status meaning is conveyed in text, not only color or icons.
- Windows paths, line endings, casing, and browser widths remain part of every task's verification.
- After each task passes its focused gates, commit and push before starting the next task.

---

### Task 1: Strict dashboard contract and current-risk application

**Files:**

- Create: `packages/contracts/src/dashboard.ts`
- Create: `packages/contracts/src/dashboard.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/application/src/dashboard/index.ts`
- Create: `packages/application/src/dashboard/dashboard.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Produces `DashboardResponseSchema`, `DashboardAttentionItemSchema`, `DashboardApplication`, and `createDashboardApplication`.
- Consumes narrow read ports for products, SKU matrices, costs, pricing, promotions, active rules, AI configuration, titles, creative plans, and detail pages.

- [x] **Step 1: Write contract RED tests**

  Define a strict response with non-negative safe-integer counts, closed attention codes/severities, `aiConfigured`, `pinduoduoRulePackActive`, and internal absolute route paths. Reject extra fields, negative/unsafe counts, unknown codes, `https://` links, and relative links.

  Run:

  ```bash
  pnpm --filter @eaw/contracts exec vitest run src/dashboard.test.ts
  ```

  Expected: FAIL because the dashboard contract does not exist.

- [x] **Step 2: Implement the minimal strict contract and verify GREEN**

  Use a closed code order:

  ```ts
  type DashboardAttentionCode =
    | 'missing_cost_profiles'
    | 'loss_making_results'
    | 'stale_assets'
    | 'rule_review_required'
    | 'active_rule_pack_missing'
    | 'ai_not_configured';
  ```

  The response contains `summary`, `configuration`, and ordered `attention` only.

- [x] **Step 3: Write application RED tests**

  Build deterministic fake ports proving:

  - archived products are excluded;
  - only enabled SKUs contribute to SKU and missing-cost counts;
  - only the latest result per product/SKU/surface contributes to loss count;
  - exactly parsed negative `netProfit.minorUnits` counts as loss;
  - latest stale title/creative/detail views count once per kind/platform;
  - only `needs_review` rules in the active Pinduoduo/CN pack count;
  - an installed but inactive pack sets `pinduoduoRulePackActive: false`;
  - attention order and routes are stable;
  - malformed result snapshots reject the whole read;
  - no mutating/provider method is present or called.

  Run:

  ```bash
  pnpm --filter @eaw/application exec vitest run src/dashboard/dashboard.test.ts
  ```

  Expected: FAIL because `createDashboardApplication` does not exist.

- [x] **Step 4: Implement latest-only aggregation**

  Iterate the fixed platform set `pinduoduo`, `taobao`, `douyin`; reuse existing title/content staleness views; deduplicate financial risk by `productId:skuId:surface`; parse snapshots through a small strict helper. Produce attention items from summary state without mutating any source.

- [x] **Step 5: Verify and commit**

  Run focused Contracts/Application tests, their typechecks/lints, Prettier on changed files, and `git diff --check`.

  ```bash
  git commit -m "feat: add operational dashboard read model"
  git push origin codex/phase-0
  ```

---

### Task 2: Dashboard HTTP route and production composition

**Files:**

- Create: `apps/server/src/routes/dashboard.ts`
- Create: `apps/server/src/routes/dashboard.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/context.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/server/src/runtime.integration.test.ts`

**Interfaces:**

- Produces `GET /api/v1/dashboard`.
- Consumes the Task 1 dashboard application and existing production repositories/applications.

- [x] **Step 1: Write route RED tests**

  Prove `200` strict mapping, `503` when the application is absent, no request body/query acceptance, safe failure mapping, and no extra/internal fields.

- [x] **Step 2: Implement and register the minimal route**

  Add the optional dashboard dependency to `AppContext`; validate the application result with the shared contract before sending it.

- [x] **Step 3: Write production integration RED tests**

  Seed products/SKUs/costs, active/inactive rules, current and superseded financial results, and stale/current assets through public/application behavior. Restart production and assert current counts persist. Assert the raw response contains no seeded secret and no workspace absolute path.

- [x] **Step 4: Compose the production dashboard**

  Construct it only after the existing applications/repositories exist. Pass already-created instances; do not open a second database or duplicate staleness rules.

- [x] **Step 5: Verify and commit**

  Run focused Server tests, Server typecheck/lint/build, `git diff --check`, then:

  ```bash
  git commit -m "feat: expose dashboard risk snapshot"
  git push origin codex/phase-0
  ```

---

### Task 3: Actionable dashboard browser experience

**Files:**

- Create: `apps/web/src/features/dashboard/api.ts`
- Create: `apps/web/src/features/dashboard/dashboard.tsx`
- Create: `apps/web/src/features/dashboard/dashboard.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/routing/workbench-router.tsx`
- Modify: `apps/web/src/routing/workbench-router.test.tsx`
- Modify: `apps/web/src/styles.css`
- Delete: `apps/web/src/features/products/dashboard.tsx`

**Interfaces:**

- Produces `DashboardApi`, `createBrowserDashboardApi`, and the new `OperationalDashboard`.
- Consumes the strict dashboard response and internal routes only.

- [ ] **Step 1: Write API and UI RED tests**

  Test strict response parsing and safe errors. Render nonzero/zero/loading/failure snapshots and prove:

  - six summary/configuration values have textual names;
  - attention items link to their owning internal workspaces;
  - counts never derive from product-list guesses;
  - failure shows an alert and no false zeroes;
  - empty workspace presents a clear first-product action;
  - active/inactive rule and configured/unconfigured AI states are truthful.

- [ ] **Step 2: Implement the browser adapter and dashboard**

  Replace Phase 0/3 placeholder language. Keep product list/open actions only if sourced explicitly; otherwise let the dashboard endpoint own all readiness facts. Use semantic lists/sections and text labels for severity.

- [ ] **Step 3: Wire routing and responsive styles**

  Add `dashboardApi` to `WorkbenchDependencies` and `App`. Preserve current navigation. At 720/390 px, cards stack and the attention list remains reachable; any table scrolls rather than clipping.

- [ ] **Step 4: Verify and commit**

  Run focused Web tests, Web typecheck/lint/build, changed-file Prettier, `git diff --check`, then:

  ```bash
  git commit -m "feat: make the dashboard actionable"
  git push origin codex/phase-0
  ```

---

### Task 4: Redacted system status and settings page

**Files:**

- Create: `packages/contracts/src/system-status.ts`
- Create: `packages/contracts/src/system-status.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/application/src/system-status/index.ts`
- Create: `packages/application/src/system-status/system-status.test.ts`
- Modify: `packages/application/src/index.ts`
- Create: `apps/server/src/routes/system-status.ts`
- Create: `apps/server/src/routes/system-status.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/context.ts`
- Modify: `apps/server/src/runtime.ts`
- Create: `apps/web/src/features/system-settings/api.ts`
- Create: `apps/web/src/features/system-settings/system-settings-panel.tsx`
- Create: `apps/web/src/features/system-settings/system-settings-panel.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/routing/workbench-router.tsx`
- Modify: `apps/web/src/routing/workbench-router.test.tsx`

**Interfaces:**

- Produces `GET /api/v1/system/status`, `SystemStatusApi`, and the implemented `/capabilities/settings` page.
- Consumes `APP_VERSION`, fixed loopback metadata, AI configured status, known prompt-template IDs, and rule-pack list state.

- [ ] **Step 1: Write strict redaction RED tests**

  Contract/application tests reject extra/path/secret-shaped fields and prove only version, loopback/local-only, AI boolean/model, prompt installed/active counts, and rule installed/active/review counts are returned. Missing prompts/rules remain explicit counts/null state.

- [ ] **Step 2: Implement application and route**

  Count the seven known default prompt template IDs through existing prompt repository reads. Do not add mutation methods or return template bodies/hashes. Validate the route response strictly.

- [ ] **Step 3: Write settings UI RED tests**

  Assert safe values, no key/path rendering, links to AI/rules/data pages, loading/error states, and textual local-only/loopback explanation.

- [ ] **Step 4: Implement and route the settings page**

  Replace the wildcard placeholder for `/capabilities/settings`. This page summarizes; existing specialist pages remain the only mutation surfaces.

- [ ] **Step 5: Verify and commit**

  Run focused Contracts/Application/Server/Web tests and typechecks/lints/builds, then:

  ```bash
  git commit -m "feat: add redacted system settings"
  git push origin codex/phase-0
  ```

---

### Task 5: Explicit online/offline policy and action guards

**Files:**

- Create: `apps/web/src/features/connectivity/policy.ts`
- Create: `apps/web/src/features/connectivity/policy.test.ts`
- Create: `apps/web/src/features/connectivity/connectivity-provider.tsx`
- Create: `apps/web/src/features/connectivity/connectivity-provider.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/routing/workbench-router.tsx`
- Modify: `apps/web/src/features/ai-settings/ai-settings-panel.tsx`
- Modify: `apps/web/src/features/ai-settings/ai-settings-panel.test.tsx`
- Modify: `apps/web/src/features/strategy/strategy-panel.tsx`
- Modify: `apps/web/src/features/strategy/strategy-panel.test.tsx`
- Modify: `apps/web/src/features/titles/title-studio.tsx`
- Modify: `apps/web/src/features/titles/title-studio.test.tsx`
- Modify: `apps/web/src/features/content-builders/creative-builder.tsx`
- Modify: `apps/web/src/features/content-builders/detail-builder.tsx`
- Modify: `apps/web/src/features/content-builders/content-builders.test.tsx`
- Modify: `apps/web/src/features/workflows/workflow-progress.tsx`
- Modify: `apps/web/src/features/workflows/workflow-progress.test.tsx`

**Interfaces:**

- Produces injectable `ConnectivitySource`, `ConnectivityProvider`, `useConnectivity`, and pure `capabilityAvailability`.
- Consumes `navigator.onLine` plus browser `online`/`offline` events only.

- [ ] **Step 1: Write policy/provider RED tests**

  Enumerate every classified capability. Prove initial state, event updates, listener cleanup, and that reconnect only changes state. No timers or probes.

- [ ] **Step 2: Implement the minimal provider and global banner**

  Render a persistent visible/announced offline explanation. Do not equate offline with local API failure.

- [ ] **Step 3: Write action-guard RED tests**

  For each internet-dependent panel, render offline, click or inspect the action, and assert its API method call count remains zero with a visible/accessibly described reason. Prove AI key save/clear, local pricing/history, local competitor import, rule management, backup, and restore remain enabled. Prove reconnection does not call any method automatically.

- [ ] **Step 4: Add guards without wrapping read APIs**

  Disable connection test/generate/regenerate/workflow start-resume-retry controls at their owning components. Existing persisted reads still execute. Avoid a global fetch interceptor because it would incorrectly block loopback HTTP.

- [ ] **Step 5: Verify and commit**

  Run all affected Web tests, Web typecheck/lint/build, and `git diff --check`, then:

  ```bash
  git commit -m "feat: add truthful offline capability policy"
  git push origin codex/phase-0
  ```

---

### Task 6: Global error recovery, route focus, and narrow-screen acceptance

**Files:**

- Create: `apps/web/src/routing/workbench-error-boundary.tsx`
- Create: `apps/web/src/routing/workbench-error-boundary.test.tsx`
- Create: `apps/web/src/routing/route-focus.tsx`
- Create: `apps/web/src/routing/route-focus.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/routing/workbench-router.tsx`
- Modify: `apps/web/src/routing/workbench-router.test.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/phase-2-golden-path.spec.ts`

**Interfaces:**

- Produces a safe top-level fallback, skip link, main focus target, and stable responsive shell.

- [ ] **Step 1: Write error/focus RED tests**

  Prove render exceptions show a Chinese safe fallback without raw message/stack, reload is explicit, skip link is first focusable control, pathname navigation focuses the main target, query-only changes do not steal focus, and active/disabled states have semantic text/attributes.

- [ ] **Step 2: Implement the minimal shell reliability components**

  Use a class error boundary and a pathname-keyed focus effect. The fallback must not attempt automatic reload. Keep native controls and visible focus outlines.

- [ ] **Step 3: Add deterministic responsive acceptance**

  Extend Playwright smoke coverage or a dedicated Task 28 spec to check 1440, 720, and 390 widths: no document-level horizontal overflow, navigation/main content and critical actions remain reachable, wide data tables scroll inside their own region, and no critical control is CSS-hidden.

- [ ] **Step 4: Verify keyboard and semantic behavior**

  Tab through skip link, global navigation, product navigation, main actions, offline banner context, and settings links. Inspect headings, landmarks, captions, scopes, `aria-live`, `aria-disabled`, and focus visibility.

- [ ] **Step 5: Verify and commit**

  Run focused Web tests plus relevant Playwright, Web typecheck/lint/build, and `git diff --check`, then:

  ```bash
  git commit -m "feat: improve workbench accessibility and recovery"
  git push origin codex/phase-0
  ```

---

### Task 7: Task 28 release gates and records

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-19-ecommerce-ai-workbench-implementation.md`
- Modify: `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`
- Modify: `docs/superpowers/plans/2026-09-15-dashboard-settings-offline-accessibility.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: Run every release gate with exact tools**

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

  Run PowerShell acceptance and confirm GitHub Windows/Ubuntu CI. Expected: zero failures and zero real paid provider calls.

- [ ] **Step 2: Run final Task 28 product audit**

  Verify every dashboard number against seeded source records, every attention link, settings redaction, all offline allowed/blocked actions, no reconnect side effects, keyboard-only flow, error fallback, and 1440/720/390 layouts. Re-run case/symlink/path/line-ending audit for new files.

- [ ] **Step 3: Update documentation and persistent records**

  Document dashboard, settings, offline boundaries, and keyboard behavior in README. Mark Task 28 complete and Task 29 in progress. Record exact test/E2E/CI counts and remaining known limitations.

- [ ] **Step 4: Commit, push, and confirm CI**

  ```bash
  git commit -m "feat: complete operational dashboard and offline ux"
  git push origin codex/phase-0
  ```

  Verify `HEAD...origin/codex/phase-0` is `0 0` and the final Windows/Ubuntu CI run is green before Task 29.
