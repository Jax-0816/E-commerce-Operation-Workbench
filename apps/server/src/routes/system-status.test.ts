import type { SystemStatusApplication, SystemStatusView } from '@eaw/application';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const status: SystemStatusView = {
  appVersion: '0.1.0',
  localOnly: true,
  bindAddress: '127.0.0.1',
  ai: { provider: 'deepseek', model: 'deepseek-chat', configured: true },
  prompts: { installedCount: 7, activeCount: 7 },
  rules: { installedCount: 1, activePinduoduoCnVersion: null, unresolvedActiveRuleCount: 0 },
};

describe('system status route', () => {
  it('returns the strict redacted status', async () => {
    const app = buildApp(createAppContext({ systemStatus: { get: async () => status } }));
    const response = await app.inject({ method: 'GET', url: '/api/v1/system/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(status);
    await app.close();
  });

  it('returns 503 when unavailable and fails closed on internal fields', async () => {
    const unavailable = buildApp(createAppContext({}));
    expect(
      (await unavailable.inject({ method: 'GET', url: '/api/v1/system/status' })).statusCode,
    ).toBe(503);
    await unavailable.close();

    const application = {
      get: vi.fn(async () => ({ ...status, workspacePath: '/secret', apiKey: 'sk-secret' })),
    } as SystemStatusApplication;
    const app = buildApp(createAppContext({ systemStatus: application }));
    const response = await app.inject({ method: 'GET', url: '/api/v1/system/status' });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('/secret');
    expect(response.body).not.toContain('sk-secret');
    await app.close();
  });
});
