# Ecommerce AI Workbench

A Windows-first, local-only workbench for Chinese ecommerce operations. Phase 0 establishes the monorepo, a React shell, and a local Fastify health endpoint; it does **not** yet implement the product's end-to-end golden path, persistence, AI workflows, pricing, or rule-pack execution.

## Requirements

- Node.js `24.19.0` (the supported engine range is `>=24.19.0 <25`)
- pnpm `11.22.0`

Use the pinned package manager through Corepack on Windows:

```powershell
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

The development web shell is available through Vite and proxies API requests to the local server. Production is intended to be one Fastify process serving the built web app and API. The server binds only to `127.0.0.1`; this project is not a hosted service and does not require Docker.

## Current Phase 0 capabilities

- React navigation shell and product context bar
- `GET /api/v1/health`, including the application version
- Cross-platform quality checks and runtime-version validation

Useful commands:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:rule-packs
node scripts/check-versions.mjs
```

## Data and workspace direction

Source code and user workspace data will remain separate. The planned default Windows workspace is `%LOCALAPPDATA%\EcommerceWorkbench\workspace`, with an option to select another local directory. Workspace persistence, backups, and restore are future phases, not present in Phase 0.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md), [RULE_PACK_CONTRIBUTING.md](RULE_PACK_CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the architecture decisions in [docs/adr](docs/adr).
