# Traceable Operation Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable, product-owned operation plans that aggregate exact workflow, content, competitor, pricing, promotion, and rule-snapshot references and can be explicitly locked after revalidation.

**Architecture:** Domain values define exact source references and lifecycle invariants. SQLite stores append-only plan revisions and normalized references; the application resolves every ID through repository ports and computes blockers without AI. Strict Fastify contracts expose draft/list/get/lock, and React adds source trace, blocker, lock, and history views below the existing workflow UI.

**Tech Stack:** Node.js 24.19.0, pnpm 11.22.0, TypeScript 6, SQLite STRICT tables, Zod, Fastify 5, React 19, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-traceable-operation-plans-design.md`

## Global Constraints

- Add no external dependency and make no real AI request in automated tests.
- Persist exact IDs, revisions, dependency hashes, and rule snapshot hashes; never resolve a historical plan through mutable latest pointers.
- Every write appends a revision and uses `expectedRevisionNo`; plan rows and source rows are immutable.
- Draft creation and locking validate product/platform ownership and fail closed on missing or malformed sources.
- Locking never regenerates content, advances a reference, or calls an AI provider.
- Unsupported promotion capability remains optional and explicit; no synthetic promotion or financial result is allowed.

---

### Task 1: Domain aggregate and deterministic source hash

**Files:**

- Create: `packages/domain/src/operation-plans/operation-plan.ts`
- Create: `packages/domain/src/operation-plans/operation-plan.test.ts`
- Create: `packages/domain/src/operation-plans/operation-plan-repository.ts`
- Create: `packages/domain/src/operation-plans/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `UuidV7`, `PlatformId`, existing workflow output-reference semantics, and SHA-256 canonical hashing at the application boundary.
- Produces: `OperationPlanRevision`, `OperationPlanSources`, `OperationPlanBlocker`, `createOperationPlanRevision`, `lockOperationPlanRevision`, and `OperationPlanRepository`.

- [x] **Step 1: Write failing aggregate tests**

Test exact six-node uniqueness/order, lowercase SHA-256 hashes, duplicate competitor/result IDs, `lockedAt` lifecycle consistency, revision monotonicity, immutable cloning, and rejection of a locked revision with blockers.

```ts
expect(() =>
  createOperationPlanRevision({
    ...validInput,
    blockers: [{ code: 'SOURCE_STALE' }],
    status: 'locked',
  }),
).toThrow(/blocker/i);
expect(lockOperationPlanRevision(draft, createUuidV7(), new Date())).toMatchObject({
  revisionNo: draft.revisionNo + 1,
  status: 'locked',
  sources: draft.sources,
});
```

- [x] **Step 2: Run the focused domain test and confirm RED**

Run: `pnpm --filter @eaw/domain exec vitest run src/operation-plans/operation-plan.test.ts`

Expected: FAIL because the operation-plan modules do not exist.

- [x] **Step 3: Implement strict immutable constructors and repository port**

Use readonly discriminated blocker codes, clone/freeze nested references, reject extra/malformed source combinations, and require node keys in canonical workflow order. `lockOperationPlanRevision` must preserve `lineageId`, `productId`, `platformId`, `sources`, and `sourceHash` exactly while incrementing the revision.

- [x] **Step 4: Run domain test/typecheck/lint/build**

Run: `pnpm --filter @eaw/domain test && pnpm --filter @eaw/domain typecheck && pnpm --filter @eaw/domain lint && pnpm --filter @eaw/domain build`

Expected: all domain gates pass.

- [x] **Step 5: Commit and push**

```bash
git add packages/domain/src
git commit -m "feat: define traceable operation plans"
git push origin codex/phase-0
```

### Task 2: SQLite append-only repository

**Files:**

- Create: `migrations/0015_add-operation-plans.sql`
- Create: `packages/database/src/repositories/operation-plan-repository.ts`
- Create: `packages/database/src/repositories/operation-plan-repository.integration.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

- Consumes: `OperationPlanRepository` and validated domain revisions.
- Produces: `SqliteOperationPlanRepository` with `append`, `findById`, `latest`, and `list`.

- [ ] **Step 1: Write failing real-SQLite persistence tests**

Append a draft and locked revision, reopen the database, and assert exact nested sources, newest-first history, lineage revision sequencing, and source-hash preservation. Execute direct SQL update/delete against both plan and reference tables and require immutable-trigger failures.

- [ ] **Step 2: Run focused database tests and confirm RED**

Run: `pnpm --filter @eaw/database exec vitest run --fileParallelism=false src/repositories/operation-plan-repository.integration.test.ts`

Expected: FAIL because migration/repository do not exist.

- [ ] **Step 3: Implement STRICT schema and transactional repository**

Store plan headers separately from workflow-node, competitor, pricing, and promotion references. Use composite foreign keys for product identity, unique `(lineage_id, revision_no)`, one pricing reference per revision, stable node order, and update/delete rejection triggers. Parse every row and reconstruct through the domain constructor.

- [ ] **Step 4: Run migration/database gates**

Run: `pnpm --filter @eaw/database test && pnpm --filter @eaw/database typecheck && pnpm --filter @eaw/database lint && pnpm --filter @eaw/database build`

Expected: all prior migrations and new repository tests pass.

- [ ] **Step 5: Commit and push**

```bash
git add migrations/0015_add-operation-plans.sql packages/database
git commit -m "feat: persist immutable operation plans"
git push origin codex/phase-0
```

### Task 3: Aggregation, blocker analysis, and locking application

**Files:**

- Create: `packages/application/src/operation-plans/index.ts`
- Create: `packages/application/src/operation-plans/operation-plans.test.ts`
- Create: `packages/application/src/operation-plans/source-resolver.ts`
- Create: `packages/application/src/operation-plans/source-resolver.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/package.json`

**Interfaces:**

- Consumes: product, workflow, competitor, strategy, title, creative, detail, pricing, promotion, and operation-plan repositories.
- Produces: `OperationPlansApplication` with `createDraft`, `list`, `get`, and `lock`.

```ts
interface CreateOperationPlanInput {
  workflowRunId: string;
  pricingRecordId: string;
  promotionScenarioId?: string;
  promotionResultIds?: readonly string[];
}
interface OperationPlansApplication {
  createDraft(productId: string, input: CreateOperationPlanInput): Promise<OperationPlanView>;
  list(productId: string): Promise<readonly OperationPlanView[]>;
  get(planId: string): Promise<OperationPlanView>;
  lock(planId: string, expectedRevisionNo: number): Promise<OperationPlanView>;
}
```

- [ ] **Step 1: Write failing valid aggregation and ownership tests**

Build memory repositories with one completed six-node workflow and exact financial records. Assert `createDraft` stores all source IDs/revisions/hashes and makes zero provider calls. Reject archived products, cross-product workflow/assets/financials, cross-platform sources, missing nodes/assets, and mismatched output types.

- [ ] **Step 2: Write failing blocker and lock tests**

Assert drafts expose stable blocker codes for `SOURCE_STALE`, `SOURCE_NEEDS_REVIEW`, `CONTENT_UNLOCKED`, `FINANCIAL_INPUT_MISMATCH`, and `RULE_SNAPSHOT_MISMATCH`. Lock only with zero blockers and current expected revision; re-read every exact source before append and reject concurrent/stale requests without writing.

- [ ] **Step 3: Run focused application tests and confirm RED**

Run: `pnpm --filter @eaw/application exec vitest run src/operation-plans`

Expected: FAIL because operation-plan application modules do not exist.

- [ ] **Step 4: Implement deterministic source resolver and application facade**

Resolve the workflow by ID, map each persisted output to its owning repository by `assetType`, compare exact IDs/revisions/product/platform, collect competitor snapshots from the workflow dependency context, and validate financial compatibility. Compute canonical `sourceHash`; list/get must re-resolve blockers for display but never mutate historical sources.

- [ ] **Step 5: Run application gates**

Run: `pnpm --filter @eaw/application test && pnpm --filter @eaw/application typecheck && pnpm --filter @eaw/application lint && pnpm --filter @eaw/application build`

Expected: all application gates pass with no AI generation call.

- [ ] **Step 6: Commit and push**

```bash
git add packages/application
git commit -m "feat: aggregate exact operation plan sources"
git push origin codex/phase-0
```

### Task 4: Strict HTTP contracts, routes, and production composition

**Files:**

- Create: `packages/contracts/src/operation-plans.ts`
- Create: `packages/contracts/src/operation-plans.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/server/src/routes/operation-plans.ts`
- Create: `apps/server/src/routes/operation-plans.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/context.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/server/src/runtime.integration.test.ts`
- Modify: `apps/server/scripts/prepare-internal.mjs`

**Interfaces:**

- Consumes: `OperationPlansApplication`.
- Produces: strict draft/list/get/lock JSON endpoints and production SQLite composition.

- [ ] **Step 1: Write failing contract and route tests**

Cover UUIDv7, positive expected revision, exact input shape, unknown-field rejection, 201 draft, newest-first list, resolved GET trace, 201 locked revision, ownership 404, validation 400, conflict 409, and capability 503 mappings.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @eaw/contracts exec vitest run src/operation-plans.test.ts && pnpm --filter @eaw/server exec vitest run --fileParallelism=false src/routes/operation-plans.test.ts src/runtime.integration.test.ts`

Expected: FAIL because contracts/routes/composition are missing.

- [ ] **Step 3: Implement routes and composition**

Parse request params/body through strict Zod schemas, serialize dates at the route boundary, register routes in `buildApp`, and construct the repository/resolver/application in `createProductionApp`. Add a restart integration proving locked history retains identical exact references and causes zero provider calls.

- [ ] **Step 4: Run contracts/server gates**

Run: `pnpm --filter @eaw/contracts test && pnpm --filter @eaw/server test && pnpm --filter @eaw/server typecheck && pnpm --filter @eaw/server lint && pnpm --filter @eaw/server build`

Expected: all contract/server gates pass.

- [ ] **Step 5: Commit and push**

```bash
git add packages/contracts apps/server
git commit -m "feat: expose operation plan APIs"
git push origin codex/phase-0
```

### Task 5: Traceable plan UI and release acceptance

**Files:**

- Create: `apps/web/src/features/operation-plans/api.ts`
- Create: `apps/web/src/features/operation-plans/operation-plan-panel.tsx`
- Create: `apps/web/src/features/operation-plans/operation-plan-panel.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/routing/workbench-router.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `tests/e2e/phase-11-operation-plan.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:**

- Consumes: operation-plan JSON endpoints plus existing workflow/pricing/promotion history.
- Produces: explicit draft creation, source trace, blocker resolution links, lock action, and immutable history on `/products/:productId/plans`.

- [ ] **Step 1: Write failing React tests**

Assert exact source IDs/revisions/hashes render, blockers are announced accessibly, lock stays disabled with blockers, stale late product/platform results are discarded, explicit create/lock sends exact revision guards, history is newest first, and no automatic create/lock occurs.

- [ ] **Step 2: Run focused web tests and confirm RED**

Run: `pnpm --filter @eaw/web exec vitest run src/features/operation-plans`

Expected: FAIL because the feature does not exist.

- [ ] **Step 3: Implement browser API, panel, routing, and styles**

Keep workflow progress above the plan panel. Use semantic lists/details for source trace, links to owning workspaces for blockers, buttons for explicit mutations, `aria-live` status, and generation tokens so late responses cannot overwrite another product/platform.

- [ ] **Step 4: Add deterministic Playwright acceptance**

Extend the fake-provider fixture to build the content workflow, seed exact pricing, create a draft, resolve/lock required content, lock the plan, reload, and verify unchanged source IDs plus zero extra provider-log lines during draft/lock/history operations.

- [ ] **Step 5: Run every release gate**

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

Expected: every gate passes under Node.js 24.19.0 / pnpm 11.22.0 with no real AI request.

- [ ] **Step 6: Update records, commit, and push**

Mark Task 25 complete and Task 26 in progress. Record exact test counts, immutable-reference/restart evidence, blocker behavior, and provider call count.

```bash
git add apps/web tests/e2e docs/superpowers task_plan.md findings.md progress.md
git commit -m "feat: aggregate traceable operation plans"
git push origin codex/phase-0
```
