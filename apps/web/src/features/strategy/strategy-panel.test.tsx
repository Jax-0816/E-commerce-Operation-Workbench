// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { StrategyApi, StrategyAssetItem } from './api.js';
import { StrategyPanel } from './strategy-panel.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('StrategyPanel', () => {
  it('shows evidence, limitations and unsupported ideas as suggested facts', async () => {
    let items: StrategyAssetItem[] = [];
    const api: StrategyApi = {
      async list() {
        return items;
      },
      async generate(productId, kind) {
        const asset: StrategyAssetItem = {
          id: 'a',
          productId,
          kind,
          revisionNo: 1,
          generationId: 'g',
          status: 'needs_review',
          supersedesAssetId: null,
          createdAt: '2026-09-04T00:00:00.000Z',
          payload: {
            productId,
            sellingPoints: [],
            suggestedFacts: [{ label: '24 小时保温', reason: '需要检测报告', evidenceRefs: [] }],
            limitations: ['竞品样本有限'],
          },
        };
        items = [asset];
        return asset;
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<StrategyPanel api={api} productId="product" kinds={['selling_point_set']} />);
    });

    const button = container.querySelector('button');
    await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.textContent).toContain('24 小时保温');
    expect(container.textContent).toContain('需要人工复核');
    expect(container.textContent).toContain('竞品样本有限');
    root.unmount();
  });
});
