import { describe, expect, it, vi } from 'vitest';

import { createBrowserOperationPlansApi } from './api.js';

describe('browser operation plans API', () => {
  it('uses encoded operation-plan endpoints and exact mutation guards', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    const api = createBrowserOperationPlansApi(fetcher);
    const createInput = {
      workflowRunId: 'workflow/id',
      pricingRecordId: 'pricing/id',
      promotionScenarioId: 'promotion/id',
      promotionResultIds: ['result/one', 'result/two'],
    };

    await api.create('product/id', createInput);
    await api.list('product/id');
    await api.get('plan/id');
    await api.lock('plan/id', 7);

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/products/product%2Fid/operation-plans',
      '/api/v1/products/product%2Fid/operation-plans',
      '/api/v1/operation-plans/plan%2Fid',
      '/api/v1/operation-plans/plan%2Fid/lock',
    ]);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createInput),
    });
    expect(fetcher.mock.calls[3]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ expectedRevisionNo: 7 }),
    });
  });

  it('unwraps history items and reports server failures', async () => {
    const item = { id: 'plan-id' };
    const successfulFetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ items: [item] }), { status: 200 }),
    );

    await expect(
      createBrowserOperationPlansApi(successfulFetcher).list('product-id'),
    ).resolves.toEqual([item]);

    const failingFetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ error: 'conflict' }), { status: 409 }),
    );
    await expect(createBrowserOperationPlansApi(failingFetcher).lock('plan-id', 1)).rejects.toThrow(
      '运营方案请求失败',
    );
  });
});
