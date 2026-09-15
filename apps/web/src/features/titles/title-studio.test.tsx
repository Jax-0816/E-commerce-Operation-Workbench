// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import {
  ConnectivityProvider,
  type ConnectivitySource,
} from '../connectivity/connectivity-provider.js';
import type { TitleAssetView, TitlesApi } from './api.js';
import { TitleStudio } from './title-studio.js';

describe('TitleStudio', () => {
  it('shows revisions, review reasons and lock actions', async () => {
    let items: TitleAssetView[] = [];
    const candidate = (variant: 'recommended' | 'search' | 'selling_point' | 'scenario') => ({
      variant,
      text: `${variant}标题`,
      keywords: [],
      claims: [],
      reviewTerms: ['待核实词'],
    });
    const api: TitlesApi = {
      async list() {
        return items;
      },
      async generate() {
        const view = {
          revision: {
            id: 'r1',
            revisionNo: 1,
            origin: 'generated' as const,
            status: 'needs_review' as const,
            locked: false,
            titles: [
              candidate('recommended'),
              candidate('search'),
              candidate('selling_point'),
              candidate('scenario'),
            ],
            validationIssues: [
              { candidateIndex: 0, code: 'review_term', detail: '词语需要人工核实：待核实词' },
            ],
            createdAt: new Date().toISOString(),
          },
          stale: false,
          staleReasons: [],
        };
        items = [view];
        return view;
      },
      async edit() {
        return items[0]!;
      },
      async lock() {
        return items[0]!;
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TitleStudio api={api} productId="p" />));
    const button = [...container.querySelectorAll('button')].find(
      ({ textContent }) => textContent === '生成四类标题',
    );
    await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('修订 1');
    expect(container.textContent).toContain('词语需要人工核实');
    expect(container.textContent).toContain('锁定当前修订');
    root.unmount();
    container.remove();
  });

  it('blocks generation but keeps local editing and locking available offline', async () => {
    const item = titleView();
    const calls: string[] = [];
    const api: TitlesApi = {
      async list() {
        return [item];
      },
      async generate() {
        calls.push('generate');
        return item;
      },
      async edit() {
        calls.push('edit');
        return item;
      },
      async lock() {
        calls.push('lock');
        return item;
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <ConnectivityProvider source={offlineSource}>
          <TitleStudio api={api} productId="p" />
        </ConnectivityProvider>,
      ),
    );
    await act(async () => undefined);

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[1]?.disabled).toBe(false);
    expect(buttons[2]?.disabled).toBe(false);
    await act(async () => buttons[0]?.click());
    await act(async () => buttons[1]?.click());
    await act(async () => buttons[2]?.click());
    expect(calls).toEqual(['edit', 'lock']);
    root.unmount();
    container.remove();
  });
});

const offlineSource: ConnectivitySource = {
  isOnline: () => false,
  subscribe: () => () => undefined,
};

function titleView(): TitleAssetView {
  const variants = ['recommended', 'search', 'selling_point', 'scenario'] as const;
  return {
    revision: {
      id: 'offline-title',
      revisionNo: 1,
      origin: 'generated',
      status: 'verified',
      locked: false,
      titles: variants.map((variant) => ({
        variant,
        text: `${variant} title`,
        keywords: [],
        claims: [],
        reviewTerms: [],
      })),
      validationIssues: [],
      createdAt: '2026-09-15T00:00:00.000Z',
    },
    stale: false,
    staleReasons: [],
  };
}
