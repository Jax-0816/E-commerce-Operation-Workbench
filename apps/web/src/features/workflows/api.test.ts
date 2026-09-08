import { describe, expect, it, vi } from 'vitest';

import { createBrowserWorkflowApi } from './api.js';

describe('browser workflow API', () => {
  it('uses strict workflow endpoints and carries the revision guard', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    const api = createBrowserWorkflowApi(fetcher, () => undefined as never);

    await api.preflight('product/id', 'taobao');
    await api.resume('run/id', 7);
    await api.retry('run/id', 'creative', 8);

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/products/product%2Fid/workflows/preflight',
      '/api/v1/workflows/run%2Fid/resume',
      '/api/v1/workflows/run%2Fid/nodes/creative/retry',
    ]);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ expectedRevision: 7 }));
  });

  it('subscribes to typed SSE events and exposes explicit cleanup', () => {
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();
    let closed = 0;
    let sourceUrl = '';
    const api = createBrowserWorkflowApi(vi.fn() as never, (url) => {
      sourceUrl = url;
      return {
        addEventListener: (type, listener) => listeners.set(type, listener),
        close: () => { closed += 1; },
        onerror: null,
      };
    });
    const events: unknown[] = [];
    const dispose = api.subscribe('run/id', 12, (event) => events.push(event), () => undefined);
    listeners.get('node_completed')?.({ data: JSON.stringify({ sequence: 13 }) } as MessageEvent<string>);

    expect(sourceUrl).toBe('/api/v1/workflows/run%2Fid/events?afterSequence=12');
    expect(events).toEqual([{ sequence: 13 }]);
    dispose();
    expect(closed).toBe(1);
  });
});
