import { describe, expect, it } from 'vitest';

import { createPlatformCapabilitiesApplication } from '@eaw/application';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

describe('platform capabilities HTTP contract', () => {
  it('returns truthful states for a persisted platform alias', async () => {
    const app = buildApp(
      createAppContext({ platformCapabilities: createPlatformCapabilitiesApplication() }),
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/platforms/taobao/capabilities?categoryCode=cups',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      platformId: 'taobao_tmall',
      profilePlatformId: 'taobao',
      capabilities: {
        pricing: { status: 'generic', available: true },
        promotion: { status: 'unavailable', available: false },
        fee_model: { status: 'incomplete', available: false },
      },
    });
    await app.close();
  });

  it('rejects unknown platform identifiers', async () => {
    const app = buildApp(
      createAppContext({ platformCapabilities: createPlatformCapabilitiesApplication() }),
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/platforms/amazon/capabilities',
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it.each([
    ['taobao', 'taobao_tmall'],
    ['douyin', 'douyin_ecommerce'],
  ] as const)('accepts alias %s and canonical identifier %s', async (alias, canonical) => {
    const app = buildApp(
      createAppContext({ platformCapabilities: createPlatformCapabilitiesApplication() }),
    );
    const aliasResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/platforms/${alias}/capabilities`,
    });
    const canonicalResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/platforms/${canonical}/capabilities`,
    });
    expect(canonicalResponse.statusCode).toBe(200);
    expect(canonicalResponse.json()).toEqual(aliasResponse.json());
    await app.close();
  });
});
