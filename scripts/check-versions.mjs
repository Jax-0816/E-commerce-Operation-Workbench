import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const nodeRequirement = packageManifest.engines?.node;
const packageManager = packageManifest.packageManager;
const pnpmRequirement = packageManager?.match(/^pnpm@(.+)$/)?.[1];

if (!nodeRequirement || !pnpmRequirement) {
  throw new Error(
    'Root package.json must declare engines.node and packageManager as pnpm@<version>.',
  );
}

function parseVersion(version) {
  const match = version
    .trim()
    .replace(/^v/, '')
    .match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/);

  if (!match) {
    return undefined;
  }

  return match.slice(1, 4).map((segment) => Number(segment ?? 0));
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }

  return 0;
}

function satisfiesNodeEngine(version, requirement) {
  const parsedVersion = parseVersion(version);
  const constraints = requirement.split(/\s+/).filter(Boolean);

  if (!parsedVersion || constraints.length === 0) {
    return false;
  }

  return constraints.every((constraint) => {
    const match = constraint.match(/^(>=|>|<=|<|=)?(\d+(?:\.\d+){0,2})$/);

    if (!match) {
      return false;
    }

    const comparison = compareVersions(parsedVersion, parseVersion(match[2]));
    switch (match[1] ?? '=') {
      case '>=':
        return comparison >= 0;
      case '>':
        return comparison > 0;
      case '<=':
        return comparison <= 0;
      case '<':
        return comparison < 0;
      default:
        return comparison === 0;
    }
  });
}

/**
 * @typedef {{ ok: boolean; errors: string[] }} VersionCheckResult
 */

/**
 * @param {{ node: string; pnpm: string }} versions
 * @returns {VersionCheckResult}
 */
export function checkRuntimeVersions({ node, pnpm }) {
  const errors = [];

  if (!satisfiesNodeEngine(node, nodeRequirement)) {
    errors.push(`Node.js ${node} does not satisfy ${nodeRequirement}.`);
  }

  if (pnpm.trim().replace(/^v/, '') !== pnpmRequirement) {
    errors.push(`pnpm ${pnpm} does not match ${pnpmRequirement}.`);
  }

  return { ok: errors.length === 0, errors };
}

function readArgument(name) {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
}

function installedPnpmVersion() {
  return execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version'], {
    encoding: 'utf8',
  }).trim();
}

function main() {
  const node = readArgument('--node') ?? process.versions.node;
  const pnpm = readArgument('--pnpm') ?? installedPnpmVersion();
  const result = checkRuntimeVersions({ node, pnpm });

  if (!result.ok) {
    console.error('Unsupported runtime versions:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    console.error(
      `Install Node.js ${nodeRequirement} and pnpm ${pnpmRequirement}, then run pnpm install.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Runtime versions are supported: Node.js ${node}; pnpm ${pnpm}.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
