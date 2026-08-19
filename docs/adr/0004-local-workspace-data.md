# ADR 0004: Keep source code and local workspace data separate

- Status: Accepted
- Date: 2026-08-19

## Context

User data, generated assets, and future backups must not be co-located with repository source or committed accidentally.

## Decision

Use a user-selected local workspace outside the source tree. The planned Windows default is `%LOCALAPPDATA%\EcommerceWorkbench\workspace`; stored asset references will be workspace-relative.

## Consequences

Phase 0 does not yet persist workspace data. Future database, asset, backup, and restore work must preserve the separation and exclude secrets from backups.
