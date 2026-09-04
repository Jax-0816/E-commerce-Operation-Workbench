import { DomainError } from '@eaw/domain';
import ExcelJS from 'exceljs';

import { previewTabularRecords, type CompetitorImportPreview } from './import-preview.js';

const MAX_XLSX_BYTES = 5_000_000;

export async function previewXlsxImport(content: Uint8Array): Promise<CompetitorImportPreview> {
  if (content.length === 0 || content.length > MAX_XLSX_BYTES) {
    throw new DomainError('VALIDATION_ERROR', 'Competitor XLSX size is invalid.');
  }
  try {
    const workbook = new ExcelJS.Workbook();
    const bytes = Buffer.from(content) as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(bytes, {
      ignoreNodes: [
        'dataValidations',
        'extLst',
        'headerFooter',
        'hyperlinks',
        'mergeCells',
        'pageMargins',
        'pageSetup',
        'printOptions',
      ],
    });
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount === 0 || worksheet.rowCount > 1_001) {
      throw invalidXlsx();
    }
    const records: string[][] = [];
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      if (row.cellCount > 20) throw invalidXlsx();
      const values: string[] = [];
      for (let column = 1; column <= row.cellCount; column += 1) {
        values.push(row.getCell(column).text);
      }
      records.push(values);
    }
    return previewTabularRecords(records);
  } catch (error) {
    if (error instanceof DomainError && error.message.includes('size')) throw error;
    throw invalidXlsx();
  }
}

function invalidXlsx(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Competitor XLSX is invalid.');
}
