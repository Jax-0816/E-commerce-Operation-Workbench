# Phase 2 Usability Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the completed Phase 2 product APIs into a truthful, routed, desktop-first workbench where a user can create a product, manage facts, configure SKUs, and edit platform profiles without encountering dead controls.

**Architecture:** React Router owns global and product-level URL state. The existing feature APIs remain the browser boundary; route pages compose the existing product, fact, SKU, and platform-profile components. Unimplemented later-phase modules render explicit capability notices instead of inert controls.

**Tech Stack:** React 19.2.8, React Router DOM 7.18.2, Vite 8.2.1, Vitest 4.1.11, Playwright 1.62.1, Fastify `/api/v1` contracts.

**Spec:** `docs/superpowers/specs/2026-08-19-ecommerce-ai-workbench-design.md`

## Global Constraints

- Keep the local-first modular monolith and browser → API → application boundary.
- URL owns product, platform, and section navigation state.
- Platform switching must make zero AI/provider/generation calls.
- Unimplemented capabilities must say so explicitly and must not fabricate results.
- Every behavior change follows RED → GREEN → refactor and the exact Node 24.19.0/pnpm 11.22.0 gate.

---

### Task 1: Routed workbench shell and truthful capability navigation

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/main.tsx`
- Replace: `apps/web/src/app.tsx`
- Create: `apps/web/src/routing/workbench-router.tsx`
- Create: `apps/web/src/routing/workbench-router.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**

- Consumes: existing `ProductsApi`, `FactsApi`, `SkusApi`, and `PlatformProfilesApi`.
- Produces: `WorkbenchRouter` with `/`, `/products`, `/products/new`, `/products/:productId/:section`, and explicit unavailable routes.

- [ ] Write a failing router test that starts at `/products/:id/facts`, asserts real product context and product navigation, navigates to `/products/:id/skus`, and asserts later-phase links show an explicit unavailable notice.
- [ ] Run `pnpm exec vitest run apps/web/src/routing/workbench-router.test.tsx`; expect missing module/route behavior.
- [ ] Add exact React Router dependency and implement `BrowserRouter`/`MemoryRouter`-compatible route composition.
- [ ] Make the context bar derive current product and platform from route/search state; disable “生成完整运营方案” with a Phase 10 explanation until implemented.
- [ ] Run focused tests and commit-ready formatting.

### Task 2: Product dashboard and onboarding

**Files:**

- Modify: `apps/web/src/features/products/api.ts`
- Modify: `apps/web/src/features/products/product-library.tsx`
- Create: `apps/web/src/features/products/product-onboarding.tsx`
- Create: `apps/web/src/features/products/product-onboarding.test.tsx`
- Create: `apps/web/src/features/products/dashboard.tsx`
- Test: `apps/web/src/features/products/product-library.test.tsx`

**Interfaces:**

- Consumes: `ProductsApi.list/create/archive`.
- Produces: recent-product dashboard, `/products/new` four-step manual onboarding, and route navigation to the created product.

- [ ] Write failing tests for dashboard product count/recent products and the four-step wizard creating a product then calling `onCreated`.
- [ ] Verify RED with focused Vitest.
- [ ] Implement the minimum manual path; show paste/import/copy choices as clearly unavailable until the competitor/import phases instead of fake controls.
- [ ] Change product management copy from “管理事实” to “进入商品工作区”.
- [ ] Verify focused GREEN.

### Task 3: Complete Facts create/edit/confirm interaction

**Files:**

- Modify: `apps/web/src/features/facts/fact-status-table.tsx`
- Modify: `apps/web/src/features/facts/fact-status-table.test.tsx`
- Modify: `apps/web/src/features/facts/api.ts`

**Interfaces:**

- Consumes: `BrowserFactsApi.create/update/confirm` and existing fact DTO fields.
- Produces: accessible add/edit forms for text/number/boolean/missing facts with source, verification, sensitivity, optimistic update token, and confirmation evidence.

- [ ] Extend the component contract to consume create/update, then write failing tests that add an unverified text fact and edit an unconfirmed fact using `expectedUpdatedAt`.
- [ ] Verify RED because add/edit controls are absent.
- [ ] Implement a single reusable fact editor, strict client-side field conversion, loading/error states, and local list reconciliation.
- [ ] Keep confirmed facts immutable in this screen and preserve the existing explicit confirmation flow.
- [ ] Verify all fact tests GREEN.

### Task 4: Routed SKU/platform pages and explicit future modules

**Files:**

- Modify: `apps/web/src/routing/workbench-router.tsx`
- Modify: `apps/web/src/features/skus/sku-matrix.tsx`
- Modify: `apps/web/src/features/platform-profile/platform-profile-panel.tsx`
- Test: `apps/web/src/routing/workbench-router.test.tsx`

**Interfaces:**

- Consumes: existing SKU matrix and platform-profile components.
- Produces: dedicated `/skus` and `/platforms?platform=...` pages plus named notices for competitors, analysis, selling points, title, creative, detail, cost, pricing, promotion, plans, and history.

- [ ] Add failing route tests proving only the selected feature mounts and platform query state survives navigation.
- [ ] Implement route pages and section headings; do not trigger hidden feature API calls.
- [ ] Verify route and existing SKU/platform regressions GREEN.

### Task 5: Browser golden path and final verification

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/phase-2-golden-path.spec.ts`
- Modify: `apps/web/src/styles.css`
- Create: `.superpowers/sdd/2026-08-19-ecommerce-ai-workbench-implementation/task-10-usability-report.md`

**Interfaces:**

- Consumes: running Vite/Fastify development pair and a temporary `EAW_WORKSPACE_PATH`.
- Produces: browser proof for create product → enter workspace → add/confirm fact → configure SKU → save independent platform profile.

- [ ] Add Playwright 1.62.1 and a test that uses accessible roles/labels and asserts route URLs and no console/page errors.
- [ ] Run the browser test against a temporary workspace; confirm RED before the routed UI is complete, then GREEN after implementation.
- [ ] Polish the desktop layout without hiding incomplete capabilities.
- [ ] Run frozen install, typecheck, lint, all Vitest tests, Playwright golden path, build, format, and diff check under the exact runtime.
- [ ] Record RED/GREEN evidence, commit `feat: make phase 2 product workspace usable`, verify a clean worktree, and reopen the site.
