import { execFile } from 'node:child_process';
import { access, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const requiredInternalPackages = [
  '@eaw/domain',
  '@eaw/shared',
  '@eaw/application',
  '@eaw/contracts',
  '@eaw/database',
  '@eaw/workspace',
] as const;
const execFileAsync = promisify(execFile);

describe('standalone server lifecycle', () => {
  it('prepares every dist-only internal dependency before all standalone commands', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    const preparationScript = await readFile(
      new URL('../scripts/prepare-internal.mjs', import.meta.url),
      'utf8',
    );

    for (const packageName of requiredInternalPackages) {
      expect(preparationScript).toContain(packageName);
    }
    expect(manifest.scripts['prepare:internal']).toBe('node scripts/prepare-internal.mjs');
    for (const lifecycle of ['predev', 'prebuild', 'pretest', 'pretypecheck']) {
      expect(manifest.scripts[lifecycle]).toBe('pnpm run prepare:internal');
    }
    expect(manifest.scripts.prestart).toBe('pnpm run build');
  });

  it('recreates a missing secondary internal build artifact and restores it safely', async () => {
    const databasePackage = join(process.cwd(), '..', '..', 'packages', 'database');
    const artifact = join(databasePackage, 'dist', 'repositories', 'product-repository.js');
    const backup = join(
      databasePackage,
      'dist',
      'repositories',
      'product-repository.lifecycle-backup.js',
    );
    await rename(artifact, backup);
    try {
      await execFileAsync('pnpm', ['run', 'prepare:internal'], {
        cwd: process.cwd(),
        env: process.env,
      });
      await expect(access(artifact)).resolves.toBeUndefined();
    } finally {
      await rm(artifact, { force: true });
      await rename(backup, artifact);
    }
  }, 30_000);
});
