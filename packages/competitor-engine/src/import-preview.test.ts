import { describe, expect, it } from 'vitest';

import { previewDelimitedImport } from './import-preview.js';

describe('competitor delimited import preview', () => {
  it('preserves source display text and normalizes price and approximate counts separately', () => {
    const preview = previewDelimitedImport({
      format: 'csv',
      content:
        '竞品名称,链接,价格,销量,评价,SKU,卖点,图片\n"杯子,A款",https://example.com/1,¥99.00,10万+,1.2万,"750ml|银色","304不锈钢|轻量",assets/competitors/1.webp',
    });

    expect(preview.valid).toBe(true);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      name: '杯子,A款',
      displayedPriceText: '¥99.00',
      normalizedPriceMinorUnits: '9900',
      displayedSalesText: '10万+',
      normalizedSales: { kind: 'lower_bound', value: '100000' },
      displayedReviewText: '1.2万',
      normalizedReviews: { kind: 'approximate', value: '12000' },
      skuTexts: ['750ml', '银色'],
      sellingPoints: ['304不锈钢', '轻量'],
    });
  });

  it('accepts pasted tabular data through the same preview model', () => {
    const preview = previewDelimitedImport({
      format: 'paste',
      content: 'name\tprice\tsales\n竞品 B\t88.5\t1234',
    });

    expect(preview.rows[0]).toMatchObject({
      name: '竞品 B',
      normalizedPriceMinorUnits: '8850',
      normalizedSales: { kind: 'exact', value: '1234' },
    });
  });

  it('returns field issues without silently accepting malformed rows', () => {
    const preview = previewDelimitedImport({
      format: 'csv',
      content: 'name,url,price,sales,images\n,not-a-url,free,unknown,../secret.png',
    });

    expect(preview.valid).toBe(false);
    expect(preview.rows).toHaveLength(0);
    expect(preview.issues.map(({ field }) => field)).toEqual([
      'name',
      'sourceUrl',
      'displayedPriceText',
      'displayedSalesText',
      'imageReferences',
    ]);
  });

  it('rejects duplicate or unknown headers and oversized input', () => {
    expect(() => previewDelimitedImport({ format: 'csv', content: 'name,name\nA,B' })).toThrow(
      /header/i,
    );
    expect(() =>
      previewDelimitedImport({ format: 'csv', content: 'name,script\nA,alert(1)' }),
    ).toThrow(/header/i);
    expect(() =>
      previewDelimitedImport({ format: 'paste', content: `name\n${'a'.repeat(1_000_001)}` }),
    ).toThrow(/size/i);
  });
});
