# Ecommerce AI Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Windows-first, local-only v0.1 that completes the product-to-operation-plan golden path with fact-guarded AI and deterministic, traceable Pinduoduo finance.

**Architecture:** A pnpm modular monolith exposes a React client through one loopback Fastify server. Application use cases coordinate product-centred domain objects; exact calculation, rule, prompt, AI, workflow, persistence, and workspace concerns remain isolated behind explicit ports assembled by `createAppContext()`.

**Tech Stack:** Node.js 24.19.0 LTS, pnpm 11.22.0, TypeScript 6.0.3, React 19.2.8, Vite 8.2.1, Fastify 5.12.1, SQLite, Drizzle ORM 0.45.2, Zod 4.4.3, Vitest 4.1.11, Playwright 1.62.1, SSE.

**Spec:** `docs/superpowers/specs/2026-08-19-ecommerce-ai-workbench-design.md`

## Global Constraints

- Runtime is Node.js `>=24.19.0 <25`; package manager is exactly `pnpm@11.22.0`.
- All dependencies are exact versions in manifests and `pnpm-lock.yaml`; no beta, RC, or nightly dependency.
- Production binds only to `127.0.0.1`; Docker, Redis, BullMQ, GraphQL, Next.js, NestJS, and PostgreSQL are excluded.
- Money is integer minor units and rates are integer basis points/exact rationals; `eval`, `Function`, and uncontrolled floating-point financial decisions are forbidden.
- AI never calculates authoritative finance, self-confirms facts, or auto-approves unsupported claims.
- Financial results retain rule snapshots; incomplete/unverified financial rules cannot yield `verified`.
- Secrets never enter business SQLite, backups, logs, browser responses, request snapshots, or Git.
- Generated records are immutable revisions/results; locked records are preserved and changed dependencies mark downstream assets stale without auto-regeneration.
- Every task ends with its stated focused test plus relevant `pnpm typecheck`, `pnpm lint`, `pnpm test`, and/or `pnpm build`; failing checks block the commit.

## File map

```text
apps/web/src/                 route shell and vertical feature UI
apps/server/src/app.ts        Fastify construction
apps/server/src/context.ts    composition root
apps/server/src/routes/       validation-only HTTP/SSE adapters
packages/*/src/               focused domain/engine/infrastructure modules
migrations/                   reviewed immutable SQL migrations
default-rule-packs/           inert versioned rule data
default-prompts/              versioned prompt data
scripts/                      setup/start/validation utilities
tests/e2e/                    Playwright golden path
docs/adr/                     architecture decisions
```

---

## Phase 0 — Repository and specifications

### Task 1: Workspace and quality baseline

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`, `.gitignore`, `.env.example`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/version.ts`
- Test: `packages/shared/src/version.test.ts`

**Interfaces:**

- Produces: `APP_VERSION: "0.1.0"`, `AppVersion`.
- Consumes: no project interface.

- [ ] **Step 1: Write the failing baseline test** asserting `APP_VERSION === "0.1.0"` and that it matches the root package version.
- [ ] **Step 2: Run `pnpm --filter @eaw/shared test`** and confirm failure because the workspace/package does not exist.
- [ ] **Step 3: Add exact manifests and shared version module**; root scripts are `dev`, `build`, `start`, `test`, `typecheck`, `lint`, `format:check`, and `validate:rule-packs`.
- [ ] **Step 4: Install with pnpm 11.22.0 and run `pnpm typecheck && pnpm lint && pnpm test`**; all pass and create the lockfile.
- [ ] **Step 5: Commit** `chore: initialize pnpm workspace`.

### Task 2: Runnable server and web shell

**Files:**

- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/src/app.ts`, `apps/server/src/context.ts`, `apps/server/src/index.ts`, `apps/server/src/routes/health.ts`, `apps/server/src/app.test.ts`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, `apps/web/src/styles.css`, `apps/web/src/app.test.tsx`

**Interfaces:**

- Produces: `buildApp(context): FastifyInstance`, `createAppContext(options): AppContext`, `GET /api/v1/health -> {status:"ok", appVersion}`.
- Consumes: `APP_VERSION`.

- [ ] **Step 1: Add failing Fastify inject and React render tests** for health, Chinese navigation, and the five-field context bar.
- [ ] **Step 2: Run focused Vitest tests** and confirm missing modules/routes.
- [ ] **Step 3: Implement the smallest shell** with Vite proxy in development and loopback host default in server startup.
- [ ] **Step 4: Run `pnpm dev` smoke checks, `pnpm build`, and focused tests**; verify the web build is served in production mode.
- [ ] **Step 5: Commit** `feat: add runnable local workbench shell`.

### Task 3: CI, community files, and architecture records

**Files:**

- Create: `.github/workflows/ci.yml`, `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `RULE_PACK_CONTRIBUTING.md`
- Create: `docs/adr/0001-react-vite.md` through `docs/adr/0007-deterministic-finance.md`
- Create: `scripts/check-versions.mjs`, `scripts/check-versions.test.ts`

**Interfaces:**

- Produces: `checkRuntimeVersions({node,pnpm}): VersionCheckResult`.
- Consumes: root `engines` and `packageManager`.

- [ ] **Step 1: Write failing tests** for accepted Node 24.19/pnpm 11.22 and rejected Node 26/pnpm 10.
- [ ] **Step 2: Run the test** and observe missing checker.
- [ ] **Step 3: Implement the checker, Windows/Ubuntu CI matrix, docs, and seven ADRs**; CI executes frozen install, typecheck, lint, tests, build, rule validation.
- [ ] **Step 4: Run `node scripts/check-versions.mjs --node 24.19.0 --pnpm 11.22.0` and the full Phase 0 gate**.
- [ ] **Step 5: Commit** `chore: add cross-platform quality baseline`.

---

## Phase 1 — Foundation

### Task 4: Contracts, errors, and identifiers

**Files:**

- Create: `packages/domain/src/ids.ts`, `packages/domain/src/errors.ts`, `packages/contracts/src/errors.ts`, `packages/contracts/src/health.ts`, `packages/contracts/src/index.ts`
- Test: `packages/domain/src/ids.test.ts`, `packages/contracts/src/errors.test.ts`

**Interfaces:**

- Produces: branded UUID-v7 IDs, `DomainError`, `ErrorResponseSchema`, `toErrorResponse(error, traceId)`.
- Consumes: Zod.

- [ ] **Step 1: Test UUID-v7 shape/sortability and sanitized error mapping** including every canonical error code.
- [ ] **Step 2: Confirm tests fail** for missing types.
- [ ] **Step 3: Implement IDs and error contracts** without persistence imports.
- [ ] **Step 4: Run contract/domain tests and typecheck**.
- [ ] **Step 5: Commit** `feat: add shared identifiers and API errors`.

### Task 5: Workspace bootstrap, lock, and secret port

**Files:**

- Create: `packages/workspace/src/paths.ts`, `bootstrap.ts`, `lock.ts`, `secrets.ts`, `index.ts`
- Test: `packages/workspace/src/bootstrap.integration.test.ts`, `lock.integration.test.ts`, `secrets.test.ts`

**Interfaces:**

- Produces: `resolveDefaultWorkspace(platform, env)`, `initializeWorkspace(path)`, `acquireWorkspaceLock(path)`, `SecretStore {get,set,delete,isConfigured}`.
- Consumes: filesystem only; never domain database.

- [ ] **Step 1: Test Windows `%LOCALAPPDATA%`, idempotent directory creation, second-writer rejection, stale-lock recovery, and secret redaction**.
- [ ] **Step 2: Run tests** and confirm missing implementation.
- [ ] **Step 3: Implement bootstrap/lock/file-secret adapter** with restrictive permissions where supported and no secret read API for browser DTOs.
- [ ] **Step 4: Run integration tests on normalized Windows and POSIX fixtures**.
- [ ] **Step 5: Commit** `feat: add safe local workspace bootstrap`.

### Task 6: Drizzle database and migration runner

**Files:**

- Create: `packages/database/src/schema/core.ts`, `client.ts`, `migrate.ts`, `health.ts`, `index.ts`, `drizzle.config.ts`
- Create: `migrations/0000_foundation.sql`, `migrations/meta/_journal.json`
- Test: `packages/database/src/migrate.integration.test.ts`

**Interfaces:**

- Produces: `openDatabase(path)`, `migrateDatabase(db, migrationsDir)`, `checkIntegrity(db)`, tables `app_metadata`, `workspace_settings`.
- Consumes: workspace-resolved database path.

- [ ] **Step 1: Test fresh migration, idempotent rerun, integrity check, and rollback/preserved file on invalid migration** using real temporary SQLite.
- [ ] **Step 2: Confirm integration failure** before schema/migration exists.
- [ ] **Step 3: Implement Drizzle schema and explicit migration runner**; no runtime schema patching.
- [ ] **Step 4: Run migration integration tests and inspect `PRAGMA integrity_check` result**.
- [ ] **Step 5: Commit** `feat: establish migrated sqlite workspace database`.

---

## Phase 2 — Product core

### Task 7: Product vertical slice

**Files:**

- Create: `packages/domain/src/product/product.ts`, `product-repository.ts`; `packages/database/src/schema/products.ts`, `repositories/product-repository.ts`; `packages/application/src/products/*.ts`; `packages/contracts/src/products.ts`; `apps/server/src/routes/products.ts`; `apps/web/src/features/products/*`
- Test: matching `*.test.ts`, repository integration test, route contract test, React feature test.

**Interfaces:**

- Produces: `Product`, `ProductRepository`, `CreateProduct`, `ListProducts`, `GetProduct`, `ArchiveProduct`, `/api/v1/products` contracts.
- Consumes: UUID-v7 IDs and error mapping.

- [ ] **Step 1: Add failing tests** for create/list/get/archive, unique active name handling, DTO filtering, and empty/new-product UI states.
- [ ] **Step 2: Run focused tests** and confirm missing slice.
- [ ] **Step 3: Implement schema → repository → use case → contract → route → UI**; routes only parse/call/map.
- [ ] **Step 4: Run focused unit/integration/UI tests plus build**.
- [ ] **Step 5: Commit** `feat: add product library vertical slice`.

### Task 8: Product facts and double guard

**Files:**

- Create: `packages/domain/src/facts/product-fact.ts`, `fact-guard.ts`, `claim-guard.ts`; database schema/repository; application use cases; contracts/routes; `apps/web/src/features/facts/*`
- Test: `packages/domain/src/facts/fact-guard.test.ts`, `claim-guard.test.ts`, vertical integration/UI tests.

**Interfaces:**

- Produces: `evaluateFacts(facts): FactGuardResult`, `checkClaims(claims, allowedFacts): ClaimGuardResult`, fact CRUD/confirm endpoints.
- Consumes: current product identity and evidence references.

- [ ] **Step 1: Add canonical failing fixture** where only 304 steel/750ml are confirmed and “食品级/24小时保温” must be blocked or `needs_review`.
- [ ] **Step 2: Confirm failure** before guards exist.
- [ ] **Step 3: Implement immutable confirmation transitions, repository/use cases/routes, and fact status table UI**.
- [ ] **Step 4: Run guard/property/vertical tests** including inferred-never-confirms.
- [ ] **Step 5: Commit** `feat: enforce product fact and claim guards`.

### Task 9: Specification dimensions and SKU matrix

**Files:**

- Create: domain `specification.ts`, `sku-matrix.ts`; Drizzle spec/SKU tables; repository/use cases/contracts/routes; `apps/web/src/features/skus/*`
- Test: matrix unit/property tests, repository/route/UI tests.

**Interfaces:**

- Produces: `generateSkuMatrix(dimensions, existing): SkuCombination[]`, SKU CRUD/status contracts.
- Consumes: product ID and UUID-v7 factory.

- [ ] **Step 1: Test 2×2 generation, stable identity across regeneration, disabled combinations, zero/duplicate values, and SKU-specific fields**.
- [ ] **Step 2: Verify tests fail**.
- [ ] **Step 3: Implement pure matrix generation and complete vertical slice**.
- [ ] **Step 4: Run property tests, integration tests, and UI matrix interaction test**.
- [ ] **Step 5: Commit** `feat: add spu specification and sku matrix`.

### Task 10: Product platform profiles

**Files:**

- Create: platform profile domain/schema/repository/use cases/contracts/routes and `apps/web/src/features/platform-profile/*`.
- Test: profile contract/integration/UI tests.

**Interfaces:**

- Produces: one profile per `(productId, platformId)`, platform-specific category metadata.
- Consumes: platform registry ID contract introduced as fixed enum data.

- [ ] **Step 1: Test independent category codes and content per platform plus no AI call on platform switch**.
- [ ] **Step 2: Confirm failing state**.
- [ ] **Step 3: Implement profiles and URL-driven platform selection**.
- [ ] **Step 4: Run tests and build**.
- [ ] **Step 5: Commit** `feat: add product platform profiles`.

---

## Phase 3 — Financial foundation

### Task 11: Exact money, rates, and rounding

**Files:**

- Create: `packages/calculation-engine/src/money.ts`, `rate.ts`, `rounding.ts`, `trace.ts`, `index.ts`
- Test: same paths with `.test.ts` and `money.property.test.ts`.

**Interfaces:**

- Produces: `Money`, `Rational`, `BasisPoints`, `RoundingPolicy`, `CalculationTraceStep` and safe arithmetic functions.
- Consumes: no persistence or AI.

- [ ] **Step 1: Test exact ¥39.90 representation, rational multiplication, negative/overflow rejection, and each explicit rounding mode**.
- [ ] **Step 2: Confirm tests fail**.
- [ ] **Step 3: Implement with bigint internally and checked minor-unit serialization**.
- [ ] **Step 4: Run unit/property tests and typecheck**.
- [ ] **Step 5: Commit** `feat: add exact financial primitives`.

### Task 12: Safe formula AST and dependency DAG

**Files:**

- Create: `packages/calculation-engine/src/formula/{ast,schema,evaluator,dag}.ts`
- Test: evaluator, schema-depth, unknown-variable, and cycle tests.

**Interfaces:**

- Produces: `FormulaNodeSchema`, `evaluateFormula(ast, variables, policy)`, `orderDependencies(definitions)`.
- Consumes: exact financial primitives.

- [ ] **Step 1: Test all whitelist operators, division by zero, max depth, unknown variables, and `A→B→C→A` rejection**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement discriminated AST parser/evaluator and topological ordering** without dynamic code execution.
- [ ] **Step 4: Run formula unit/property tests**.
- [ ] **Step 5: Commit** `feat: add safe formula calculation graph`.

### Task 13: Cost profiles and pricing engine

**Files:**

- Create: cost domain/schema/repository/use cases/contracts/routes/UI; `packages/pricing-engine/src/{types,calculate,solver}.ts`
- Test: pricing unit/property tests plus cost vertical tests.

**Interfaces:**

- Produces: `calculatePricing(input): PricingResult`, cost item bases/statuses, saved immutable scenarios/results.
- Consumes: Money/formula/trace and SKU IDs; no database access inside pricing engine.

- [ ] **Step 1: Test target profit/margins/break-even, missing critical costs, estimates, breakpoint solving, and monotonic break-even under increased fixed cost**.
- [ ] **Step 2: Confirm failing tests**.
- [ ] **Step 3: Implement pure pricing solver then persistence/use-case/API/UI adapters**.
- [ ] **Step 4: Run engine properties, real-SQLite tests, pricing UI test, and build**.
- [ ] **Step 5: Commit** `feat: add traceable sku cost and pricing laboratory`.

---

## Phase 4 — Rule and platform core

### Task 14: Platform registry and capability enforcement

**Files:**

- Create: `packages/platform-engine/src/{registry,context,adapter,capabilities}.ts`, application/contracts/routes/UI capability banner.
- Test: registry/context/contract/UI tests.

**Interfaces:**

- Produces: `PlatformAdapter`, `PlatformContext`, `getCapabilities()`, `requireCapability()`.
- Consumes: product platform profile.

- [ ] **Step 1: Test canonical three-platform matrix and explicit unavailable promotion errors**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement registry/context and generic Taobao/Douyin content adapters**.
- [ ] **Step 4: Run tests and verify platform switching causes zero provider calls**.
- [ ] **Step 5: Commit** `feat: add truthful platform capability registry`.

### Task 15: Rule pack validation, resolution, and snapshots

**Files:**

- Create: `packages/rule-engine/src/{schemas,loader,checksum,resolver,snapshot,diff}.ts`; rule database tables/repository; import use case/contracts/routes/UI; `default-rule-packs/pinduoduo-cn/*`; `scripts/validate-rule-packs.mjs`
- Test: general/category/user/conflict/expired/snapshot/import security tests.

**Interfaces:**

- Produces: `loadRulePack`, `resolveRules`, `createRuleSnapshot`, inert manifest/rule Zod schemas.
- Consumes: platform/category and app version.

- [ ] **Step 1: Test precedence, same-level conflict, expiry, checksum/compatibility, ZIP traversal rejection, executable-file rejection, and historical snapshot immutability**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement loader/resolver/snapshot and a provenance-bearing Pinduoduo pack whose uncertain financial rules are `needs_review`**.
- [ ] **Step 4: Run unit/integration/import tests and `pnpm validate:rule-packs`**.
- [ ] **Step 5: Commit** `feat: add versioned inert platform rule packs`.

---

## Phase 5 — Promotion

### Task 16: Generic promotion and revenue attribution engine

**Files:**

- Create: `packages/promotion-engine/src/{components,normalize,calculate,solver,types}.ts`
- Test: engine unit/property/invariant tests.

**Interfaces:**

- Produces: `calculatePromotion(input): PromotionResult`, `solveCampaignPrice(input)`, full money-flow trace.
- Consumes: exact calculation/pricing types and immutable rule snapshot.

- [ ] **Step 1: Test every generic component, merchant/platform attribution, non-negative payment, no duplicate deduction, discount monotonicity, caps/thresholds, and result statuses**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement pure normalization/calculation/breakpoint solver**.
- [ ] **Step 4: Run unit and property tests with identical-snapshot determinism assertion**.
- [ ] **Step 5: Commit** `feat: add deterministic promotion money flow`.

### Task 17: Pinduoduo scenario vertical slice and batch calculation

**Files:**

- Create: Pinduoduo adapter, promotion schema/repository/use cases/contracts/routes, `apps/web/src/features/promotion/*`.
- Test: adapter, repository, API, UI, batch integration tests.

**Interfaces:**

- Produces: normalized PDD scenario, immutable result, `POST /promotion-scenarios/:id/calculate`, batch result rows.
- Consumes: promotion engine, cost profile, active rule snapshot, selected SKUs.

- [ ] **Step 1: Test complete/incomplete PDD scenarios, persisted trace/snapshot, all output questions, and multi-SKU rows**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement application adapters and two-column simulation UI with expandable trace**.
- [ ] **Step 4: Run vertical/invariant/UI tests and build**.
- [ ] **Step 5: Commit** `feat: add pinduoduo promotion simulator`.

---

## Phase 6 — AI infrastructure

### Task 18: Prompt templates and injection-safe compiler

**Files:**

- Create: `packages/prompt-engine/src/{template,compiler,trust,hash}.ts`, prompt database tables/repository, `default-prompts/*.json`
- Test: compiler snapshot, trust-delimiting, hash/version tests.

**Interfaces:**

- Produces: `compilePrompt(input): CompiledPrompt`, dependency/input hash, five trust levels.
- Consumes: allowed facts, platform context/rules, Zod JSON schema.

- [ ] **Step 1: Test deterministic compilation, external-untrusted delimiters, prompt/rule separation, and hash changes per dependency**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement versioned templates/compiler and validate default prompt files**.
- [ ] **Step 4: Run tests and scan business/routes/UI for embedded task prompts**.
- [ ] **Step 5: Commit** `feat: add versioned injection-safe prompt compiler`.

### Task 19: AI provider, DeepSeek, structured pipeline, and logs

**Files:**

- Create: `packages/ai-engine/src/{provider,registry,deepseek,retry,structured,generation-log}.ts`; generation schema/repository; AI settings contracts/routes/UI.
- Test: fake-provider, DeepSeek HTTP mock, retry, invalid-output, secret-redaction integration tests.

**Interfaces:**

- Produces: `AIProvider`, `DeepSeekProvider`, `generateValidated`, sanitized immutable `AIGeneration`.
- Consumes: SecretStore, prompt compiler, fact/claim guards.

- [ ] **Step 1: Test timeout/rate retry bounds, one repair, invalid JSON/field/enum/evidence/other-product ref/unsupported claim, and absence of secret in DB/response/log snapshots**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement provider/registry/pipeline/logging and configured-only settings DTO**.
- [ ] **Step 4: Run provider/contract/integration tests with fake HTTP and no real paid call**.
- [ ] **Step 5: Commit** `feat: add guarded deepseek generation pipeline`.

---

## Phases 7–9 — Competitors, strategy, content, and creative

### Task 20: Competitors and imports

**Files:**

- Create: competitor identity/snapshot/provider domain, schema/repository/use cases/contracts/routes/UI; CSV/XLSX/paste import adapters.
- Test: raw-sales preservation, import fixtures, product ownership, UI tests.

**Interfaces:**

- Produces: `CompetitorDataProvider`, normalized immutable snapshots, import preview/confirm.
- Consumes: product identity and workspace-relative assets.

- [x] **Step 1: Test that “10万+” remains text, analysis cannot mutate snapshot, and malformed/cross-product imports fail**.
- [x] **Step 2: Confirm failure**.
- [x] **Step 3: Implement preview-first import and competitor UI without crawling**.
- [x] **Step 4: Run import/repository/contract/UI tests**.
- [x] **Step 5: Commit** `feat: add auditable competitor snapshots and imports`.

### Task 21: Competitor analysis, market insight, and selling points

**Files:**

- Create: AI task contracts/templates/validators, insight and selling-point domain/schema/repositories/use cases/routes/UI.
- Test: structured pipeline/evidence ownership/needs-verification/UI tests.

**Interfaces:**

- Produces: structured competitor analysis, market insight, selling-point set/evidence.
- Consumes: AI generation pipeline, snapshots, allowed facts, platform context.

- [x] **Step 1: Test each task schema, evidence links, data limitations, unsupported idea→suggested fact, and regeneration revisions**.
- [x] **Step 2: Confirm failure**.
- [x] **Step 3: Implement three vertical AI nodes and evidence-explaining UI**.
- [x] **Step 4: Run fake-provider vertical tests and build**.
- [x] **Step 5: Commit** `feat: add evidence-backed market strategy`.

### Task 22: Versioned title studio

**Files:**

- Create: content-asset domain/schema/repository/versioning/stale service; title task/use cases/contracts/routes; title UI.
- Test: revisions/locks/stale/claim/rule/keyword/count tests.

**Interfaces:**

- Produces: title lineage/revisions in recommended/search/selling-point/scenario variants.
- Consumes: selling-point revision, facts, prompt/rule versions, platform context.

- [ ] **Step 1: Test new revisions on edit/regenerate, locked preservation, stale reasons, unsupported claim review, and local rule checks**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement title generation and local deterministic validation UI**.
- [ ] **Step 4: Run versioning/AI/UI tests and build**.
- [ ] **Step 5: Commit** `feat: add guarded versioned title studio`.

### Task 23: Creative and detail-page builders

**Files:**

- Create: creative/detail domain/schema/repositories; three AI task contracts/templates/use cases/routes; creative/detail UI with reorder/lock/regenerate.
- Test: structured item/section, reference, item regeneration, lock, reorder, stale tests.

**Interfaces:**

- Produces: `CreativePlan`, `CreativeItem[]`, `DetailPageArchitecture`, `DetailPageSection[]` with bilingual/negative prompts.
- Consumes: selling points, facts, platform image/content rules, AI pipeline.

- [ ] **Step 1: Test five-image sequence, per-item evidence, one-item regeneration, locked item preservation, and stable section reorder**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement structured builders; do not add image generation**.
- [ ] **Step 4: Run domain/AI/route/UI tests and build**.
- [ ] **Step 5: Commit** `feat: add structured creative and detail builders`.

---

## Phase 10 — Workflow and operation plan

### Task 24: Persisted workflow DAG and SSE

**Files:**

- Create: `packages/workflow-engine/src/{dag,runner,persistence,recovery,idempotency}.ts`; workflow schema/repository/use cases/contracts/routes/SSE; UI progress/resume banner.
- Test: DAG, persistence, restart, retry, cancel, SSE contract tests.

**Interfaces:**

- Produces: `WorkflowDefinition`, `WorkflowRunner`, state GET and event stream.
- Consumes: application-node handlers keyed by task type.

- [ ] **Step 1: Reproduce canonical failure at creative after four completed nodes, restart, resume only failed node, and assert unchanged nodes invoke AI zero times**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement persisted state/idempotency/recovery/SSE and explicit user resume**.
- [ ] **Step 4: Run recovery/concurrency/SSE tests and server build**.
- [ ] **Step 5: Commit** `feat: add resumable persisted generation workflow`.

### Task 25: Traceable operation plans

**Files:**

- Create: operation-plan domain/schema/repository/use cases/contracts/routes/UI/history.
- Test: aggregate validation, immutability, missing/stale/locked reference tests.

**Interfaces:**

- Produces: immutable `OperationPlanSnapshot` referencing exact upstream IDs and rule version.
- Consumes: completed content and financial results.

- [ ] **Step 1: Test successful exact aggregation and rejection of cross-product, absent, invalid, or incompatible references**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement plan assembly/lock/history UI without requesting a summary generation**.
- [ ] **Step 4: Run integration/UI tests and build**.
- [ ] **Step 5: Commit** `feat: aggregate traceable operation plans`.

---

## Phase 11 — Workspace reliability

### Task 26: Consistent backup and transactional restore

**Files:**

- Create: `packages/workspace/src/{backup,restore,manifest,archive-security}.ts`; data-management use cases/contracts/routes/UI.
- Test: WAL snapshot, checksum, ZIP traversal, compatibility, rollback, secret exclusion, cross-machine tests.

**Interfaces:**

- Produces: `createBackup(context): BackupManifest`, `validateBackup`, `restoreBackup`.
- Consumes: SQLite backup API, workspace paths, installed rule/prompt versions.

- [ ] **Step 1: Test active-WAL consistency, full referenced data, no secrets/absolute paths, corrupt archive rejection, and old workspace preservation on failure**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement safe snapshot/archive/staged restore/integrity/migration/swap**.
- [ ] **Step 4: Run integration and simulated Windows cross-machine restore tests**.
- [ ] **Step 5: Commit** `feat: add safe portable workspace backup`.

### Task 27: Idempotent Windows setup and start

**Files:**

- Create: `scripts/setup.ps1`, `scripts/start.ps1`, `scripts/windows/*.psm1`
- Test: `tests/scripts/setup.Tests.ps1`, `start.Tests.ps1`, cross-platform static checks.

**Interfaces:**

- Produces: repeatable setup/migrate/default installation and loopback start/health/browser flow.
- Consumes: version checker and workspace bootstrap CLI.

- [ ] **Step 1: Write Pester/static failing tests** for version errors, idempotency, data preservation, loopback binding, health timeout, and quoted paths with spaces/Chinese text.
- [ ] **Step 2: Confirm failure on Windows CI**.
- [ ] **Step 3: Implement scripts with `$ErrorActionPreference = 'Stop'`, explicit exits, and no source edits**.
- [ ] **Step 4: Run Windows CI script tests twice against the same workspace**.
- [ ] **Step 5: Commit** `feat: add windows setup and start workflow`.

---

## Phase 12 — Polish and end-to-end acceptance

### Task 28: Dashboard, settings, and offline UX

**Files:**

- Create/modify: dashboard query/use case/contracts/routes/UI; rule/prompt/AI/system screens; global error boundary and offline banners.
- Test: risk summary, capability, offline, settings redaction, accessibility tests.

**Interfaces:**

- Produces: actionable dashboard summary and truthful offline/capability UX.
- Consumes: read models only; offline mode blocks new AI/external fetches but not local finance/history.

- [ ] **Step 1: Test missing-cost/stale/rule/loss counts, provider configured-only response, offline allowed/blocked actions, and semantic status labels**.
- [ ] **Step 2: Confirm failure**.
- [ ] **Step 3: Implement focused read model and desktop UI polish**.
- [ ] **Step 4: Run UI/API/accessibility tests and build**.
- [ ] **Step 5: Commit** `feat: complete operational dashboard and offline ux`.

### Task 29: Playwright golden path and final gates

**Files:**

- Create: `playwright.config.ts`, `tests/e2e/golden-path.spec.ts`, `tests/e2e/fixtures/fake-ai-provider.ts`, `tests/e2e/fixtures/competitors.csv`
- Modify: CI to run E2E and archive traces on failure; README Windows acceptance section.

**Interfaces:**

- Produces: automated acceptance of the canonical product-to-locked-plan path.
- Consumes: public browser/API behavior; no internal database shortcuts.

- [ ] **Step 1: Write the failing golden-path spec** covering product, fact confirmation, SKU, cost, competitor import, AI strategy/content/creative/detail, pricing, PDD promotion, trace, operation plan, and lock.
- [ ] **Step 2: Run `pnpm exec playwright test tests/e2e/golden-path.spec.ts`** and capture the first behavioral gap.
- [ ] **Step 3: Fix only acceptance gaps through their owning modules**, adding focused regressions for each defect.
- [ ] **Step 4: Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm validate:rule-packs && pnpm exec playwright test` on Windows and Ubuntu**; all must pass.
- [ ] **Step 5: Commit** `test: verify complete ecommerce workbench golden path`.

## Coverage review

- Phases 0–2 cover repository, architecture, app shell, workspace/database, products, facts, SKU matrix, and platform profiles.
- Phases 3–5 cover exact money/formulas/cost/pricing, platform/rule truthfulness, Pinduoduo promotion, batch calculation, and traces.
- Phases 6–9 cover secrets, prompts, DeepSeek, structured validation/logs, competitors, evidence-backed strategy, title/creative/detail versions, locks, and stale propagation.
- Phase 10 covers persistent idempotent workflow/SSE/recovery and immutable operation-plan aggregation.
- Phase 11 covers consistent backup/restore, migration/integrity, Windows setup/start, and cross-machine portability.
- Phase 12 covers dashboard/settings/offline/error UX and the full Playwright acceptance path.
- Every canonical quality floor maps to at least one focused task and the final golden-path gate.
