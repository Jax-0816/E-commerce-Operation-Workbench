import { describe, expect, it } from 'vitest';

import { createPlatformProfile, PLATFORM_IDS, updatePlatformProfile } from './index.js';
import { parseUuidV7 } from '../ids.js';

const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');
const profileId = parseUuidV7('0198f0a0-0000-7000-8000-000000000002');

describe('product platform profile', () => {
  it('uses fixed platform IDs and normalizes platform-specific metadata', () => {
    expect(PLATFORM_IDS).toEqual(['pinduoduo', 'taobao', 'douyin']);
    const profile = createPlatformProfile({
      id: profileId,
      productId,
      platformId: 'pinduoduo',
      categoryCode: '  pdd-1001 ',
      categoryName: ' 保温杯 ',
      externalProductId: null,
      title: ' 304 不锈钢保温杯 ',
      description: null,
      metadata: { activity: ' 百亿补贴 ' },
      now: new Date('2026-08-20T00:00:00.000Z'),
    });
    expect(profile).toMatchObject({
      categoryCode: 'pdd-1001',
      categoryName: '保温杯',
      title: '304 不锈钢保温杯',
      metadata: { activity: '百亿补贴' },
      status: 'ready',
    });
  });

  it('rejects unsupported platforms', () => {
    expect(() =>
      createPlatformProfile({
        id: profileId,
        productId,
        platformId: 'unknown' as 'pinduoduo',
        categoryCode: null,
        categoryName: null,
        externalProductId: null,
        title: null,
        description: null,
        metadata: {},
        now: new Date(),
      }),
    ).toThrow();
  });

  it('rejects non-string metadata independently', () => {
    expect(() =>
      createPlatformProfile({
        id: profileId,
        productId,
        platformId: 'taobao',
        categoryCode: null,
        categoryName: null,
        externalProductId: null,
        title: null,
        description: null,
        metadata: { nested: {} as string },
        now: new Date('2026-08-20T00:00:00.000Z'),
      }),
    ).toThrow();
  });

  it('rejects stale updates and advances readiness from draft to ready', () => {
    const profile = createPlatformProfile({
      id: profileId,
      productId,
      platformId: 'taobao',
      categoryCode: null,
      categoryName: null,
      externalProductId: null,
      title: null,
      description: null,
      metadata: {},
      now: new Date('2026-08-20T00:00:00.000Z'),
    });
    expect(profile.status).toBe('draft');
    expect(() =>
      updatePlatformProfile(profile, {
        expectedUpdatedAt: new Date('2026-08-19T00:00:00.000Z'),
        categoryCode: 'tb-1',
        categoryName: '杯具',
        externalProductId: null,
        title: null,
        description: null,
        metadata: {},
        now: new Date('2026-08-20T01:00:00.000Z'),
      }),
    ).toThrow();

    expect(
      updatePlatformProfile(profile, {
        expectedUpdatedAt: profile.updatedAt,
        categoryCode: 'tb-1',
        categoryName: '杯具',
        externalProductId: null,
        title: '淘宝保温杯',
        description: null,
        metadata: {},
        now: new Date('2026-08-20T01:00:00.000Z'),
      }).status,
    ).toBe('ready');
  });
});
