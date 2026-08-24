import { describe, expect, it } from 'vitest';

import type { PlatformProfilesApplication } from '@eaw/application';
import { createPlatformProfile, parseUuidV7, type PlatformProfileFields } from '@eaw/domain';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const productId = '0198f0a0-0000-7000-8000-000000000001';

describe('platform profile HTTP contract', () => {
  it('lists, gets, and saves independent public platform profiles', async () => {
    const profiles = new RecordingPlatformProfilesApplication();
    const app = buildApp(createAppContext({ platformProfiles: profiles }));

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/v1/products/${productId}/platform-profiles/pinduoduo`,
      payload: {
        categoryCode: 'pdd-100',
        categoryName: '保温杯',
        externalProductId: null,
        title: '拼多多标题',
        description: '拼多多内容',
        metadata: { activity: '百亿补贴' },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(profiles.lastSaved).toMatchObject({ title: '拼多多标题' });
    expect(saved.json()).not.toHaveProperty('databaseVersion');

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/platform-profiles`,
    });
    expect(listed.json()).toEqual({ items: [saved.json()] });
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/platform-profiles/pinduoduo`,
    });
    expect(fetched.json()).toEqual(saved.json());
    await app.close();
  });

  it('rejects unsupported platforms and unknown payload fields before saving', async () => {
    const profiles = new RecordingPlatformProfilesApplication();
    const app = buildApp(createAppContext({ platformProfiles: profiles }));
    const unsupported = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/platform-profiles/amazon`,
    });
    expect(unsupported.statusCode).toBe(400);
    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/v1/products/${productId}/platform-profiles/taobao`,
      payload: {
        categoryCode: null,
        categoryName: null,
        externalProductId: null,
        title: null,
        description: null,
        metadata: {},
        internalStatus: 'ready',
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(profiles.saveCalls).toBe(0);
    await app.close();
  });
});

class RecordingPlatformProfilesApplication implements PlatformProfilesApplication {
  saveCalls = 0;
  lastSaved: PlatformProfileFields | undefined;
  private readonly profile = createPlatformProfile({
    id: parseUuidV7('0198f0a0-0000-7000-8000-000000000010'),
    productId: parseUuidV7(productId),
    platformId: 'pinduoduo',
    categoryCode: 'pdd-100',
    categoryName: '保温杯',
    externalProductId: null,
    title: '拼多多标题',
    description: '拼多多内容',
    metadata: { activity: '百亿补贴' },
    now: new Date('2026-08-20T00:00:00.000Z'),
  });
  async list() {
    return [this.profile];
  }
  async get() {
    return this.profile;
  }
  async save(_productId: string, _platformId: 'pinduoduo', input: PlatformProfileFields) {
    this.saveCalls += 1;
    this.lastSaved = input;
    return this.profile;
  }
}
