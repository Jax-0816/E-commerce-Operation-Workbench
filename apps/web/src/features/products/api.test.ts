import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserProductsApi } from './api.js';

afterEach(() => vi.unstubAllGlobals());

describe('browser products API', () => {
  it('archives a product through the public endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await createBrowserProductsApi().archive('0198f0a0-0000-7000-8000-000000000001');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/products/0198f0a0-0000-7000-8000-000000000001/archive',
      { method: 'POST' },
    );
  });
});
