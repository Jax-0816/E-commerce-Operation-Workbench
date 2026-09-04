import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '../ids.js';
import { createCompetitor, createCompetitorSnapshot } from './competitor.js';

describe('competitor identity and snapshots', () => {
  it('keeps displayed counts as source text while storing normalization separately', () => {
    const productId = createUuidV7();
    const competitor = createCompetitor({
      id: createUuidV7(),
      productId,
      name: ' 竞品保温杯 ',
      sourceUrl: 'https://example.com/item/1',
      now: new Date('2026-09-03T00:00:00.000Z'),
    });
    const snapshot = createCompetitorSnapshot({
      id: createUuidV7(),
      competitorId: competitor.id,
      productId,
      importBatchId: createUuidV7(),
      source: 'csv',
      sourceUrl: competitor.sourceUrl,
      displayedPriceText: '¥99.00',
      normalizedPriceMinorUnits: '9900',
      displayedSalesText: '10万+',
      normalizedSales: { kind: 'lower_bound', value: '100000' },
      displayedReviewText: '1.2万',
      normalizedReviews: { kind: 'approximate', value: '12000' },
      skuTexts: ['750ml / 银色'],
      sellingPoints: ['304 不锈钢'],
      imageReferences: ['assets/competitors/item-1.webp'],
      rawPayload: { sales: '10万+' },
      capturedAt: new Date('2026-09-02T12:00:00.000Z'),
      importedAt: new Date('2026-09-03T00:00:01.000Z'),
    });

    expect(competitor.name).toBe('竞品保温杯');
    expect(snapshot.displayedSalesText).toBe('10万+');
    expect(snapshot.normalizedSales).toEqual({ kind: 'lower_bound', value: '100000' });
  });

  it('detaches and deeply freezes captured arrays and raw payloads', () => {
    const productId = createUuidV7();
    const sellingPoints = ['轻量'];
    const rawPayload = { nested: { sales: '10万+' } };
    const snapshot = createCompetitorSnapshot({
      id: createUuidV7(),
      competitorId: createUuidV7(),
      productId,
      importBatchId: createUuidV7(),
      source: 'paste',
      sourceUrl: null,
      displayedPriceText: null,
      normalizedPriceMinorUnits: null,
      displayedSalesText: '10万+',
      normalizedSales: { kind: 'lower_bound', value: '100000' },
      displayedReviewText: null,
      normalizedReviews: null,
      skuTexts: [],
      sellingPoints,
      imageReferences: [],
      rawPayload,
      capturedAt: new Date('2026-09-02T12:00:00.000Z'),
      importedAt: new Date('2026-09-03T00:00:01.000Z'),
    });

    sellingPoints[0] = 'changed';
    rawPayload.nested.sales = 'changed';

    expect(snapshot.sellingPoints).toEqual(['轻量']);
    expect(snapshot.rawPayload).toEqual({ nested: { sales: '10万+' } });
    expect(
      () => ((snapshot.rawPayload as { nested: { sales: string } }).nested.sales = 'x'),
    ).toThrow();
  });

  it('rejects malformed metrics, unsafe asset paths and mismatched product ownership', () => {
    const base = {
      id: createUuidV7(),
      competitorId: createUuidV7(),
      productId: createUuidV7(),
      importBatchId: createUuidV7(),
      source: 'xlsx' as const,
      sourceUrl: null,
      displayedPriceText: null,
      normalizedPriceMinorUnits: null,
      displayedSalesText: '10万+',
      normalizedSales: { kind: 'lower_bound' as const, value: 'not-a-number' },
      displayedReviewText: null,
      normalizedReviews: null,
      skuTexts: [],
      sellingPoints: [],
      imageReferences: ['../secret.txt'],
      rawPayload: {},
      capturedAt: new Date('2026-09-02T12:00:00.000Z'),
      importedAt: new Date('2026-09-03T00:00:01.000Z'),
    };

    expect(() => createCompetitorSnapshot(base)).toThrow(/competitor snapshot/i);
    expect(() =>
      createCompetitorSnapshot({
        ...base,
        normalizedSales: { kind: 'lower_bound', value: '100000' },
        imageReferences: [],
        expectedProductId: createUuidV7(),
      }),
    ).toThrow(/product/i);
  });
});
