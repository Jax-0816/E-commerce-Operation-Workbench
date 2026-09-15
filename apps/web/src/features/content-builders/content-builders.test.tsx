// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import {
  ConnectivityProvider,
  type ConnectivitySource,
} from '../connectivity/connectivity-provider.js';
import type { ContentBuildersApi, CreativePlanView, DetailPageView } from './api.js';
import { CreativeBuilder } from './creative-builder.js';
import { DetailBuilder } from './detail-builder.js';

describe('creative builder', () => {
  it('renders a five-image plan without offering image generation', async () => {
    const view = creativeView();
    const api = {
      async listCreative() {
        return [];
      },
      async generateCreative() {
        return view;
      },
      async regenerateCreativeItem() {
        return view;
      },
      async lockCreativeItem() {
        return view;
      },
      async reorderCreative() {
        return view;
      },
      async listDetail() {
        return [];
      },
      async generateDetail() {
        throw new Error('unused');
      },
      async lockDetailSection() {
        throw new Error('unused');
      },
      async reorderDetail() {
        throw new Error('unused');
      },
    } satisfies ContentBuildersApi;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<CreativeBuilder api={api} productId="product" />));
    const button = [...container.querySelectorAll('button')].find(
      ({ textContent }) => textContent === '生成五图方案',
    );
    await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.querySelectorAll('[data-testid="creative-item"]')).toHaveLength(5);
    expect(container.textContent).not.toContain('生成图片');
    expect(container.textContent).toContain('English prompt');
    root.unmount();
    container.remove();
  });

  it('blocks AI generation but keeps creative lock and reorder available offline', async () => {
    const view = creativeView();
    const calls: string[] = [];
    const api = contentApi({
      listCreative: async () => [view],
      generateCreative: async () => {
        calls.push('generate');
        return view;
      },
      regenerateCreativeItem: async () => {
        calls.push('regenerate');
        return view;
      },
      lockCreativeItem: async () => {
        calls.push('lock');
        return view;
      },
      reorderCreative: async () => {
        calls.push('reorder');
        return view;
      },
    });
    const { container, root } = await renderOffline(
      <CreativeBuilder api={api} productId="product" />,
    );

    const button = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        ({ textContent }) => textContent === label,
      )!;
    expect(button('重新生成方案').disabled).toBe(true);
    expect(button('重新生成此项').disabled).toBe(true);
    expect(button('锁定此项').disabled).toBe(false);
    expect(button('下移').disabled).toBe(false);
    await act(async () => button('重新生成方案').click());
    await act(async () => button('重新生成此项').click());
    await act(async () => button('锁定此项').click());
    await act(async () => button('下移').click());
    expect(calls).toEqual(['lock', 'reorder']);
    root.unmount();
    container.remove();
  });

  it('blocks detail generation but keeps detail lock and reorder available offline', async () => {
    const view = detailView();
    const calls: string[] = [];
    const api = contentApi({
      listDetail: async () => [view],
      generateDetail: async () => {
        calls.push('generate');
        return view;
      },
      lockDetailSection: async () => {
        calls.push('lock');
        return view;
      },
      reorderDetail: async () => {
        calls.push('reorder');
        return view;
      },
    });
    const { container, root } = await renderOffline(
      <DetailBuilder api={api} productId="product" />,
    );

    const button = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        ({ textContent }) => textContent === label,
      )!;
    expect(button('重新生成架构').disabled).toBe(true);
    expect(button('锁定区块').disabled).toBe(false);
    expect(button('下移').disabled).toBe(false);
    await act(async () => button('重新生成架构').click());
    await act(async () => button('锁定区块').click());
    await act(async () => button('下移').click());
    expect(calls).toEqual(['lock', 'reorder']);
    root.unmount();
    container.remove();
  });
});

const offlineSource: ConnectivitySource = {
  isOnline: () => false,
  subscribe: () => () => undefined,
};

async function renderOffline(element: React.JSX.Element) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<ConnectivityProvider source={offlineSource}>{element}</ConnectivityProvider>),
  );
  await act(async () => undefined);
  return { container, root };
}

function contentApi(overrides: Partial<ContentBuildersApi>): ContentBuildersApi {
  const unavailable = async () => {
    throw new Error('unused');
  };
  return {
    listCreative: async () => [],
    generateCreative: unavailable,
    regenerateCreativeItem: unavailable,
    lockCreativeItem: unavailable,
    reorderCreative: unavailable,
    listDetail: async () => [],
    generateDetail: unavailable,
    lockDetailSection: unavailable,
    reorderDetail: unavailable,
    ...overrides,
  } as ContentBuildersApi;
}

function creativeView(): CreativePlanView {
  return {
    revision: {
      id: 'r',
      lineageId: 'l',
      productId: 'p',
      platformId: 'pinduoduo',
      revisionNo: 1,
      origin: 'generated',
      status: 'needs_review',
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `i-${index}`,
        order: index + 1,
        role: index === 0 ? 'hero' : 'supporting',
        headline: `图 ${index + 1}`,
        body: '说明',
        promptZh: '中文提示',
        promptEn: 'English prompt',
        negativePromptZh: '中文负面',
        negativePromptEn: 'English negative',
        evidenceRefs: [],
        reviewTerms: ['待核实'],
        locked: false,
      })),
      dependencyHashes: {},
      validationIssues: [],
      generationId: null,
      supersedesRevisionId: null,
      createdAt: new Date().toISOString(),
    },
    stale: false,
    staleReasons: [],
  };
}

function detailView(): DetailPageView {
  return {
    revision: {
      id: 'detail',
      revisionNo: 1,
      origin: 'generated',
      status: 'verified',
      sections: [
        {
          id: 'detail-1',
          order: 1,
          kind: 'hero',
          headline: '首屏',
          body: '说明',
          evidenceRefs: [],
          reviewTerms: [],
          locked: false,
        },
        {
          id: 'detail-2',
          order: 2,
          kind: 'benefit',
          headline: '卖点',
          body: '说明',
          evidenceRefs: [],
          reviewTerms: [],
          locked: false,
        },
      ],
      createdAt: '2026-09-15T00:00:00.000Z',
    },
    stale: false,
    staleReasons: [],
  };
}
