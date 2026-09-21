# Project Governance Optimization Design

**Date:** 2026-09-21

**Status:** Approved direction; implementation pending written-spec review

## 1. Goal

Establish a single, explicit operating contract for AI-assisted work in this repository without changing product behavior. The repository should gain:

- a root `AGENTS.md` that defines required reading, execution modes, change control, verification, safety, documentation maintenance, and delivery expectations;
- a root `TODO.md` that acts as the current, concise task entry point while preserving existing historical planning records;
- ignore rules for local package-manager and code-graph artifacts that are not part of the product source.

Success means a new contributor or AI agent can identify the project context, current priorities, permitted change process, and required verification without inferring them from several historical files.

## 2. Current State

- `README.md` is the authoritative product overview and release-candidate runbook.
- Root `AGENTS.md` and `TODO.md` do not exist.
- `task_plan.md`, `progress.md`, and `findings.md` contain valuable historical implementation and verification evidence.
- `.pnpm-store/` and `graphify-out/` are local generated artifacts currently shown as untracked files.
- The repository already defines strict Node.js and pnpm versions, a multi-package quality gate, Windows setup/start validation, unit and integration tests, and Playwright coverage.

## 3. Options Considered

### Option A: Incremental governance layer (selected)

Add the missing governance entry points, preserve all historical records, and reference them from the new `TODO.md`. Add narrow ignore rules for known generated artifacts.

**Benefits:** minimal risk, no history loss, clear future workflow, clean Git status.

**Cost:** some planning information remains distributed by design.

### Option B: Replace the existing planning documents

Collapse `task_plan.md`, `progress.md`, and `findings.md` into one new task file and remove or archive the originals.

**Benefits:** fewer documents.

**Risks:** destroys context, creates a large unrelated diff, and makes prior decisions harder to audit.

### Option C: Add only `AGENTS.md`

Install the operating contract without introducing a task index or ignore changes.

**Benefits:** smallest change.

**Risks:** leaves current-work discovery fragmented and keeps generated artifacts visible as untracked content.

## 4. Selected Design

### 4.1 Root `AGENTS.md`

Create the user-provided operating contract as the repository-wide authority, edited only for Markdown correctness and repository-specific accuracy. Preserve its substantive safety and validation requirements.

Repository-specific adaptations:

- keep `README.md`, `AGENTS.md`, and `TODO.md` as required startup reading;
- retain the existing CodeGraph rule, but only require CodeGraph when a `.codegraph/` index exists;
- explicitly treat missing optional documentation as skippable;
- preserve execution, reasoning, and assistance mode routing;
- preserve protected-file, secret-handling, rollback, verification, and delivery requirements;
- clarify that current explicit user authorization can satisfy the execution-mode confirmation gate;
- avoid claiming tests passed unless fresh command output proves it.

### 4.2 Root `TODO.md`

Create a short current-state index rather than duplicating historical plans. It will contain:

- release state (`0.1.0` release candidate);
- completed baseline summary;
- immediate governance tasks and their status;
- next product decisions that remain outside this change;
- verification commands for the current baseline;
- links to `task_plan.md`, `progress.md`, `findings.md`, current specifications, and implementation plans.

The historical files remain unchanged. `TODO.md` becomes the current entry point; historical evidence stays where it was recorded.

### 4.3 `.gitignore`

Add only:

- `.pnpm-store/`
- `graphify-out/`

These paths contain local package-manager state and generated code-graph outputs. They are not required to build, test, run, or release the product.

### 4.4 No product-code changes

This phase will not modify application code, dependencies, lockfiles, migrations, API contracts, data schemas, authentication, payment behavior, secrets, or runtime configuration.

## 5. Impact and Risks

### Impacted files

- `AGENTS.md` — new repository-wide collaboration contract.
- `TODO.md` — new current-work index.
- `.gitignore` — two generated-directory entries.
- `docs/superpowers/plans/2026-09-21-project-governance-optimization.md` — implementation checklist created after this design is approved.

### Existing files intentionally preserved

- `README.md`
- `task_plan.md`
- `progress.md`
- `findings.md`
- `pnpm-lock.yaml`
- all product source and test files

### Risks and mitigations

- **Rule conflicts:** keep the stated priority order and avoid weakening platform-level safety requirements.
- **Duplicated task state:** make `TODO.md` concise and link to historical evidence instead of copying full logs.
- **Accidental source exclusion:** ignore only the two verified generated directories.
- **False completion claims:** require fresh verification and clearly distinguish document validation from product test validation.

## 6. Verification Strategy

### L1 — logical consistency

- Check that `AGENTS.md` priority, mode routing, execution lifecycle, protected files, and delivery template do not contradict each other.
- Check that every `TODO.md` status claim is supported by `README.md`, Git history, or existing progress records.
- Confirm ignored paths contain generated local artifacts only.

### L2 — static/document checks

- Run Prettier verification against the changed Markdown and ignore files where supported.
- Inspect `git diff --check` for whitespace errors.
- Inspect `git status --short` and confirm only planned files changed.

### L3 — project quality gates

Because no product code changes, run the repository's lightweight document/configuration checks first. If the exact Node.js 24.19.0 and pnpm 11.22.0 toolchain is available, run the existing full quality gate:

```text
node scripts/check-versions.mjs
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:prompts
pnpm validate:rule-packs
```

Playwright is not required to prove a documentation-only change, but its omission must be disclosed. If any existing full gate fails for an unrelated baseline reason, record the exact failure instead of modifying unrelated product code.

## 7. Delivery

The implementation report will list every changed file, validation command and result, uncovered checks, risks, and suggested next step. No push to GitHub is included unless the user requests it separately.
