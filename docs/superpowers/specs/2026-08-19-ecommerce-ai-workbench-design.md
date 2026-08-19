# Ecommerce AI Workbench — Canonical Product & Architecture Spec v0.1

**Status:** Approved canonical specification  
**Date:** 2026-08-19  
**Product:** Ecommerce AI Workbench  
**Repository:** `ecommerce-ai-workbench`

## 1. Product intent and success criterion

Ecommerce AI Workbench is a local-first, open-source, AI-assisted decision workbench for Chinese ecommerce operators. The aggregate root is the product/SPU, not a chat, prompt session, order, store, or tenant.

v0.1 succeeds when a user can create one real product, confirm its claims, define SPU/SKU data and costs, import competitors, produce evidence-backed AI strategy and content, calculate deterministic target pricing, simulate a Pinduoduo promotion, inspect the complete money trace, aggregate a traceable operation plan, lock that version, back up the workspace, and restore it on another Windows computer.

The golden path is:

```text
Product → confirmed facts → dimensions/SKUs → costs → competitors
→ competitor analysis → market insight → selling points
→ titles → creative plan → detail-page plan
→ pricing → Pinduoduo promotion simulation → calculation trace
→ operation plan → locked version
```

v0.1 is not an ERP, order/inventory/fulfilment system, SaaS, multi-user service, crawler, publishing robot, platform automation tool, chat wrapper, image generator, or general BI system.

## 2. Scope and platform truthfulness

The platform registry contains `pinduoduo`, `taobao_tmall`, and `douyin_ecommerce` from day one.

| Capability | Pinduoduo | Taobao/Tmall | Douyin Ecommerce |
| --- | --- | --- | --- |
| content | supported | supported | supported |
| creative | supported | supported | supported |
| pricing | supported | generic | generic |
| promotion | supported when rules are complete | unavailable | unavailable |
| fee model | rule-pack governed | incomplete | incomplete |

Unsupported or incomplete capabilities return `CAPABILITY_UNAVAILABLE` or an incomplete result and the UI states “当前平台此能力尚未完整实现。” The application never fabricates deterministic platform profit.

## 3. Fixed technology baseline

Production development uses stable releases only. The baseline verified on 2026-08-19 is:

- Node.js `24.19.0` LTS; `engines.node` is `>=24.19.0 <25`.
- pnpm `11.22.0`; `packageManager` pins `pnpm@11.22.0`.
- TypeScript `6.0.3`, chosen instead of TypeScript 7 because typescript-eslint 8.67 declares support below 6.1.
- React and React DOM `19.2.8`.
- Vite `8.2.1` and `@vitejs/plugin-react` `6.0.5`.
- Fastify `5.12.1`.
- Drizzle ORM `0.45.2` and Drizzle Kit `0.31.10`; 0.45.2 contains the current stable security fix and no RC package is used.
- Zod `4.4.3`, React Router `7.18.2`, TanStack Query `5.101.4`, React Hook Form `7.85.0`, Tailwind CSS `4.3.3`.
- Vitest `4.1.11` and Playwright `1.62.1`.

Phase 0 records exact versions in manifests and the lockfile. Node 24 is the supported LTS even if a contributor's machine has a newer Current release. Dependency updates require a reviewed lockfile change and successful Windows/Ubuntu CI.

## 4. System architecture and boundaries

The system is a modular monolith:

```text
Browser
  → React + API client
  → 127.0.0.1 Fastify server (/api/v1)
  → application use cases
  → domain and deterministic engines
  → repositories / SQLite / workspace / provider adapters
```

Development runs Vite with an API proxy to Fastify. Production serves the built React application and API from one Fastify process bound to `127.0.0.1`. Docker is optional tooling, never a runtime requirement.

Allowed dependency direction:

```text
React → api-client → Fastify routes → application
application → domain contracts and engine ports
infrastructure → implements repositories, workspace, AI, and platform ports
```

Forbidden dependencies include React to SQLite/Drizzle, routes containing business rules, financial engines touching persistence or AI, business modules constructing a DeepSeek client, React hard-coding platform rules, and prompts embedded in routes/services/components.

The Fastify composition root `createAppContext()` explicitly constructs database, repositories, workspace, rule/platform/calculation/pricing/promotion/prompt/AI/workflow engines, and application use cases. No DI framework is introduced.

## 5. Monorepo shape

Packages are created only when they contain working behavior:

```text
apps/web                 React application
apps/server              Fastify host and composition root
packages/shared          cross-cutting primitives and identifiers
packages/domain          entities, value objects, repository ports
packages/contracts       Zod HTTP and AI contracts
packages/api-client      typed browser client
packages/application     product-centred use cases
packages/database        Drizzle schema, migrations, repositories
packages/calculation-engine exact arithmetic, formula AST, DAG, trace
packages/pricing-engine  pure target-price solver
packages/promotion-engine pure promotion/revenue-attribution engine
packages/rule-engine     rule packs, resolver, snapshots
packages/platform-engine registry, contexts, adapters
packages/prompt-engine   templates, versions, compiler
packages/ai-engine       providers, validation pipeline, logs
packages/workflow-engine persisted DAG runner and SSE state
packages/workspace       workspace, locks, backup/restore, secrets port
```

Shared contracts do not import persistence models. Infrastructure may depend inward; domain and deterministic engines never depend outward.

## 6. Domain model and invariants

### 6.1 Product root

`Product`/SPU owns facts, specification dimensions/values, the SKU matrix, platform profiles, competitor links, market insights, selling-point sets, content assets, creative/detail plans, workflow runs, and operation plans.

Important mutable business records use UUID v7 text identifiers and soft deletion. Generated records—AI generation logs, pricing results, promotion results, rule snapshots, and operation-plan snapshots—are immutable; changed inputs create revisions/results.

### 6.2 SPU and SKU

Dimensions and values produce the Cartesian SKU matrix. Users can disable nonexistent combinations. Each SKU independently stores its internal/external/barcode identifiers, weight, platform SKU identity, enabled state, cost profiles, pricing scenarios, and promotion scenarios.

### 6.3 Product Fact Guard

`ProductFact` includes key/label, typed value/unit, source type/reference, verification status, sensitive-claim flag, timestamps, and confirmation time. Verification is one of `confirmed`, `unverified`, `inferred`, or `missing`; sources are `manual`, `supplier`, `import`, `document`, `ai_inferred`, `competitor_reference`, or `other`.

Only policy-eligible confirmed facts are allowed as deterministic promotional evidence. AI inference never self-promotes to confirmed.

The double guard is mandatory:

1. Input Guard divides context into allowed, restricted, and missing facts before generation.
2. Output Claim Guard checks parsed output for unsupported claims after generation.

An unsupported deterministic claim prevents automatic approval, creates a `needs_review` asset, and exposes each unsupported claim. For the fixture containing only confirmed “304不锈钢” and “750ml”, “食品级” and “24小时保温” are unsupported.

### 6.4 Competitors and evidence

Competitor identity, captured snapshot, and AI analysis remain separate. Snapshots preserve capture time, displayed prices/sales/reviews/SKU/selling points/image references, raw payload, source, and URL. Displayed sales such as “10万+” remain text, never fake exact counts.

v0.1 imports manual entry, pasted data, CSV, Excel, and source URLs through a `CompetitorDataProvider` port. There is no required crawler.

Selling points are structured: headline, description, consumer pain/benefit, differentiation, risk, priority, recommended usage, and evidence references. Evidence can reference facts, competitor snapshots, or market insights and must belong to the current product. Useful unsupported ideas become suggested facts requiring verification.

## 7. AI, prompt, and content architecture

Business use cases depend on `AIProvider`, whose minimum interface is `generateText`, `generateStructured`, `testConnection`, and `getCapabilities`. DeepSeek is complete in v0.1; OpenAI-compatible, Ollama, custom, and image providers remain substitutable ports without delaying the MVP.

API keys never enter business SQLite, backups, logs, Git, request snapshots, or browser responses. Development may read `.env.local`; production uses a local secret-storage adapter. GET settings exposes only `configured`.

Prompts are versioned `PromptTemplate` records compiled by `PromptCompiler` from system role, task contract, confirmed facts, business context, platform context/rules, user instructions, and output schema. Prompt templates and platform rules remain separate.

Context trust is ordered `SYSTEM`, `RULE`, `CONFIRMED_FACT`, `APPROVED_AI_ASSET`, `EXTERNAL_UNTRUSTED`. External supplier/competitor/web content is delimited and explicitly described as data, never instructions.

Core AI tasks are competitor analysis, market analysis, selling-point generation, title generation, creative strategy, main-image plan, detail-page architecture, and detail-page section. Each owns an input contract, Zod output schema, prompt/version, business/fact/platform/risk validation, and generation log.

The processing pipeline is:

```text
provider response → JSON parse → Zod validation → business validation
→ fact validation → platform validation → risk validation → versioned asset
```

Network failures use bounded exponential-backoff retries. Malformed structured output permits one repair attempt. Business validation failures become `needs_review`; loops are never unbounded.

Generation logs record provider/model/task/prompt version/input hash, sanitized request snapshot, raw and parsed responses, status/error/tokens/times—never secrets.

Content assets use `lineageId` plus increasing `revisionNo`. User edits create new `user_edited` revisions. Locked revisions are never overwritten by workflows. Assets store dependency input hashes; changed facts, selling points, rule packs, prompts, or instructions mark them stale with explicit reasons and never silently regenerate.

Creative output is a strategy followed by a plan and structured image items. Detail pages are architecture plus reorderable, independently editable/regenerable/lockable sections. Image items and sections carry objectives, fact/selling-point refs, layout/direction, copy, Chinese/English prompts, and negative prompts. v0.1 does not need to render images.

## 8. Deterministic financial system

AI may analyze or explain a completed trace but never calculates authoritative money.

Money is integer minor units; rates are integer basis points or exact rational values. All multiplication/division is exact and ends through an explicit rounding policy. Values must remain within the JavaScript safe-integer boundary or use a verified arbitrary-precision integer strategy.

The calculation engine knows only Money, rates, rounding, a safe formula AST, dependency DAG/cycle detection, evaluator, and trace. The AST whitelist contains add/subtract/multiply/divide, min/max, round/ceil/floor, if, and compare. `eval`, `Function`, dynamic JavaScript, unbounded depth, unknown variables, and cycles are rejected.

Cost profiles belong to SKUs and contain fixed, percentage, or safe-formula items. Percentage items declare their base (`consumer_payment`, `recognized_revenue`, `merchant_settlement`, or `campaign_price`). Financial inputs are `confirmed`, `estimated`, or `missing`; results expose each class. Missing critical inputs forbid a verified minimum safe price.

`calculatePricing(input): PricingResult` is pure and supports target unit profit, net margin, gross margin, and break-even. It returns break-even, minimum safe, target and recommended prices, revenue/cost/profit/margin, status, and trace. Piecewise discounts, caps, floors, and tiers are solved by breakpoint partitioning and candidate verification, not one false linear equation.

The promotion engine consumes generic components: fixed/percentage/threshold discounts, merchant/platform coupons, platform subsidy, membership discount, commission, service fee, and custom adjustments. It distinguishes list price, campaign price, consumer payment, platform subsidy, recognized revenue, platform deductions, merchant settlement, operating costs, and net profit.

Merchant- and platform-borne discounts are attributed separately so a reduced consumer payment is not deducted again as an operating cost. Results include all required money-flow values, break-even/target campaign prices, remaining discount budget, trace, and status `verified`, `warning`, `incomplete`, or `invalid`.

`verified` requires complete confirmed inputs and verified active financial rules. Estimates/stale rules produce `warning`; missing rules/costs produce `incomplete`; invalid formulas/input produce `invalid`. Batch calculation applies one immutable promotion scenario to multiple selected SKUs.

## 9. Platform and rule system

The platform engine owns the registry, capability matrix, product platform profiles, context builder, and adapter registry. Profiles preserve platform-specific categories/IDs/metadata/status.

Adapters interpret platform semantics via capabilities, category mapping, content context/validation, fee resolution, promotion normalization/validation, and rounding policy. Rule packs are inert data, never executable code.

Rule resolution order is user override, most-specific category rule, platform general rule, then application fallback. Same-level disagreements return `RULE_CONFLICT`. Expired or unverified critical financial rules cannot produce verified results.

Rule packs contain versioned JSON/Markdown, manifest, schemas, fixtures, and changelog. Manifests record schema/platform/region/version/publisher/verification date/minimum app version/checksum/description. Rules record key/type/scope, provenance URL/title/type, verification/effective dates, status, summary/implementation note, machine config, and impact.

v0.1 supports install from JSON/ZIP, schema/checksum/compatibility/conflict validation, diff, overrides, and active version. Initial uncertain Pinduoduo financial rules are `needs_review`; no rate is invented. Every financial result and operation plan embeds its rule snapshot/version so later pack changes cannot rewrite history.

## 10. Persistence, workspace, and local security

SQLite plus Drizzle migrations is authoritative. Schema changes always ship as schema plus migration plus test. Startup never performs ad-hoc repair DDL.

The schema covers workspace/app metadata/assets; product/fact/spec/SKU/platform profile; competitors/snapshots/analyses; insights/selling points/evidence/content/creative/detail; rules/overrides; cost/pricing/promotion; AI providers/prompts/generations; workflow; and operation plans.

Source code and user data are separate. The default Windows workspace is `%LOCALAPPDATA%\EcommerceWorkbench\workspace`, and a user can select another directory. Stored asset paths are normalized workspace-relative paths.

A workspace contains database, product/competitor/import/generated assets, rule packs, exports, backups, logs, and `workspace.json`. A valid single-writer lock causes `WORKSPACE_LOCKED`.

Backup uses a SQLite-consistent snapshot, then archives manifest, database, assets, rule packs, prompts/overrides, and required workspace data. Secrets are excluded. Restore validates archive paths, checksum, compatibility, integrity, and migration before replacing active data; failure preserves the original workspace.

The local server listens on `127.0.0.1`, serves production UI/API same-origin, rejects abnormal Host/Origin values, enables no arbitrary CORS, sanitizes errors, and never returns secrets.

## 11. API and errors

REST endpoints live below `/api/v1`. Routes validate request/response contracts, invoke one use case, and map the result. Database rows never cross the boundary directly.

Errors have `error.code`, `error.message`, `error.details`, and `error.traceId`. Required codes are `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `FACT_VERIFICATION_REQUIRED`, `RULE_INCOMPLETE`, `RULE_CONFLICT`, `CAPABILITY_UNAVAILABLE`, `PRICING_INPUT_INCOMPLETE`, `CALCULATION_INVALID`, `AI_PROVIDER_UNAVAILABLE`, `AI_OUTPUT_INVALID`, `WORKSPACE_LOCKED`, and `MIGRATION_FAILED`. Stack traces stay server-side and sanitized logs contain no secret.

## 12. Workflow and operation plans

The workflow engine is a SQLite-persisted DAG with an in-process runner. Nodes use `not_started`, `running`, `completed`, `failed`, `stale`, `locked`, or `needs_review`; workflow runs can also become `interrupted` or `cancelled`.

It supports preflight, start, resume, retry node, cancel, interrupted recovery, locked outputs, and dependency hashes. `(workflowRunId, nodeKey, dependencyHash)` provides idempotency. A successful unchanged node is reused; a server restart marks running work interrupted and never automatically consumes AI credits.

Progress streams over SSE. Reconnection reconciles through ordinary workflow-state GET before reopening the stream.

An operation plan is a structured immutable aggregate—not a new AI essay—referencing exact product snapshot, competitor analysis, market insight, selling-point set, title, creative/detail plan, pricing/promotion result, and rule-pack version.

## 13. User experience

The desktop-first light interface uses professional operations-dashboard styling and semantic success/warning/danger/muted colors, not an AI-purple chat shell.

Global navigation contains Workbench, Products (library/new), Content Assets, Platforms & Rules, AI Settings, Data Management, and System Settings. Product navigation contains overview, facts, SKU, competitors, market, selling points, titles, creative, detail page, costs, pricing, promotion, operation plan, and history.

The persistent context bar exposes current product, SKU, platform, rule-pack state, AI provider, and “生成完整运营方案”. Product/SKU/platform/tab state is URL-addressable. TanStack Query owns server state; React Hook Form plus Zod owns forms; no giant global Redux store is created.

The dashboard prioritizes counts and actionable risk: missing costs, changed rules, stale content, loss-making scenarios, recent products, and quick actions. Financial screens show consumer payment, recognized revenue, settlement, deductions, operating costs, profit/margin, safety prices, status, and an expandable trace with formulas, inputs, rule sources, rounding, and results.

## 14. Testing and quality gates

Unit tests cover exact arithmetic, formula AST/DAG, pricing, promotion, rule resolution, Fact/Claim Guards, dependency hashes, and workflow DAG. Financial property/invariant tests prove monotonic break-even with higher fixed costs, non-increasing profit with higher merchant discount, non-negative consumer payment, no duplicate discount deduction, and deterministic results for identical snapshots/engine versions.

Integration tests use real temporary SQLite databases for migrations, repositories, transactions, rule-pack install, workflow persistence/recovery, and backup/restore. Contract tests cover API, AI structured outputs, rule packs, and prompts. Playwright covers the golden path.

CI runs on Windows and Ubuntu with frozen install, typecheck, lint, unit/integration tests, build, and rule-pack validation. Each phase must actually pass its relevant checks before completion.

## 15. Delivery phases

0. Repository/specification, ADRs, pnpm/TypeScript baseline, CI.
1. Shared/domain/contracts, server/web shell, database/migration, workspace/bootstrap/secrets.
2. Product vertical slices: products, facts, SKU matrix, platform profiles.
3. Exact calculation, formula DAG, cost profiles, pricing.
4. Platform registry, rule packs/resolution/snapshots, Pinduoduo adapter.
5. Promotion/revenue attribution/Pinduoduo simulation/batch calculation.
6. Prompt/AI providers/DeepSeek/structured outputs/logging/guards.
7. Competitors/import/analysis/market/selling points/evidence.
8. Titles, alternatives, local validation, versions/locks/stale.
9. Creative and detail-page structured builders.
10. Workflow DAG/SSE and operation-plan aggregate.
11. Backup/restore/integrity/cross-machine/PowerShell scripts.
12. Dashboard/history/settings/offline/error polish and Playwright golden path.

Every vertical feature includes domain/database, repository, use case, contract, API, UI state, validation, and tests. Every AI feature also includes prompt version, structured output, guard, generation log, and failure UX. Every financial feature also includes exact arithmetic, trace, rule snapshot, unit and invariant tests.

## 16. Distribution and documentation

The repository provides README, MIT license, contributing/security/changelog/code-of-conduct documents, environment example, rule-pack contribution guide, architecture/product/development/rule/prompt docs, and ADRs for React+Vite, Fastify, SQLite+Drizzle, local-first, rule-pack architecture, AI provider abstraction, and deterministic finance.

`scripts/setup.ps1` idempotently checks Node/pnpm, installs frozen dependencies, initializes bootstrap/workspace if absent, runs migrations, and installs default prompts/rules without deleting user data. `scripts/start.ps1` validates the environment, starts production bound to loopback, health-checks it, and opens the browser.

The required commands are `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm test`, `pnpm typecheck`, and `pnpm lint`.

## 17. Non-negotiable safety invariants

The product is incomplete if any of these occur:

- AI determines authoritative profit or unverified claims auto-approve.
- Financial decisions depend on uncontrolled binary floating point.
- Inferred facts self-confirm; locked/stale/versioned assets are overwritten.
- Platform fees/promotions are hard-coded in React or uncertain rules yield verified results.
- Prompts and platform rules are inseparable or rule packs execute code.
- API keys enter SQLite, backup, logs, Git, or the browser.
- Rule updates mutate historical calculation/operation-plan meaning.
- Platform switching overwrites another platform's assets or triggers AI calls.
- Workflow retry recharges completed unchanged nodes.
- Consumers cannot inspect the full calculation trace.
- Unsupported Taobao/Douyin promotion produces fake deterministic profit.
- Workspace data lives inside the cloned repository or setup overwrites it.
- Windows requires source edits or Docker to run.
- The product becomes a large chat UI.

## 18. Deferred work

v0.2 candidates are actual image generation, complete additional AI providers, batch AI queue, GitHub rule updates, competitor acquisition providers, PDF reports, CAC/ROAS, and advanced version diffs. Tauri may later wrap the same TypeScript core for credential storage, dialogs, tray, and auto-update; financial engines are not rewritten in Rust.
