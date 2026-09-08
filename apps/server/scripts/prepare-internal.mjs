import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

export const internalPackages = Object.freeze([
  Object.freeze({ name: '@eaw/calculation-engine', command: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: '@eaw/platform-engine', command: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: '@eaw/rule-engine', command: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: '@eaw/promotion-engine', command: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: '@eaw/prompt-engine', command: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: '@eaw/ai-engine', command: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: '@eaw/competitor-engine', command: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: '@eaw/workflow-engine', command: Object.freeze(['run', 'build']) }),
  Object.freeze({
    name: '@eaw/pricing-engine',
    command: Object.freeze(['exec', 'tsc', '-p', 'tsconfig.json']),
  }),
  Object.freeze({ name: '@eaw/domain', command: Object.freeze(['run', 'build']) }),
  Object.freeze({ name: '@eaw/shared', command: Object.freeze(['run', 'build']) }),
  Object.freeze({
    name: '@eaw/application',
    command: Object.freeze(['exec', 'tsc', '-p', 'tsconfig.json']),
  }),
  Object.freeze({
    name: '@eaw/contracts',
    command: Object.freeze(['exec', 'tsc', '-p', 'tsconfig.json']),
  }),
  Object.freeze({
    name: '@eaw/database',
    command: Object.freeze(['exec', 'tsc', '-p', 'tsconfig.json']),
  }),
  Object.freeze({
    name: '@eaw/workspace',
    command: Object.freeze(['exec', 'tsc', '-p', 'tsconfig.json']),
  }),
]);

export async function prepareInternalPackages(buildPackage = runPackageBuild) {
  for (const internalPackage of internalPackages) {
    await buildPackage(internalPackage);
  }
}

export function runPackageBuild(
  internalPackage,
  {
    execute = execFileSync,
    nodeExecutable = process.execPath,
    pnpmCli = process.env.npm_execpath,
    cwd = workspaceRoot,
    env = process.env,
  } = {},
) {
  if (pnpmCli === undefined) {
    throw new Error('prepare-internal must be run through pnpm.');
  }

  execute(nodeExecutable, [pnpmCli, '--filter', internalPackage.name, ...internalPackage.command], {
    cwd,
    env,
    stdio: 'inherit',
  });
}

function isDirectExecution() {
  return (
    process.argv[1] !== undefined &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  );
}

if (isDirectExecution()) {
  await prepareInternalPackages();
}
