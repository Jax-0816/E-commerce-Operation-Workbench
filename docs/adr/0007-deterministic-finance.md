# ADR 0007: Keep authoritative finance deterministic and traceable

- Status: Accepted
- Date: 2026-08-19

## Context

Pricing and promotion results affect operational decisions and must be reproducible even when AI-generated guidance is available.

## Decision

Use pure deterministic engines with integer minor-unit money, explicit rounding, safe formula evaluation, input status, and complete calculation traces. AI may explain a completed trace but does not calculate authoritative money.

## Consequences

Missing or unverified critical inputs cannot produce a verified financial result. Financial engines remain independent of persistence and AI providers.
