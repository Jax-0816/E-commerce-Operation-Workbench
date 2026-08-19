# Contributing

Thank you for contributing. This project is Windows-first and local-only; preserve loopback-only server behavior and keep user workspace data separate from source code.

## Development setup

Use Node.js `24.19.0` and pnpm `11.22.0` exactly. In PowerShell:

```powershell
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
node scripts/check-versions.mjs
```

Before opening a pull request, run:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate:rule-packs
```

Use exact dependency versions. Commit lockfile changes only when the corresponding manifest change is intentional and reviewed. Do not weaken `engineStrict`, broaden the supported Node range, add a Docker runtime requirement, or expose the server beyond `127.0.0.1`.

## Changes and reviews

Keep pull requests focused, include behavioral tests for production changes, and update an ADR when a decision changes an established architectural boundary. Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through the process in [SECURITY.md], not public issues.
