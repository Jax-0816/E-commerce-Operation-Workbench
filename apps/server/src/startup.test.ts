import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createServerStartupOptions } from './startup.js';

describe('server startup options', () => {
  it('resolves the built web app from the compiled server entry point', () => {
    const compiledServerEntry = new URL('../dist/index.js', import.meta.url).href;
    const options = createServerStartupOptions({
      moduleUrl: compiledServerEntry,
      port: '3100',
      workspacePath: '/explicit/workspace',
    });

    expect(options.webDistDir).toBe(fileURLToPath(new URL('../../web/dist/', import.meta.url)));
    expect(options.migrationsDirectory).toBe(
      fileURLToPath(new URL('../../../migrations/', compiledServerEntry)),
    );
    expect(options.port).toBe(3100);
    expect(options.workspacePath).toBe('/explicit/workspace');
  });

  it('rejects HOST values that expose the listener beyond loopback', () => {
    expect(() =>
      createServerStartupOptions({
        host: '0.0.0.0',
        moduleUrl: new URL('../dist/index.js', import.meta.url).href,
      }),
    ).toThrow('HOST must be 127.0.0.1');
  });
});
