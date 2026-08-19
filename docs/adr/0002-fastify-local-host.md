# ADR 0002: Use Fastify as a loopback-only local host

- Status: Accepted
- Date: 2026-08-19

## Context

The product is a local-first workbench, not a network service. It needs one API host for the browser UI and local application use cases.

## Decision

Use Fastify and bind the server to `127.0.0.1`. Production serves the UI and `/api/v1` from the same local process.

## Consequences

No arbitrary CORS or LAN/public binding is introduced. Docker remains optional tooling and is not a runtime requirement.
