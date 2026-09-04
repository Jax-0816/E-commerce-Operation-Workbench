// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { CompetitorImportPreviewResponse, CompetitorListItemResponse } from './api.js';
import { CompetitorImportPanel } from './competitor-import-panel.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('CompetitorImportPanel', () => {
  it('previews source text before confirmation and reloads the immutable ledger', async () => {
    let items: readonly CompetitorListItemResponse[] = [];
    const preview = fixturePreview();
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CompetitorImportPanel
          api={{
            previewText: async () => preview,
            previewFile: async () => preview,
            confirm: async () => {
              items = [fixtureItem()];
              return items;
            },
            list: async () => items,
          }}
          productId={preview.productId}
        />,
      );
    });

    await click(container, '预览粘贴数据');
    expect(container.querySelector('[aria-label="竞品导入预览"]')?.textContent).toContain('10万+');
    expect(container.textContent).toContain('预览通过：1 条');

    await click(container, '确认导入');
    expect(container.textContent).toContain('导入已确认，快照已锁定');
    expect(container.querySelector('.competitor-ledger')?.textContent).toContain('竞品 A');
    expect(container.querySelector('.competitor-ledger')?.textContent).toContain('10万+');
    root.unmount();
  });
});

async function click(container: HTMLElement, label: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function fixturePreview(): CompetitorImportPreviewResponse {
  return {
    productId: '0198f0a0-0000-7000-8000-000000000001',
    format: 'paste',
    sourceName: '粘贴导入',
    valid: true,
    issues: [],
    rows: [
      {
        rowNumber: 2,
        name: '竞品 A',
        sourceUrl: null,
        displayedPriceText: '¥99',
        normalizedPriceMinorUnits: '9900',
        displayedSalesText: '10万+',
        normalizedSales: { kind: 'lower_bound', value: '100000' },
        displayedReviewText: null,
        normalizedReviews: null,
        skuTexts: [],
        sellingPoints: ['304不锈钢'],
        imageReferences: [],
        capturedAtText: null,
        rawPayload: { sales: '10万+' },
      },
    ],
  };
}

function fixtureItem(): CompetitorListItemResponse {
  const row = fixturePreview().rows[0]!;
  return {
    competitor: {
      id: '0198f0a0-0000-7000-8000-000000000002',
      productId: fixturePreview().productId,
      name: row.name,
      sourceUrl: null,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
      archivedAt: null,
    },
    latestSnapshot: {
      ...row,
      id: '0198f0a0-0000-7000-8000-000000000003',
      competitorId: '0198f0a0-0000-7000-8000-000000000002',
      productId: fixturePreview().productId,
      importBatchId: '0198f0a0-0000-7000-8000-000000000004',
      source: 'paste',
      capturedAt: '2026-09-04T00:00:00.000Z',
      importedAt: '2026-09-04T00:00:00.000Z',
    },
  };
}
