import { describe, expect, it } from 'vitest';

import { createPlatformCapabilitiesApplication } from './index.js';

describe('platform capabilities application', () => {
  it('returns a truthful context-bound capability view', () => {
    const application = createPlatformCapabilitiesApplication();
    const result = application.get('taobao', ' cups ');

    expect(result.context).toMatchObject({
      platformId: 'taobao_tmall',
      profilePlatformId: 'taobao',
      categoryCode: 'cups',
    });
    expect(result.capabilities.promotion.available).toBe(false);
    expect(result.capabilities.pricing.status).toBe('generic');
  });
});
