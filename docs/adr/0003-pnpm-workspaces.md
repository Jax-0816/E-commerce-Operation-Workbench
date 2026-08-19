# ADR 0003: Use pnpm workspaces with an exact runtime baseline

- Status: Accepted
- Date: 2026-08-19

## Context

The modular monolith needs shared packages without losing reproducibility across Windows and Ubuntu.

## Decision

Use pnpm workspaces, Node.js `24.19.0` within `>=24.19.0 <25`, and pnpm `11.22.0`. Keep `engineStrict` enabled, use exact dependency versions, and install from the committed lockfile with `--frozen-lockfile` in CI.

## Consequences

Contributors must use the pinned runtime and package manager. Runtime validation fails early with actionable guidance instead of silently running under an unsupported release.
