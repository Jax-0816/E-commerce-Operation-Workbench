import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { previewXlsxImport } from './xlsx-preview.js';

describe('competitor XLSX import preview', () => {
  it('reads the first worksheet through the same normalized preview contract', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('竞品');
    worksheet.addRow(['竞品名称', '价格', '销量', '卖点']);
    worksheet.addRow(['竞品 C', 79.9, '10万+', '304不锈钢|轻量']);
    const bytes = await workbook.xlsx.writeBuffer();

    const preview = await previewXlsxImport(new Uint8Array(bytes));

    expect(preview.valid).toBe(true);
    expect(preview.rows[0]).toMatchObject({
      name: '竞品 C',
      displayedPriceText: '79.9',
      normalizedPriceMinorUnits: '7990',
      displayedSalesText: '10万+',
      normalizedSales: { kind: 'lower_bound', value: '100000' },
    });
  });

  it('rejects malformed, empty and oversized workbook payloads', async () => {
    await expect(previewXlsxImport(new Uint8Array())).rejects.toThrow(/xlsx/i);
    await expect(previewXlsxImport(new TextEncoder().encode('not a workbook'))).rejects.toThrow(
      /xlsx/i,
    );
    await expect(previewXlsxImport(new Uint8Array(5_000_001))).rejects.toThrow(/size/i);
  });
});
