import { describe, expect, it, vi } from 'vitest';

import { createSystemStatusApplication, SYSTEM_PROMPT_TEMPLATE_IDS } from './index.js';

describe('createSystemStatusApplication', () => {
  it('counts known prompts and exposes only current redacted rule/AI state', async () => {
    const listPrompts = vi.fn(async (templateId: string) => [
      { active: true, templateId },
      { active: false, templateId },
    ]);
    const application = createSystemStatusApplication({
      appVersion: '0.1.0',
      ai: {
        get: async () => ({ configured: true, provider: 'deepseek', model: 'deepseek-chat' }),
      },
      prompts: { list: listPrompts },
      rules: {
        list: async () => [
          { active: false, pack: { manifest: { version: 'old' }, rules: [] } },
          {
            active: true,
            pack: {
              manifest: { version: '2026.9.0' },
              rules: [{ status: 'needs_review' }, { status: 'verified' }],
            },
          },
        ],
      },
    });

    await expect(application.get()).resolves.toEqual({
      appVersion: '0.1.0',
      localOnly: true,
      bindAddress: '127.0.0.1',
      ai: { provider: 'deepseek', model: 'deepseek-chat', configured: true },
      prompts: { installedCount: 14, activeCount: 7 },
      rules: {
        installedCount: 2,
        activePinduoduoCnVersion: '2026.9.0',
        unresolvedActiveRuleCount: 1,
      },
    });
    expect(listPrompts.mock.calls.map(([id]) => id)).toEqual(SYSTEM_PROMPT_TEMPLATE_IDS);
  });

  it('keeps missing prompt and rule state explicit', async () => {
    const application = createSystemStatusApplication({
      appVersion: '0.1.0',
      ai: { get: async () => ({ configured: false }) },
      prompts: { list: async () => [] },
      rules: { list: async () => [] },
    });

    await expect(application.get()).resolves.toMatchObject({
      prompts: { installedCount: 0, activeCount: 0 },
      rules: {
        installedCount: 0,
        activePinduoduoCnVersion: null,
        unresolvedActiveRuleCount: 0,
      },
    });
  });
});
