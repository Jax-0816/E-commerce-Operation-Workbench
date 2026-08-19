import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execPath } from 'node:process';

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

describe('internal package preparation', () => {
  it('unconditionally rebuilds every package in dependency order and restores secondary artifacts', async () => {
    const fakeWorkspace = await mkdtemp(join(tmpdir(), 'eaw-prepare-internal-'));
    const databaseDist = join(fakeWorkspace, 'packages', 'database', 'dist');
    const secondaryArtifact = join(databaseDist, 'repositories', 'product-repository.js');
    const builtPackages = [];

    try {
      await mkdir(databaseDist, { recursive: true });
      await writeFile(join(databaseDist, 'index.js'), 'export {}', 'utf8');

      await expect(access(secondaryArtifact)).rejects.toMatchObject({ code: 'ENOENT' });

      await prepareInternalPackages(async (internalPackage) => {
        builtPackages.push(internalPackage.name);
        if (internalPackage.name === '@eaw/database') {
          await mkdir(join(databaseDist, 'repositories'), { recursive: true });
          await writeFile(secondaryArtifact, 'export const restored = true;', 'utf8');
        }
      });

      expect(internalPackages.map(({ name }) => name)).toEqual(expectedPackageNames);
      expect(builtPackages).toEqual(expectedPackageNames);
      await expect(readFile(secondaryArtifact, 'utf8')).resolves.toContain('restored = true');
    } finally {
      await rm(fakeWorkspace, { recursive: true, force: true });
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
