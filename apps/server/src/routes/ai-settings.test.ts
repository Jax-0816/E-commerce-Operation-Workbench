import { describe, expect, it } from 'vitest';

import { createAISettingsApplication } from '@eaw/application';
import type { AIProvider } from '@eaw/ai-engine';
import { FileSecretStore } from '@eaw/workspace';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

describe('AI settings routes', () => {
  it('configures, reports, tests and clears DeepSeek without returning the API key', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'eaw-ai-settings-route-')));
    const aiSettings = createAISettingsApplication({
      secrets: new FileSecretStore(directory),
      providerFactory: () => new ConnectedProvider(),
    });
    const app = buildApp(createAppContext({ aiSettings }));

    const configured = await app.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { apiKey: 'sk-route-secret' },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json()).toEqual({
      provider: 'deepseek',
      configured: true,
      model: 'deepseek-chat',
    });
    expect(configured.body).not.toContain('sk-route-secret');

    expect((await app.inject({ method: 'GET', url: '/api/v1/ai/settings' })).json()).toEqual(
      configured.json(),
    );
    expect((await app.inject({ method: 'POST', url: '/api/v1/ai/settings/test' })).json()).toEqual({
      ok: true,
    });
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/v1/ai/settings' })).json(),
    ).toMatchObject({ configured: false });

    await app.close();
    await rm(directory, { recursive: true });
  });
});

class ConnectedProvider implements AIProvider {
  readonly id = 'deepseek';
  async generate(): Promise<never> {
    throw new Error('not used');
  }
  async testConnection() {
    return true;
  }
  getCapabilities() {
    return { text: true, structured: true } as const;
  }
}
