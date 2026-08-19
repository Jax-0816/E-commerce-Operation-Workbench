# ADR 0005: Isolate AI providers behind application ports

- Status: Accepted
- Date: 2026-08-19

## Context

AI capabilities need provider substitution while preserving structured validation, traceability, and local secret handling.

## Decision

Business use cases depend on an `AIProvider` port, not a vendor SDK. Provider adapters will implement text and structured generation, connection checks, and capability reporting; prompts and provider configuration remain outside routes and UI components.

## Consequences

DeepSeek can be a supported adapter without coupling business modules to it. Secrets must not enter business SQLite, logs, backups, or browser responses.
