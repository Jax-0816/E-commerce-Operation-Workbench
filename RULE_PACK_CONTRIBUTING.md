# Contributing rule packs

Rule packs are planned as versioned, inert data for platform rules. They must never contain executable code or invent uncertain financial rates.

Each contribution should identify its platform, region, semantic version, source provenance, verification and effective dates, status, scope, and checksum. Include machine-readable rule data, human-readable explanation, fixtures, and a changelog entry. Mark incomplete or unverified financial inputs as `needs_review`; they must not produce a verified result.

Contributors should preserve snapshots and avoid mutating already published pack versions. Submit a focused pull request with source links and validation evidence. The Phase 0 `pnpm validate:rule-packs` command is a placeholder because rule-pack execution is not implemented yet.
