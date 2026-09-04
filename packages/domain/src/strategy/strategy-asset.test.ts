import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '../ids.js';
import { createStrategyAsset } from './strategy-asset.js';

describe('strategy asset', () => {
  it('creates immutable revisions bound to the current product', () => {
    const productId = createUuidV7();
    const asset = createStrategyAsset({
      id: createUuidV7(),
      productId,
      kind: 'market_insight',
      revisionNo: 1,
      generationId: createUuidV7(),
      status: 'verified',
      payload: { productId, insights: [], limitations: ['样本有限'] },
      supersedesAssetId: null,
      createdAt: new Date(),
    });

    expect(Object.isFrozen(asset.payload)).toBe(true);
    expect(() =>
      createStrategyAsset({
        ...asset,
        productId: createUuidV7(),
      }),
    ).toThrow(/invalid/i);
  });
});
