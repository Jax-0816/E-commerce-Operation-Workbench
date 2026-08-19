import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const pnpmCli = process.env.npm_execpath;

if (pnpmCli === undefined) {
  throw new Error('prepare-internal must be run through pnpm.');
}

const packages = [
  { name: '@eaw/domain', command: ['run', 'build'] },
  { name: '@eaw/shared', command: ['run', 'build'] },
  {
    name: '@eaw/application',
    command: ['exec', 'tsc', '-p', 'tsconfig.json'],
  },
  {
    name: '@eaw/contracts',
    command: ['exec', 'tsc', '-p', 'tsconfig.json'],
  },
  {
    name: '@eaw/database',
    command: ['exec', 'tsc', '-p', 'tsconfig.json'],
  },
  {
    name: '@eaw/workspace',
    command: ['exec', 'tsc', '-p', 'tsconfig.json'],
  },
];

for (const internalPackage of packages) {
  execFileSync(
    process.execPath,
    [pnpmCli, '--filter', internalPackage.name, ...internalPackage.command],
    {
      cwd: workspaceRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );
}
