# Resumable Persisted Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SQLite-persisted, explicitly resumable product-content DAG with idempotent node reuse, restart interruption, cancellation, durable SSE events, and an accessible progress UI.

**Architecture:** A new `@eaw/workflow-engine` package owns inert workflow definitions, state transitions, repository ports, and the single-process runner. SQLite is the source of truth for runs, nodes, attempts, and events; the application layer supplies content-node handlers, Fastify exposes strict HTTP/SSE adapters, and React always reconciles through GET before subscribing.

**Tech Stack:** TypeScript 6, Node.js 24.19.0, pnpm 11.22.0, SQLite, Zod, Fastify 5, React 19, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-07-resumable-workflow-design.md`

## Global Constraints

- Do not add external dependencies; use existing workspace libraries and Node APIs.
- Never automatically resume interrupted work or consume AI credits during startup.
- `(workflowRunId, nodeKey, dependencyHash)` is the idempotency identity.
- Completed, locked, and needs-review nodes with unchanged hashes are reused without calling `execute`.
- All mutations use expected run revisions; stale callers receive `CONFLICT`.
- Attempts and events are append-only; persisted errors never contain provider bodies, secrets, or stacks.
- SSE is a projection of durable events; clients GET state before connecting or reconnecting.
- Automated tests use fake handlers/providers only.

---

### Task 1: Workflow engine definitions, states, and runner

**Files:**

- Create: `packages/workflow-engine/package.json`
- Create: `packages/workflow-engine/tsconfig.json`
- Create: `packages/workflow-engine/src/types.ts`
- Create: `packages/workflow-engine/src/definition.ts`
- Create: `packages/workflow-engine/src/state.ts`
- Create: `packages/workflow-engine/src/idempotency.ts`
- Create: `packages/workflow-engine/src/repository.ts`
- Create: `packages/workflow-engine/src/runner.ts`
- Create: `packages/workflow-engine/src/index.ts`
- Create: `packages/workflow-engine/src/definition.test.ts`
- Create: `packages/workflow-engine/src/runner.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `UuidV7`, `PlatformId`, and `DomainError` from `@eaw/domain`.
- Produces: `WorkflowDefinition`, `WorkflowRun`, `WorkflowNodeState`, `WorkflowRepository`, `WorkflowNodeHandler`, `createWorkflowDefinition`, `contentWorkflowDefinition`, `createIdempotencyKey`, and `createWorkflowRunner`.

- [x] **Step 1: Write failing definition and state tests**

```ts
it('returns a stable six-node order and rejects cycles', () => {
  expect(contentWorkflowDefinition.nodes.map(({ key }) => key)).toEqual([
    'competitor_analysis',
    'market_insight',
    'selling_points',
    'titles',
    'creative',
    'detail_page',
  ]);
  expect(() =>
    createWorkflowDefinition({
      definitionId: 'cycle',
      version: '1.0.0',
      nodes: [
        { key: 'a', taskType: 'a', dependsOn: ['b'], order: 1 },
        { key: 'b', taskType: 'b', dependsOn: ['a'], order: 2 },
      ],
    }),
  ).toThrow(/cycle/u);
});
```

Also assert rejection of empty definitions, duplicate keys/orders, unknown/self dependencies, invalid identifiers, and more than 50 nodes. Test that only declared transitions are accepted and every transition increments the run revision.

- [x] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @eaw/workflow-engine exec vitest run src/definition.test.ts src/runner.test.ts`

Expected: FAIL because the package and modules do not exist.

- [x] **Step 3: Implement inert definitions and exact state contracts**

Define the exact public states from the spec. `createWorkflowDefinition` must clone/freeze input, validate the complete graph, and return nodes in stable `order`. Implement `createIdempotencyKey(runId, nodeKey, dependencyHash)` as canonical text after validating a lowercase 64-character SHA-256 hash.

- [x] **Step 4: Implement the repository-driven serial runner**

```ts
export interface WorkflowNodeHandler {
  inspect(input: WorkflowNodeInput): Promise<NodeInspection>;
  execute(input: WorkflowNodeInput & { readonly signal: AbortSignal }): Promise<WorkflowNodeResult>;
}

export interface WorkflowRunner {
  run(runId: UuidV7, expectedRevision: number): Promise<WorkflowRun>;
  resume(runId: UuidV7, expectedRevision: number): Promise<WorkflowRun>;
  retryNode(runId: UuidV7, nodeKey: string, expectedRevision: number): Promise<WorkflowRun>;
  cancel(runId: UuidV7, expectedRevision: number): Promise<WorkflowRun>;
}
```

The runner must claim one node transactionally, persist `running` before `execute`, stop on the first failure, reuse unchanged successful nodes, never replace locked outputs, observe cancellation at persistence boundaries, and reject concurrent stale revisions.

- [x] **Step 5: Prove canonical failure and idempotent resume in memory**

Use six counting fake handlers. Fail `creative` once after the first four handlers complete; resume and assert the first four counts remain `1`, creative becomes `2`, detail becomes `1`, and a duplicate resume with the old revision returns `CONFLICT`.

- [x] **Step 6: Run package test/typecheck/lint/build**

Run: `pnpm --filter @eaw/workflow-engine test && pnpm --filter @eaw/workflow-engine typecheck && pnpm --filter @eaw/workflow-engine lint && pnpm --filter @eaw/workflow-engine build`

Expected: all workflow-engine gates pass.

---

### Task 2: SQLite repository, recovery, and durable events

**Files:**

- Create: `migrations/0014_add-workflows.sql`
- Create: `packages/database/src/repositories/workflow-values.ts`
- Create: `packages/database/src/repositories/workflow-repository.ts`
- Create: `packages/database/src/repositories/workflow-repository.integration.test.ts`
- Create: `packages/database/src/repositories/workflow-recovery.ts`
- Create: `packages/database/src/repositories/workflow-recovery.integration.test.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/database/package.json`

**Interfaces:**

- Consumes: workflow-engine value types and the existing `OpenDatabase` wrapper.
- Produces: `SqliteWorkflowRepository` and `recoverInterruptedWorkflows(database, now)`.

- [ ] **Step 1: Write failing real-SQLite repository tests**

Create one run and assert six nodes plus `workflow_created` event are committed atomically. Claim and complete a node, then assert attempt/event history, monotonically increasing event sequences, exact output references, and revision compare-and-swap behavior.

```ts
expect(() =>
  database.sqlite
    .prepare('UPDATE workflow_events SET event_type = ? WHERE workflow_run_id = ?')
    .run('tampered', run.id),
).toThrow(/immutable/u);
```

- [ ] **Step 2: Write failing restart recovery tests**

Persist a running run/node, close the database, reopen it, invoke recovery, and assert the run is `interrupted`, the node is `failed` with `WORKFLOW_INTERRUPTED`, one durable interruption event exists, and handler call count remains zero.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `pnpm --filter @eaw/database exec vitest run --fileParallelism=false src/repositories/workflow-repository.integration.test.ts src/repositories/workflow-recovery.integration.test.ts`

Expected: FAIL because migration and repositories do not exist.

- [ ] **Step 4: Implement migration and transactional repository**

Create STRICT `workflow_runs`, `workflow_nodes`, `workflow_attempts`, and `workflow_events` tables. Add foreign keys, unique `(run_id,node_key)`, `(run_id,attempt_no)`, `(run_id,event_sequence)`, status checks, JSON text fields, indices, and immutable update/delete triggers for attempts/events. Repository write methods must use `BEGIN IMMEDIATE`, expected revision predicates, and rollback the entire transition/event/attempt unit on failure.

- [ ] **Step 5: Implement fail-closed reads and startup recovery**

Parse every JSON field, validate stored definition snapshots and state combinations through workflow-engine constructors, verify contiguous event sequences, and reject malformed output references. Recovery performs one transaction and never accepts or calls handlers.

- [ ] **Step 6: Run database and migration gates**

Run: `pnpm --filter @eaw/database test && pnpm --filter @eaw/database typecheck && pnpm --filter @eaw/database lint && pnpm --filter @eaw/database build`

Expected: all database tests pass, including every prior migration.

---

### Task 3: Workflow application and content-node handlers

**Files:**

- Create: `packages/application/src/workflows/index.ts`
- Create: `packages/application/src/workflows/content-workflow-handlers.ts`
- Create: `packages/application/src/workflows/workflows.test.ts`
- Create: `packages/application/src/workflows/content-workflow-handlers.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/package.json`

**Interfaces:**

- Consumes: product/fact/competitor/strategy/title/creative/detail repositories, existing strategy/title/content-builder applications, `WorkflowRepository`, and `WorkflowRunner`.
- Produces: `WorkflowsApplication` with `preflight`, `start`, `list`, `get`, `resume`, `retryNode`, `cancel`, `listEvents`, and `subscribe`; plus `createContentWorkflowHandlers`.

- [ ] **Step 1: Write failing preflight and ownership tests**

Assert preflight performs no generation calls, reports missing competitor inputs, returns stable node order and dependency hashes, rejects archived/cross-product access, and never creates a run.

- [ ] **Step 2: Write failing content handler tests**

Each handler must hash only its exact current inputs and return an exact output reference `{ assetType, assetId, revisionNo }`. Verify strategy handlers call the matching kind, titles use the requested platform, creative/detail call their existing applications, and all six fake calls preserve product/platform identity.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `pnpm --filter @eaw/application exec vitest run src/workflows`

Expected: FAIL because workflow application modules do not exist.

- [ ] **Step 4: Implement the application facade and safe event publisher**

Validate product ownership before every public operation. `start` creates a `not_started` run and schedules runner work with a caught promise so Fastify never receives an unhandled rejection. Keep one in-process subscriber set per run; publish only after durable repository append and always allow event replay from `afterSequence`.

- [ ] **Step 5: Implement deterministic handler inspection**

Use canonical JSON and SHA-256 over confirmed policy-eligible non-sensitive facts, current competitor snapshots, precise upstream asset IDs/revisions, platform profile/rule identity, and active prompt hashes. `inspect` returns existing exact output only when it belongs to the same product/platform and matches the dependency hash.

- [ ] **Step 6: Run application package gates**

Run: `pnpm --filter @eaw/application test && pnpm --filter @eaw/application typecheck && pnpm --filter @eaw/application lint && pnpm --filter @eaw/application build`

Expected: all application tests pass.

---

### Task 4: Strict contracts, Fastify routes, SSE, and production restart

**Files:**

- Create: `packages/contracts/src/workflows.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/server/src/routes/workflows.ts`
- Create: `apps/server/src/routes/workflows.test.ts`
- Create: `apps/server/src/routes/workflow-events.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/context.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/server/src/runtime.integration.test.ts`
- Modify: `apps/server/scripts/prepare-internal.mjs`
- Modify: `apps/server/package.json`

**Interfaces:**

- Consumes: `WorkflowsApplication`.
- Produces: the eight HTTP/SSE endpoints specified in the design.

- [ ] **Step 1: Write failing contract and route tests**

Test strict UUIDv7, platform, definition ID, node key, non-negative event sequence, positive expected revision, unknown-field rejection, ownership, 404/409/503 mapping, and successful preflight/start/get/list/resume/retry/cancel flows.

- [ ] **Step 2: Write failing SSE replay and live-event tests**

Assert `content-type: text/event-stream`, `cache-control: no-cache`, durable event IDs, replay only after `afterSequence`, live delivery after subscription, JSON data, and connection cleanup. Reconnect by GET state followed by SSE and prove no sequence gap or duplicate.

- [ ] **Step 3: Run server tests and confirm RED**

Run: `pnpm --filter @eaw/server exec vitest run --fileParallelism=false src/routes/workflows.test.ts src/routes/workflow-events.test.ts src/runtime.integration.test.ts`

Expected: FAIL because contracts/routes/composition are missing.

- [ ] **Step 4: Implement contracts, routes, and SSE framing**

Serialize dates at the route boundary. Write SSE frames as `id: <sequence>\nevent: <type>\ndata: <single-line-json>\n\n`; send a comment heartbeat without creating a durable event; unregister listeners on socket close. State GET remains authoritative.

- [ ] **Step 5: Wire production and prove canonical restart**

Construct the repository, run startup recovery before `buildApp`, inject existing content applications into handlers, and inject runner/application into context. The production integration test must fail creative once after four successful handlers, close/reopen the same workspace, assert no calls occur during startup, explicitly resume, and assert call deltas `0,0,0,0,1,1`.

- [ ] **Step 6: Run contracts/server gates**

Run: `pnpm --filter @eaw/contracts test && pnpm --filter @eaw/server test`

Expected: all contract and server tests pass.

---

### Task 5: Workflow progress UI and full acceptance

**Files:**

- Create: `apps/web/src/features/workflows/api.ts`
- Create: `apps/web/src/features/workflows/workflow-progress.tsx`
- Create: `apps/web/src/features/workflows/workflow-progress.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/routing/workbench-router.tsx`
- Modify: `apps/web/src/routing/workbench-router.test.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `tests/e2e/phase-10-workflow.spec.ts`
- Modify: `task_plan.md`
- Modify: `progress.md`
- Modify: `findings.md`
- Modify: `docs/superpowers/plans/2026-08-31-workbench-completion-master-plan.md`

**Interfaces:**

- Consumes: workflow JSON endpoints and durable SSE stream.
- Produces: a real product workflow page at `/products/:productId/plans` with preflight, start, progress, resume, retry, cancel, and reconnect behavior.

- [ ] **Step 1: Write failing React tests**

Render six labeled nodes and assert text/`aria-live` states. Simulate failure, resume, retry, cancellation, platform switch, stale late responses, and SSE disconnect; assert reconnect calls state GET before opening a new event stream and never starts/resumes automatically.

- [ ] **Step 2: Run focused web tests and confirm RED**

Run: `pnpm --filter @eaw/web exec vitest run src/features/workflows/workflow-progress.test.tsx src/routing/workbench-router.test.tsx`

Expected: FAIL because the workflow UI/API do not exist.

- [ ] **Step 3: Implement accessible UI and guarded browser client**

Use buttons rather than implicit background actions. Track request generation plus run ID/revision so late state and SSE messages cannot overwrite the selected product/platform. Show exact output revision, review/stale reason, safe error, interrupted banner, and explicit resume/retry/cancel controls.

- [ ] **Step 4: Add the Phase 10 Playwright path**

Use a deterministic fake provider to create a product and required competitor input, start the workflow, observe four completed nodes plus a creative failure, restart/reload, explicitly resume, and verify all six nodes complete without duplicate completed-node generation logs.

- [ ] **Step 5: Run every release gate**

Run with Node.js 24.19.0 and pnpm 11.22.0:

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

Expected: every gate passes and no real AI request is made.

- [ ] **Step 6: Update records, commit, and push**

Mark Task 24 complete and Task 25 in progress. Record exact test counts, restart/idempotency evidence, and decisions.

Commit: `feat: add resumable persisted generation workflow`

Push: `git push origin codex/phase-0`
