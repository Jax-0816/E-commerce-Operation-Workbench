import { describe, expect, it } from 'vitest';

import type { AIProvider } from '@eaw/ai-engine';
import type { SecretStore } from '@eaw/workspace';

import { createAISettingsApplication } from './index.js';

describe('AI settings application', () => {
  it('exposes only configured status, saves and clears the key, and tests on demand', async () => {
    const secrets = new MemorySecretStore();
    const application = createAISettingsApplication({
      secrets,
      providerFactory: (apiKey) => new ConnectionProvider(apiKey === 'sk-valid'),
    });

    expect(await application.get()).toEqual({
      provider: 'deepseek',
      configured: false,
      model: 'deepseek-chat',
    });
    expect(await application.configure({ apiKey: 'sk-valid' })).toEqual({
      provider: 'deepseek',
      configured: true,
      model: 'deepseek-chat',
    });
    expect(JSON.stringify(await application.get())).not.toContain('sk-valid');
    expect(await application.testConnection()).toEqual({ ok: true });
    expect(await application.clear()).toMatchObject({ configured: false });
    await expect(application.testConnection()).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
    });
  });
});

class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key);
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
  async isConfigured(key: string) {
    return this.values.has(key);
  }
}

class ConnectionProvider implements AIProvider {
  readonly id = 'deepseek';
  constructor(private readonly ok: boolean) {}
  async generate(): Promise<never> {
    throw new Error('not used');
  }
  async testConnection() {
    return this.ok;
  }
  getCapabilities() {
    return { text: true, structured: true } as const;
  }
}
