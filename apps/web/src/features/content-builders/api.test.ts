import { describe, expect, it, vi } from 'vitest';

import { createBrowserContentBuildersApi } from './api.js';

describe('browser content builders API', () => {
  it('does not declare JSON for bodyless content mutations', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ revision: {}, stale: false, staleReasons: [] }), {
          status: 200,
        }),
    );
    const api = createBrowserContentBuildersApi(fetcher);

    await api.generateCreative('product/id', 'pinduoduo');
    await api.regenerateCreativeItem('product/id', 'pinduoduo', 'item/id');
    await api.lockCreativeItem('product/id', 'pinduoduo', 'item/id');
    await api.generateDetail('product/id', 'pinduoduo');
    await api.lockDetailSection('product/id', 'pinduoduo', 'section/id');

    for (const [, init] of fetcher.mock.calls) {
      expect(init).toEqual({ method: 'POST' });
    }
  });

  it('sends JSON only for reorder mutations with a request body', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ revision: {}, stale: false, staleReasons: [] }), {
          status: 200,
        }),
    );
    const api = createBrowserContentBuildersApi(fetcher);

    await api.reorderCreative('product/id', 'taobao', ['one', 'two']);
    await api.reorderDetail('product/id', 'douyin', ['three', 'four']);

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/products/product/id/creative/reorder?platformId=taobao',
      '/api/v1/products/product/id/detail/reorder?platformId=douyin',
    ]);
    expect(fetcher.mock.calls.map(([, init]) => init)).toEqual([
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderedIds: ['one', 'two'] }),
      },
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderedIds: ['three', 'four'] }),
      },
    ]);
  });
});
