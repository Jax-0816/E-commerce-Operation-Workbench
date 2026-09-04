import { createStrategyAsset, createUuidV7, type StrategyAsset } from '@eaw/domain';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { createAppContext } from './context.js';

describe('strategy routes', () => {
  it('generates and lists versioned strategy assets through strict routes', async () => {
    const productId = createUuidV7();
    const items: StrategyAsset[] = [];
    const app = buildApp(
      createAppContext({
        strategy: {
          async generate(id, kind) {
            const asset = createStrategyAsset({
              id: createUuidV7(),
              productId: id as typeof productId,
              kind,
              revisionNo: 1,
              generationId: createUuidV7(),
              status: 'verified',
              payload: {
                productId: id as typeof productId,
                insights: [],
                limitations: ['样本有限'],
              },
              supersedesAssetId: null,
              createdAt: new Date('2026-09-04T00:00:00.000Z'),
            });
            items.push(asset);
            return asset;
          },
          async list() {
            return items;
          },
        },
      }),
    );

    const generated = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/strategy/market_insight/generate`,
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({ kind: 'market_insight', revisionNo: 1 });
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/strategy/market_insight`,
    });
    expect(history.json().items).toHaveLength(1);
    const invalid = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/strategy/unknown`,
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });
});
