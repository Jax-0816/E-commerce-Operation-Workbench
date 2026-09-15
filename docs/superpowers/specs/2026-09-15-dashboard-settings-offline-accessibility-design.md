# Dashboard, Settings, Offline, and Accessibility Design

**Status:** Approved under the existing Task 28 master-plan authorization

**Goal:** Turn the existing shell into an actionable local operations console that reports current risks, exposes only safe system configuration state, behaves truthfully without internet access, and remains usable by keyboard and on narrow Windows displays.

## Scope

Task 28 delivers a dashboard read model and API, an actionable dashboard, a redacted system-status page, explicit online/offline capability policy, a global error boundary, route focus management, semantic status announcements, keyboard-safe controls, and responsive layout acceptance.

It does not add remote synchronization, background internet detection, automatic remediation, a new AI provider, a prompt editor, a Windows installer, or the final end-to-end release path. Task 29 remains responsible for the complete product-to-locked-plan golden path and fresh-clone release candidate.

## Chosen Architecture

### Server-owned dashboard snapshot

The browser will call one `GET /api/v1/dashboard` endpoint. A new application-layer `DashboardApplication` composes narrow existing ports and returns a current read model. The browser will not fan out across every product, SKU, cost, pricing, promotion, rule, and content endpoint because partial failures would produce internally inconsistent counts and excessive local requests.

The application may use existing application ports where current-state evaluation already exists, especially title/creative/detail staleness. It may use repository-shaped read ports for SKU, cost, prompt, pricing, and promotion data. This is a read-only composition: it must not repair, activate, lock, generate, or create anything.

Dashboard values are defined as follows:

- `productCount`: non-archived products returned by the product application.
- `enabledSkuCount`: enabled SKUs across those products.
- `missingCostProfileCount`: enabled SKUs with no cost profile.
- `staleAssetCount`: latest title, creative, or detail revision for each product/platform/kind whose existing staleness evaluator returns stale. Historical stale revisions are not double-counted.
- `lossMakingResultCount`: latest persisted result for each product/SKU/financial surface whose strictly parsed `netProfit.minorUnits` is below zero. Older superseded results are not counted.
- `ruleRiskCount`: `needs_review` rules in the active Pinduoduo/CN pack. Absence of an active Pinduoduo/CN pack is a distinct blocker, not a fabricated rule count.
- `aiConfigured`: the existing secret port's boolean state only.

The response also contains stable attention items with a code, severity, count, Chinese label, explanation, and internal route. Ordering is fixed: missing cost, loss, stale asset, rule review/missing rule pack, and missing AI configuration. Zero-count informational entries may be omitted, but summary fields are always present.

Malformed persisted financial snapshots fail closed at the application boundary. They are reported as a safe dashboard-unavailable error rather than interpreted as zero profit.

### Redacted system status

A separate `GET /api/v1/system/status` endpoint returns only:

- application version and `localOnly: true`;
- AI provider name/model and `configured` boolean;
- installed and active prompt counts;
- installed rule-pack count, active Pinduoduo/CN version or `null`, and unresolved active-rule count;
- the fixed server bind description `127.0.0.1`.

It never returns a secret value, environment variables, absolute workspace paths, database paths, process identifiers, log contents, or provider error bodies. The system settings page consumes this endpoint and links users to the existing AI, rules, and data-management pages for mutations.

### Explicit connectivity policy

The browser owns online/offline presentation because local server health and public-internet availability are different facts. A small connectivity provider reads `navigator.onLine`, subscribes to `online` and `offline`, and exposes an injectable source for deterministic tests.

Capabilities are classified rather than globally disabling the UI:

- Local and still available offline: product/fact/SKU/platform edits, costs, pricing, persisted histories, promotion calculation with installed rules, local competitor CSV/XLSX/paste import, rule import/activation, AI key save/clear, backup, and restore staging.
- Internet-dependent and disabled offline: DeepSeek connection test; strategy, title, creative, and detail generation/regeneration; starting/resuming/retrying a content workflow that can call AI.
- Read-only views remain available, including previously generated AI assets and workflow history.

Disabled controls expose the reason in visible text and through accessible description. Offline mode does not pretend the local Fastify server is unavailable and does not delete or clear data. Reconnection only re-enables actions; it never automatically starts, resumes, retries, or regenerates work.

### Shell reliability and accessibility

The shell adds:

- a first-focusable “跳到主要内容” link;
- a focusable main workspace target that receives focus after pathname changes without moving focus for query-only platform changes;
- one global connectivity banner using `role="status"` and `aria-live="polite"`;
- a top-level React error boundary with a Chinese safe fallback and explicit reload action; raw exception messages/stacks are not rendered;
- semantic headings, table scopes, status text that does not rely on color/icon alone, visible keyboard focus, and native buttons/links instead of clickable containers;
- responsive layout where sidebar, context, attention cards, forms, tables, and actions remain reachable at desktop, 720 px, and 390 px widths.

Tables may scroll horizontally on narrow screens but their captions and row/column headers remain present. No critical action may be hidden solely because of viewport width.

## Contracts

Both new HTTP responses use strict Zod contracts in `@eaw/contracts`. Counts are non-negative safe integers; codes and severities are closed enums; links are repository-internal absolute paths; money is never recomputed in the browser.

The dashboard UI depends on a `DashboardApi` interface. The settings UI depends on a `SystemStatusApi` interface. Browser adapters parse every response and use the shared safe-error behavior already established by feature APIs.

Connectivity is a UI dependency, not an HTTP field, so tests can render the same server snapshot online and offline without mutating backend state.

## Failure and Safety Rules

- Dashboard/system reads are side-effect free and never invoke a paid provider.
- Aggregation uses bounded fixed platform/kind sets and existing product/SKU collections; no unbounded retry or polling is added.
- A failed dashboard request shows a retryable alert without replacing counts with misleading zeroes.
- Offline blocks only explicitly internet-dependent actions and produces no network request for those actions.
- Reconnection performs no automatic paid or mutating action.
- Settings responses and UI never expose secret values or machine paths.
- Rule risk is based only on the active pack; an installed inactive incomplete pack is shown as “未启用”, not treated as verified.
- All links are internal routes and all server listeners remain loopback-only.

## Verification

Application tests will construct deterministic in-memory ports and prove every count, latest-only rule, stable attention order, malformed snapshot failure, and no mutation/provider call. Contract tests will reject negative/unsafe counts, unknown codes, external links, and extra fields.

Server route and production integration tests will verify strict responses, persistence across restart, active/inactive rule truthfulness, and absence of secrets/absolute paths.

Web tests will prove dashboard actions link to the owning workspace, failed reads do not display zeroes, system settings remain redacted, offline blocks each internet-dependent action before its API method is called, local finance/history remains enabled, reconnect does not auto-run work, skip-link/focus/error-boundary semantics are present, and status meaning is available without color.

The release closeout will run the exact Node.js 24.19.0/pnpm 11.22.0 gates, focused and root tests, production build, prompt/rule validation, Playwright smoke paths, Windows/Ubuntu CI, and 1440/720/390 viewport checks. No real paid AI call is permitted.
