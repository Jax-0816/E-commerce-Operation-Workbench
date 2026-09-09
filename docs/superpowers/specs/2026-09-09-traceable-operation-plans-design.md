# Traceable Operation Plans Design

**Status:** approved by the existing Task 25 master-plan scope and the user's instruction to continue inline.

## Goal

Create a deterministic, immutable operation-plan aggregate that turns one completed product workflow plus exact financial results into a reviewable and lockable execution record. The aggregate never asks AI to summarize existing outputs and never copies a mutable "latest" pointer without preserving the selected ID and revision.

## Aggregate

`OperationPlanRevision` contains:

- immutable identity: `id`, `lineageId`, `productId`, `platformId`, `revisionNo`, `createdAt`;
- lifecycle: `draft | locked`, with `lockedAt` only on locked revisions;
- exact workflow reference: `workflowRunId` and `workflowRunRevision`;
- exact six-node output references: `nodeKey`, `assetType`, `assetId`, `revisionNo`, and the workflow node dependency hash;
- exact competitor snapshot IDs used by the competitor-analysis dependency;
- exact pricing record ID and its cost-profile revision;
- optional exact promotion scenario/result IDs and immutable rule snapshot hash;
- a canonical `sourceHash` over every reference above.

Creating a draft and locking it both append revisions. Existing rows cannot be updated or deleted. Locking copies the exact source references into a new revision after revalidation; it does not silently advance any reference.

## Validation boundary

Draft creation requires one completed workflow for the same active product and platform, six successful terminal nodes, exact persisted output assets, and one exact pricing result for the same product. A promotion reference is optional because unsupported platforms cannot produce one; when supplied, its product, SKU set, platform, pricing/cost revision, and rule snapshot must be compatible.

The application rejects:

- missing workflow nodes or assets;
- failed, cancelled, interrupted, running, stale, or not-started nodes;
- cross-product or cross-platform references;
- mismatched asset IDs/revisions/types;
- pricing or promotion results for another product or incompatible inputs;
- lock attempts when any selected source is no longer current, the workflow dependency hash has changed, a content asset still needs review, or title/creative/detail content is not locked;
- stale callers whose `expectedRevisionNo` does not match the latest plan revision.

Drafts may display `needs_review` and unlocked content so the user can see what blocks locking. The server returns structured blocker codes; the UI never describes a draft as ready when blockers exist.

## Persistence and API

Migration `0015_add-operation-plans.sql` creates STRICT plan-revision and plan-reference tables. Composite foreign keys keep every reference product-owned; triggers reject update/delete. Reads parse and validate all JSON and fail closed on malformed rows.

HTTP endpoints:

- `POST /api/v1/products/:productId/operation-plans` creates a draft from explicit IDs;
- `GET /api/v1/products/:productId/operation-plans` lists immutable history newest first;
- `GET /api/v1/operation-plans/:planId` reads one revision with resolved trace data;
- `POST /api/v1/operation-plans/:planId/lock` appends a locked revision using `expectedRevisionNo`.

All request/response contracts are strict and reject unknown fields. Ownership and validation errors use the existing safe domain-error mapping.

## UI and acceptance

The existing `/products/:productId/plans` page keeps workflow progress and adds an operation-plan section. Users explicitly choose a completed workflow, pricing result, and optional promotion result, create a draft, inspect every source, resolve blockers in the owning workspace, and explicitly lock. History exposes exact IDs/revisions/hashes without generating a prose summary.

Acceptance proves: valid aggregation, every rejection class above, SQLite immutability, restart persistence, route ownership, draft blocker display, explicit lock, and a Playwright path that locks a plan without any additional provider call.
