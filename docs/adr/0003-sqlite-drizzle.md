# ADR 0003: Use SQLite and Drizzle for local persistence

- Status: Accepted
- Date: 2026-08-19

## Context

The local-first workbench needs an authoritative database that works on a Windows computer without a separate server and preserves user data safely as the schema evolves.

## Decision

Use SQLite as the local database and Drizzle for schema definitions and explicit migrations. Source code remains separate from the user-selected workspace, which will contain the database and related local assets. Every schema change ships with a migration and real migration tests. Before applying a migration, create a SQLite-consistent backup.

## Consequences

PostgreSQL is rejected because it adds a server runtime that conflicts with the local-only deployment model. Runtime ad-hoc DDL is rejected because it obscures schema history and makes recovery unreliable. Phase 0 does not yet implement persistence or migrations; later work must follow this decision.
