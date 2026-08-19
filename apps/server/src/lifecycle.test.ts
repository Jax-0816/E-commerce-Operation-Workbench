import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const requiredInternalPackages = [
  '@eaw/domain',
  '@eaw/shared',
  '@eaw/application',
  '@eaw/contracts',
  '@eaw/database',
  '@eaw/workspace',
] as const;
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
});
