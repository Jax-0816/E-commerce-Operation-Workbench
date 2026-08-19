import { describe, expect, it } from 'vitest';

import type { ConfigureDimensionInput, SkusApplication, UpdateSkuInput } from '@eaw/application';
import {
  parseUuidV7,
  type SkuCombination,
  type SkuMatrix,
  type SpecificationDimension,
} from '@eaw/domain';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const productId = '0198f0a0-0000-7000-8000-000000000001';
const dimensionId = '0198f0a0-0000-7000-8000-000000000002';
const valueId = '0198f0a0-0000-7000-8000-000000000003';
const skuId = '0198f0a0-0000-7000-8000-000000000004';

describe('SKU HTTP contract', () => {
  it('maps get/configure/update without leaking product ownership fields', async () => {
    const skus = new RecordingSkusApplication();
    const app = buildApp(createAppContext({ skus }));

    const configured = await app.inject({
      method: 'PUT',
      url: `/api/v1/products/${productId}/skus`,
      payload: { dimensions: [{ name: '颜色', values: ['红'] }] },
    });
    expect(configured.statusCode).toBe(200);
    expect(skus.configured).toEqual([{ name: '颜色', values: ['红'] }]);
    expect(configured.json()).not.toHaveProperty('productId');
    expect(configured.json().skus[0]).not.toHaveProperty('productId');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${productId}/skus/${skuId}`,
      payload: {
        enabled: false,
        internalCode: 'RED-1',
        externalCode: null,
        barcode: null,
        weightGrams: 800,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(skus.updated).toMatchObject({ enabled: false, internalCode: 'RED-1', weightGrams: 800 });

    const fetched = await app.inject({ method: 'GET', url: `/api/v1/products/${productId}/skus` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(updated.json());
    await app.close();
  });

  it('rejects invalid updates before calling the use case', async () => {
    const skus = new RecordingSkusApplication();
    const app = buildApp(createAppContext({ skus }));
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${productId}/skus/${skuId}`,
      payload: {
        enabled: true,
        internalCode: '',
        externalCode: null,
        barcode: null,
        weightGrams: -1,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(skus.updateCalls).toBe(0);
    await app.close();
  });
});

class RecordingSkusApplication implements SkusApplication {
  configured: readonly ConfigureDimensionInput[] | undefined;
  updated: UpdateSkuInput | undefined;
  updateCalls = 0;
  private enabled = true;

  async get(): Promise<SkuMatrix> {
    return matrix(this.enabled);
  }
  async configure(_productId: string, dimensions: readonly ConfigureDimensionInput[]) {
    this.configured = dimensions;
    return matrix(this.enabled);
  }
  async update(_productId: string, _skuId: string, input: UpdateSkuInput) {
    this.updateCalls += 1;
    this.updated = input;
    this.enabled = input.enabled;
    return matrix(this.enabled).skus[0]!;
  }
}

function matrix(enabled: boolean): SkuMatrix {
  const dimensions: readonly SpecificationDimension[] = [
    {
      id: parseUuidV7(dimensionId),
      productId: parseUuidV7(productId),
      name: '颜色',
      position: 0,
      values: [
        {
          id: parseUuidV7(valueId),
          dimensionId: parseUuidV7(dimensionId),
          label: '红',
          position: 0,
        },
      ],
    },
  ];
  const skus: readonly SkuCombination[] = [
    {
      id: parseUuidV7(skuId),
      productId: parseUuidV7(productId),
      signature: valueId,
      valueIds: [parseUuidV7(valueId)],
      enabled,
      internalCode: enabled ? null : 'RED-1',
      externalCode: null,
      barcode: null,
      weightGrams: enabled ? null : 800,
    },
  ];
  return { dimensions, skus };
}
