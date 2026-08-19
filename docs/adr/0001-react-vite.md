# ADR 0001: Use React with Vite for the local web shell

- Status: Accepted
- Date: 2026-08-19

## Context

The local workbench needs a browser UI with a fast development loop and a static production build that the local server can host.

## Decision

Use React and Vite. The web app talks to the local API; Vite proxies `/api` during development.

## Consequences

The browser stays separate from persistence and business engines. Production packaging serves Vite output from the local Fastify process rather than introducing a hosted frontend service.
