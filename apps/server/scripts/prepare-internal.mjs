import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const pnpmCli = process.env.npm_execpath;

if (pnpmCli === undefined) {
  throw new Error('prepare-internal must be run through pnpm.');
}

const packages = [
  { name: '@eaw/domain', command: ['run', 'build'], dependencies: [] },
  { name: '@eaw/shared', command: ['run', 'build'], dependencies: [] },
  {
    name: '@eaw/application',
    command: ['exec', 'tsc', '-p', 'tsconfig.json'],
    dependencies: ['@eaw/domain'],
  },
  {
    name: '@eaw/contracts',
    command: ['exec', 'tsc', '-p', 'tsconfig.json'],
    dependencies: ['@eaw/domain'],
  },
  {
    name: '@eaw/database',
    command: ['exec', 'tsc', '-p', 'tsconfig.json'],
    dependencies: ['@eaw/domain'],
  },
  {
    name: '@eaw/workspace',
    command: ['exec', 'tsc', '-p', 'tsconfig.json'],
    dependencies: ['@eaw/domain'],
  },
];

const rebuilt = new Set();
for (const internalPackage of packages) {
  const directoryName = internalPackage.name.slice('@eaw/'.length);
  const packageDirectory = fileURLToPath(
    new URL(`../../../packages/${directoryName}/`, import.meta.url),
  );
  const artifact = join(packageDirectory, 'dist', 'index.js');
  const dependencyWasRebuilt = internalPackage.dependencies.some((name) => rebuilt.has(name));
  if (!dependencyWasRebuilt && isBuildCurrent(packageDirectory, artifact)) continue;

  execFileSync(
    process.execPath,
    [pnpmCli, '--filter', internalPackage.name, ...internalPackage.command],
    {
      cwd: workspaceRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );
  rebuilt.add(internalPackage.name);
}

function isBuildCurrent(packageDirectory, artifact) {
  if (!existsSync(artifact)) return false;
  const artifactModifiedAt = statSync(artifact).mtimeMs;
  const inputs = [
    join(packageDirectory, 'package.json'),
    join(packageDirectory, 'tsconfig.json'),
    ...sourceFiles(join(packageDirectory, 'src')),
  ];
  return inputs.every((input) => statSync(input).mtimeMs <= artifactModifiedAt);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}
