// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserPlatformProfilesApi } from './api.js';
import { PlatformProfilePanel } from './platform-profile-panel.js';

const productId = '0198f0a0-0000-7000-8000-000000000001';
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
  window.history.replaceState(null, '', '/');
});

describe('PlatformProfilePanel', () => {
  it('restores platform from the URL and switches profiles without any AI request', async () => {
    window.history.replaceState(null, '', '/products/current?platform=taobao');
    const fetcher = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      const platformId = url.endsWith('/taobao') ? 'taobao' : 'pinduoduo';
      return new Response(JSON.stringify(profile(platformId)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <BrowserRouter>
          <PlatformProfilePanel
            api={createBrowserPlatformProfilesApi(fetcher as typeof fetch)}
            productId={productId}
          />
        </BrowserRouter>,
      ),
    );

    const selector = container.querySelector<HTMLSelectElement>('[aria-label="当前平台"]')!;
    expect(selector.value).toBe('taobao');
    expect(container.querySelector<HTMLInputElement>('[aria-label="平台标题"]')!.value).toBe(
      '淘宝标题',
    );

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(selector, 'pinduoduo');
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(new URL(window.location.href).searchParams.get('platform')).toBe('pinduoduo');
    expect(container.querySelector<HTMLInputElement>('[aria-label="平台标题"]')!.value).toBe(
      '拼多多标题',
    );
    const urls = fetcher.mock.calls.map(([request]) => String(request));
    expect(urls).toEqual([
      `/api/v1/products/${productId}/platform-profiles/taobao`,
      `/api/v1/products/${productId}/platform-profiles/pinduoduo`,
    ]);
    expect(urls.some((url) => /ai|generate/u.test(url))).toBe(false);
    root.unmount();
  });

  it('saves only the selected platform with its optimistic timestamp', async () => {
    window.history.replaceState(null, '', '/?platform=pinduoduo');
    const savedPayloads: unknown[] = [];
    const api = {
      async get() {
        return profile('pinduoduo');
      },
      async save(_productId: string, _platformId: string, input: unknown) {
        savedPayloads.push(input);
        return { ...profile('pinduoduo'), title: '更新标题' };
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <BrowserRouter>
          <PlatformProfilePanel api={api} productId={productId} />
        </BrowserRouter>,
      ),
    );
    const title = container.querySelector<HTMLInputElement>('[aria-label="平台标题"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(title, '更新标题');
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="保存平台档案"]')!.click(),
    );
    expect(savedPayloads).toEqual([
      expect.objectContaining({
        title: '更新标题',
        expectedUpdatedAt: '2026-08-20T00:00:00.000Z',
      }),
    ]);
    root.unmount();
  });
});

function profile(platformId: 'pinduoduo' | 'taobao') {
  return {
    id:
      platformId === 'pinduoduo'
        ? '0198f0a0-0000-7000-8000-000000000010'
        : '0198f0a0-0000-7000-8000-000000000011',
    productId,
    platformId,
    categoryCode: platformId === 'pinduoduo' ? 'pdd-100' : 'tb-200',
    categoryName: '杯具',
    externalProductId: null,
    title: platformId === 'pinduoduo' ? '拼多多标题' : '淘宝标题',
    description: null,
    metadata: {},
    status: 'ready' as const,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
}
