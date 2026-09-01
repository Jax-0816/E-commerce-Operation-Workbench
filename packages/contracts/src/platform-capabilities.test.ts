import { describe, expect, it } from 'vitest';

import { PlatformCapabilitiesResponseSchema } from './platform-capabilities.js';

describe('platform capability contract', () => {
  it('accepts explicit availability states and rejects incomplete payloads', () => {
    const capability = (status: 'supported' | 'unavailable', available: boolean) => ({
      status,
      available,
      message: available ? '已支持' : '当前平台此能力尚未完整实现。',
    });
    const input = {
      platformId: 'taobao_tmall',
      profilePlatformId: 'taobao',
      displayName: '淘宝/天猫',
      capabilities: {
        content: capability('supported', true),
        creative: capability('supported', true),
        pricing: { status: 'generic', available: true, message: '仅通用定价' },
        promotion: capability('unavailable', false),
        fee_model: { status: 'incomplete', available: false, message: '未完整' },
      },
    };
    expect(PlatformCapabilitiesResponseSchema.parse(input)).toEqual(input);
    expect(() =>
      PlatformCapabilitiesResponseSchema.parse({
        ...input,
        capabilities: { content: input.capabilities.content },
      }),
    ).toThrow();
    expect(() =>
      PlatformCapabilitiesResponseSchema.parse({
        ...input,
        capabilities: {
          ...input.capabilities,
          promotion: capability('supported', true),
        },
      }),
    ).toThrow();
  });
});
