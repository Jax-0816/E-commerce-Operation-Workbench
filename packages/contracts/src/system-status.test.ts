import { describe, expect, it } from 'vitest';

import { SystemStatusResponseSchema } from './system-status.js';

const status = {
  appVersion: '0.1.0',
  localOnly: true,
  bindAddress: '127.0.0.1',
  ai: { provider: 'deepseek', model: 'deepseek-chat', configured: false },
  prompts: { installedCount: 7, activeCount: 6 },
  rules: {
    installedCount: 1,
    activePinduoduoCnVersion: '2026.9.0',
    unresolvedActiveRuleCount: 3,
  },
} as const;

describe('SystemStatusResponseSchema', () => {
  it('accepts only the redacted system summary', () => {
    expect(SystemStatusResponseSchema.parse(status)).toEqual(status);
  });

  it.each([
    { ...status, workspacePath: '/secret' },
    { ...status, apiKey: 'sk-secret' },
    { ...status, localOnly: false },
    { ...status, bindAddress: '0.0.0.0' },
    { ...status, prompts: { ...status.prompts, activeCount: -1 } },
    { ...status, rules: { ...status.rules, installedCount: Number.MAX_SAFE_INTEGER + 1 } },
  ])('rejects expanded, remote, or invalid status data', (input) => {
    expect(SystemStatusResponseSchema.safeParse(input).success).toBe(false);
  });
});
