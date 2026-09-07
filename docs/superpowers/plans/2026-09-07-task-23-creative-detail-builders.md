# Task 23 Creative and Detail Builders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build auditable five-image creative plans and ordered detail-page architectures with evidence, bilingual prompts, negative prompts, immutable revisions, item locks, one-item regeneration, stable reorder, and stale reasons without generating images.

**Architecture:** Keep creative-plan and detail-page revisions as separate strongly typed aggregates and SQLite histories, while sharing the existing facts, selling-point, title, prompt, generation-log, and dependency-hash infrastructure. Every mutation appends a complete immutable revision; item regeneration merges one validated AI item into the previous plan, locked items cannot be replaced, reorder changes only explicit order values, and stale evaluation never mutates stored content.

**Tech Stack:** TypeScript 6, Zod, Fastify, React 19, SQLite/Drizzle repositories, Vitest, existing prompt compiler and DeepSeek-compatible AI pipeline.

**Spec:** `docs/superpowers/specs/2026-08-19-ecommerce-ai-workbench-design.md` and Task 23 in `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`

## Global Constraints

- Use Node.js `24.19.0` and pnpm `11.22.0`; do not add dependencies.
- v0.1 produces structured plans and prompts only; it must not generate or download images.
- A creative plan contains exactly five ordered items with stable item IDs.
- Every creative item and detail section carries evidence references; unsupported references produce `needs_review`.
- Chinese prompt, English prompt, Chinese negative prompt, and English negative prompt are required for every creative item.
- Generated, regenerated, locked, edited, and reordered states append immutable revisions; SQLite update/delete triggers protect history.
- Locked creative items survive plan regeneration and cannot be targeted by one-item regeneration.
- Stale evaluation reports exact changed dependency keys and never overwrites a stored or locked revision.
- Automated AI tests use a fake provider and never make a paid request.

---

### Task 1: Creative and detail domain contracts

**Files:**

- Create: `packages/domain/src/content-assets/creative-plan.ts`
- Create: `packages/domain/src/content-assets/detail-page.ts`
- Create: `packages/domain/src/content-assets/creative-detail-repository.ts`
- Create: `packages/domain/src/content-assets/creative-plan.test.ts`
- Create: `packages/domain/src/content-assets/detail-page.test.ts`
- Modify: `packages/domain/src/content-assets/index.ts`

**Interfaces:**

- Consumes: `UuidV7`, `PlatformId`, `StrategyEvidenceReference`.
- Produces: `CreativeItem`, `CreativePlanRevision`, `DetailPageSection`, `DetailPageRevision`, `CreativePlanRepository`, `DetailPageRepository`, `createCreativePlanRevision`, `createDetailPageRevision`, and `evaluateDependencyStaleness`.

- [x] **Step 1: Write failing creative aggregate tests**

```ts
it('requires five stable ordered items and preserves locked values', () => {
  const revision = createCreativePlanRevision(validCreativeRevision());
  expect(revision.items.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5]);
  expect(Object.isFrozen(revision.items)).toBe(true);
  expect(() => createCreativePlanRevision({ ...validCreativeRevision(), items: [] })).toThrow();
});
```

- [x] **Step 2: Write failing detail reorder and stale tests**

```ts
it('keeps stable section ids during reorder and explains stale dependencies', () => {
  const reordered = reorderDetailSections(revision, [sectionB.id, sectionA.id]);
  expect(reordered.sections.map(({ id }) => id)).toEqual([sectionB.id, sectionA.id]);
  expect(evaluateDependencyStaleness(revision.dependencyHashes, currentHashes).reasons).toContain(
    'titles_changed',
  );
});
```

- [x] **Step 3: Run the focused domain tests and confirm RED**

Run: `pnpm --filter @eaw/domain exec vitest run src/content-assets/creative-plan.test.ts src/content-assets/detail-page.test.ts`

Expected: FAIL because the creative/detail types and constructors do not exist.

- [x] **Step 4: Implement strict immutable aggregates**

Implement five unique items with orders `1..5`, non-empty bilingual and negative prompts, unique section/item IDs, bounded text/array sizes, validated 64-character dependency hashes, explicit origins, lock invariants, deep freezing, stable reorder functions, and repository append/latest/list ports.

- [x] **Step 5: Run the focused domain tests and record the green checkpoint**

Run: `pnpm --filter @eaw/domain test`

Expected: all domain tests pass.

---

### Task 2: Structured AI outputs and evidence guards

**Files:**

- Create: `packages/ai-engine/src/creative-detail.ts`
- Create: `packages/ai-engine/src/creative-detail.test.ts`
- Create: `default-prompts/creative-plan.v1.json`
- Create: `default-prompts/creative-item.v1.json`
- Create: `default-prompts/detail-page.v1.json`
- Modify: `packages/ai-engine/src/index.ts`
- Modify: `packages/prompt-engine/src/default-prompts.test.ts`
- Modify: `apps/server/src/strategy-prompts.ts`

**Interfaces:**

- Consumes: `generateAndLog`, current-product confirmed fact IDs, exact selling-point/title revision IDs, and three active prompt templates.
- Produces: `CreativePlanOutputSchema`, `CreativeItemOutputSchema`, `DetailPageOutputSchema`, `reviewCreativePlan`, `reviewCreativeItem`, and `reviewDetailPage`.

- [x] **Step 1: Write failing schema and guard tests**

```ts
it('rejects non-five-image plans and reviews cross-product evidence', () => {
  expect(() => CreativePlanOutputSchema.parse({ productId, items: [] })).toThrow();
  const reviewed = reviewCreativePlan(validOutputWithOtherProductRef(), context);
  expect(reviewed.status).toBe('needs_review');
  expect(reviewed.issues).toContain('unsupported_evidence');
});
```

- [x] **Step 2: Write failing bilingual and one-item output tests**

```ts
it('requires bilingual prompts and returns exactly the requested stable item id', () => {
  expect(() => CreativeItemOutputSchema.parse(outputWithoutEnglishPrompt)).toThrow();
  expect(CreativeItemOutputSchema.parse(validItemOutput).item.id).toBe(requestedItemId);
});
```

- [x] **Step 3: Run focused AI and prompt tests and confirm RED**

Run: `pnpm --filter @eaw/ai-engine exec vitest run src/creative-detail.test.ts`

Expected: FAIL because schemas and review functions do not exist.

- [x] **Step 4: Implement schemas, evidence review, and three prompts**

Permit only current-product `product_fact` references and exact current upstream revision references supplied by the application context. Require exactly five creative variants, stable requested item ID for one-item output, ordered unique detail sections, explicit `reviewTerms`, and strict JSON with no additional fields. Install `creative_plan`, `creative_item`, and `detail_page` templates at startup.

- [x] **Step 5: Validate and run focused tests**

Run: `pnpm --filter @eaw/ai-engine test`

Run: `pnpm validate:prompts`

Expected: all AI tests pass and all seven default prompts validate.

---

### Task 3: Immutable persistence and application use cases

**Files:**

- Create: `migrations/0013_add-creative-detail-assets.sql`
- Create: `packages/database/src/repositories/creative-plan-repository.ts`
- Create: `packages/database/src/repositories/detail-page-repository.ts`
- Create: `packages/database/src/repositories/creative-detail-repository.integration.test.ts`
- Create: `packages/application/src/content-builders/index.ts`
- Create: `packages/application/src/content-builders/content-builders.test.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

- Consumes: product/fact/strategy/title/platform repositories, active prompts, AI logs, secrets, and the domain repositories from Task 1.
- Produces: `ContentBuildersApplication` with `generateCreative`, `regenerateCreativeItem`, `lockCreativeItem`, `reorderCreative`, `listCreative`, `generateDetail`, `lockDetailSection`, `reorderDetail`, and `listDetail`.

- [x] **Step 1: Write failing repository immutability tests**

```ts
it('appends regeneration and reorder revisions without mutating history', async () => {
  const generated = await creative.append(generatedInput);
  const regenerated = await creative.append({
    ...regeneratedInput,
    lineageId: generated.lineageId,
  });
  expect(regenerated.revisionNo).toBe(2);
  expect((await creative.list(productId, platformId))[1]).toEqual(generated);
  expect(() =>
    sqlite.prepare('UPDATE creative_plan_revisions SET status = ?').run('verified'),
  ).toThrow(/immutable/i);
});
```

- [x] **Step 2: Write failing application behavior tests**

```ts
it('regenerates only the requested unlocked item and preserves locked siblings', async () => {
  const next = await app.regenerateCreativeItem(productId, platformId, targetId);
  expect(next.revision.items.find(({ id }) => id === lockedId)).toEqual(lockedItem);
  expect(next.revision.items.find(({ id }) => id === targetId)?.headline).toBe('新主图文案');
});
```

Also assert that targeting a locked item returns `CONFLICT`, reorder requires every ID exactly once, detail reorder preserves section payloads, and changed facts/titles/platform rules/prompts produce explicit stale reasons.

- [x] **Step 3: Run database/application focused tests and confirm RED**

Run: `pnpm --filter @eaw/database exec vitest run --fileParallelism=false src/repositories/creative-detail-repository.integration.test.ts`

Run: `pnpm --filter @eaw/application exec vitest run src/content-builders/content-builders.test.ts`

Expected: FAIL because tables, repositories, and use cases do not exist.

- [x] **Step 4: Implement migration, repositories, context collection, and append-only use cases**

Use separate `creative_plan_revisions` and `detail_page_revisions` STRICT tables with product/platform revision uniqueness, generation foreign keys, supersedes foreign keys, and update/delete denial triggers. Compile only confirmed policy-eligible non-sensitive facts plus current verified selling points and latest titles; dependency hashes use `facts`, `selling_points`, `titles`, `platform_rules`, and `prompt`.

- [x] **Step 5: Run package tests and record the green checkpoint**

Run: `pnpm --filter @eaw/database test`

Run: `pnpm --filter @eaw/application test`

Expected: both packages pass.

---

### Task 4: Contracts, routes, production composition, and restart persistence

**Files:**

- Create: `packages/contracts/src/content-builders.ts`
- Create: `apps/server/src/routes/content-builders.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/server/src/context.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/server/src/runtime.integration.test.ts`

**Interfaces:**

- Consumes: `ContentBuildersApplication` from Task 3.
- Produces: strict `/api/v1/products/:productId/creative` and `/api/v1/products/:productId/detail` list/generate/lock/reorder/regenerate endpoints.

- [x] **Step 1: Write failing route and runtime tests**

```ts
const generated = await app.inject({
  method: 'POST',
  url: `/api/v1/products/${productId}/creative/generate?platformId=pinduoduo`,
});
expect(generated.statusCode).toBe(200);
expect(generated.json().revision.items).toHaveLength(5);
```

Then restart the production app against the same temporary workspace and assert both creative and detail histories remain readable with the same IDs and revision numbers.

- [x] **Step 2: Run server tests and confirm RED**

Run: `pnpm --filter @eaw/server test`

Expected: FAIL because contracts/routes/composition are missing.

- [x] **Step 3: Implement strict request/response schemas and routes**

Reject malformed UUIDs, unsupported platforms, duplicate/missing reorder IDs, locked regeneration, and request bodies with unknown keys. Serialize dates only at the route boundary and preserve safe domain error responses.

- [x] **Step 4: Wire production repositories and fake-provider restart coverage**

Install all three prompts at startup, reuse the existing secret store and AI log repository, and extend the fake provider to emit strict creative-plan, creative-item, and detail-page JSON without a network call.

- [x] **Step 5: Run server tests and record the green checkpoint**

Run: `pnpm --filter @eaw/server test`

Expected: all server tests pass.

---

### Task 5: Creative and detail workbench UI

**Files:**

- Create: `apps/web/src/features/content-builders/api.ts`
- Create: `apps/web/src/features/content-builders/creative-builder.tsx`
- Create: `apps/web/src/features/content-builders/detail-builder.tsx`
- Create: `apps/web/src/features/content-builders/content-builders.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/routing/workbench-router.tsx`
- Modify: `apps/web/src/routing/workbench-router.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**

- Consumes: public JSON endpoints from Task 4.
- Produces: real product routes for “视觉” and “详情页” with generation, history, stale reasons, item/section locks, one-item regeneration, and accessible reorder controls.

- [x] **Step 1: Write failing UI tests**

```tsx
it('renders five creative cards and never exposes image generation', async () => {
  render(<CreativeBuilder api={api} productId="product" />);
  await click(screen.getByRole('button', { name: '生成五图方案' }));
  expect(screen.getAllByTestId('creative-item')).toHaveLength(5);
  expect(screen.queryByText('生成图片')).not.toBeInTheDocument();
});
```

Also test disabling regeneration for locked items, moving a detail section with buttons while keeping stable IDs, and displaying stale/review reasons.

- [x] **Step 2: Run web tests and confirm RED**

Run: `pnpm --filter @eaw/web exec vitest run src/features/content-builders/content-builders.test.tsx`

Expected: FAIL because the builders do not exist.

- [x] **Step 3: Implement API client and accessible builders**

Use labeled buttons for move up/down rather than drag-only interaction. Show Chinese/English prompts, negative prompts, evidence count, review terms, lock state, exact revision, origin, and stale reasons. Remove both Phase 9 placeholder routes.

- [x] **Step 4: Run focused and full verification**

Run: `pnpm --filter @eaw/web test`

Run: `node scripts/check-versions.mjs`

Run: `pnpm install --frozen-lockfile`

Run: `pnpm typecheck`

Run: `pnpm lint`

Run: `pnpm test`

Run: `pnpm build`

Run: `pnpm validate:prompts`

Run: `pnpm validate:rule-packs`

Run: `pnpm test:e2e`

Expected: every gate passes; fake providers are the only AI used.

- [x] **Step 5: Update persistent records and create the Task 23 commit**

Mark Task 23 complete and Task 24 in progress in `task_plan.md` and the master plan. Append exact evidence to `progress.md` and decisions to `findings.md`.

Commit: `feat: add structured creative and detail builders`

Push: `git push origin codex/phase-0`
