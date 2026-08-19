import { describe, expect, it, vi } from 'vitest';

import { createBrowserSkusApi } from './api.js';

describe('browser SKU API', () => {
  it('sends only mutable SKU fields to the update endpoint', async () => {
    const fetcher = vi.fn(async () => new Response('{"dimensions":[],"skus":[]}'));
    const api = createBrowserSkusApi(fetcher as typeof fetch);
    await api.update('product-1', 'sku-1', {
      id: 'sku-1',
      signature: 'value-1',
      valueIds: ['value-1'],
      enabled: false,
      internalCode: 'RED-1',
      externalCode: null,
      barcode: null,
      weightGrams: 800,
    });
    expect(fetcher).toHaveBeenCalledWith('/api/v1/products/product-1/skus/sku-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enabled: false,
        internalCode: 'RED-1',
        externalCode: null,
        barcode: null,
        weightGrams: 800,
      }),
    });
  });
});
