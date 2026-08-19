import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './version.js';

describe('APP_VERSION', () => {
  it('matches the application package version', async () => {
    const packagePath = fileURLToPath(new URL('../../../package.json', import.meta.url));
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { version: string };

    expect(APP_VERSION).toBe('0.1.0');
    expect(APP_VERSION).toBe(packageJson.version);
  });
});
