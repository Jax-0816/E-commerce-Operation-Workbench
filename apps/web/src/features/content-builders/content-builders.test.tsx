// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import type { ContentBuildersApi, CreativePlanView } from './api.js';
import { CreativeBuilder } from './creative-builder.js';

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
});

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
