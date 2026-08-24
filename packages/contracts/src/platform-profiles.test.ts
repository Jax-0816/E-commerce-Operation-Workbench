import { describe, expect, it } from 'vitest';

import {
  PlatformProfileParamsSchema,
  PlatformProfileResponseSchema,
  SavePlatformProfileInputSchema,
} from './platform-profiles.js';

const id = '0198f0a0-0000-7000-8000-000000000001';

describe('platform profile contracts', () => {
  it('accepts fixed platforms and rejects unsupported or persistence-only input', () => {
    expect(PlatformProfileParamsSchema.parse({ productId: id, platformId: 'pinduoduo' })).toEqual({
      productId: id,
      platformId: 'pinduoduo',
    });
    expect(() =>
      PlatformProfileParamsSchema.parse({ productId: id, platformId: 'amazon' }),
    ).toThrow();
    expect(() =>
      SavePlatformProfileInputSchema.parse({
        categoryCode: null,
        categoryName: null,
        externalProductId: null,
        title: null,
        description: null,
        metadata: {},
        databaseStatus: 'ready',
      }),
    ).toThrow();
  });

  it('strictly validates the public response and optimistic timestamp', () => {
    expect(() =>
      SavePlatformProfileInputSchema.parse({
        categoryCode: 'pdd-1',
        categoryName: '保温杯',
        externalProductId: null,
        title: '标题',
        description: null,
        metadata: { nested: {} },
        expectedUpdatedAt: 'not-a-date',
      }),
    ).toThrow();
    expect(() =>
      PlatformProfileResponseSchema.parse({
        id,
        productId: id,
        platformId: 'taobao',
        categoryCode: null,
        categoryName: null,
        externalProductId: null,
        title: null,
        description: null,
        metadata: {},
        status: 'draft',
        createdAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
        internalVersion: 2,
      }),
    ).toThrow();
  });
});
