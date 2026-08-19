import { describe, expect, it } from 'vitest';

import { ConfigureSkusInputSchema, SkuMatrixResponseSchema, UpdateSkuInputSchema } from './skus.js';

const id = '0198f0a0-0000-7000-8000-000000000001';

describe('SKU contracts', () => {
  it('accepts configuration and rejects unknown or blank input fields', () => {
    expect(
      ConfigureSkusInputSchema.parse({ dimensions: [{ name: '颜色', values: ['红', '蓝'] }] }),
    ).toMatchObject({ dimensions: [{ name: '颜色' }] });
    expect(() =>
      ConfigureSkusInputSchema.parse({
        dimensions: [{ name: '颜色', values: ['红'], persistenceOnly: true }],
      }),
    ).toThrow();
    expect(() =>
      UpdateSkuInputSchema.parse({
        enabled: true,
        internalCode: '',
        externalCode: null,
        barcode: null,
        weightGrams: null,
      }),
    ).toThrow();
  });

  it('strictly filters unknown nested response data', () => {
    const response = {
      dimensions: [
        {
          id,
          name: '颜色',
          position: 0,
          values: [{ id, label: '红', position: 0, databaseOnly: true }],
        },
      ],
      skus: [],
    };
    expect(SkuMatrixResponseSchema.safeParse(response).success).toBe(false);
  });
});
