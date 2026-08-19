import { execFileSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { env as processEnvironment, execPath } from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  internalPackages,
  prepareInternalPackages,
  runPackageBuild,
} from '../scripts/prepare-internal.mjs';

const expectedPackageNames = [
  '@eaw/domain',
  '@eaw/shared',
  '@eaw/application',
  '@eaw/contracts',
  '@eaw/database',
  '@eaw/workspace',
];
const require = createRequire(import.meta.url);
const typescriptCli = require.resolve('typescript/bin/tsc');
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('internal package preparation', () => {
  it('unconditionally rebuilds every package in dependency order', async () => {
    const builtPackages = [];

    await prepareInternalPackages(async (internalPackage) => {
      builtPackages.push(internalPackage.name);
    });

    expect(internalPackages.map(({ name }) => name)).toEqual(expectedPackageNames);
    expect(builtPackages).toEqual(expectedPackageNames);
  });

  it('emits the database entry point and product repository with the real build command', async () => {
    const databasePackage = internalPackages.find(({ name }) => name === '@eaw/database');

    expect(databasePackage).toBeDefined();
    expect(databasePackage.command).toEqual(['exec', 'tsc', '-p', 'tsconfig.json']);

    const outputDirectory = await mkdtemp(join(workspaceRoot, '.eaw-database-build-'));
    const databaseDirectory = join(workspaceRoot, 'packages', 'database');

    try {
      execFileSync(
        execPath,
        [typescriptCli, ...databasePackage.command.slice(2), '--outDir', outputDirectory],
        {
          cwd: databaseDirectory,
          env: processEnvironment,
          stdio: 'pipe',
        },
      );

      await expect(access(join(outputDirectory, 'index.js'))).resolves.toBeUndefined();
      await expect(
        access(join(outputDirectory, 'repositories', 'product-repository.js')),
      ).resolves.toBeUndefined();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it('uses the current Node process and pnpm CLI without a shell and propagates build errors', () => {
    const calls = [];
    const fakePnpmCli = '/fake/pnpm.cjs';
    const fakeWorkspace = '/fake/workspace';
    const fakeEnvironment = { TEST_MARKER: 'set' };

    runPackageBuild(internalPackages[0], {
      execute(...args) {
        calls.push(args);
      },
      pnpmCli: fakePnpmCli,
      cwd: fakeWorkspace,
      env: fakeEnvironment,
    });

    expect(calls).toEqual([
      [
        execPath,
        [fakePnpmCli, '--filter', '@eaw/domain', 'run', 'build'],
        { cwd: fakeWorkspace, env: fakeEnvironment, stdio: 'inherit' },
      ],
    ]);
    expect(calls[0][2]).not.toHaveProperty('shell');

    const buildFailure = new Error('build failed');
    expect(() =>
      runPackageBuild(internalPackages[0], {
        execute() {
          throw buildFailure;
        },
        pnpmCli: fakePnpmCli,
      }),
    ).toThrow(buildFailure);
  });
});
