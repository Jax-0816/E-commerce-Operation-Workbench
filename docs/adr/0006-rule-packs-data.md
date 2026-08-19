# ADR 0006: Represent platform rules as inert versioned data

- Status: Accepted
- Date: 2026-08-19

## Context

Platform fees and promotion policies change and require provenance, review, and reproducible historical calculations.

## Decision

Model rule packs as versioned JSON and Markdown data with manifests, schemas, fixtures, provenance, verification status, and checksums. Rule packs never execute code. Uncertain financial rules remain incomplete or `needs_review`.

## Consequences

No financial rate is invented. Future calculations and operation plans embed immutable rule snapshots so later updates cannot rewrite history.
