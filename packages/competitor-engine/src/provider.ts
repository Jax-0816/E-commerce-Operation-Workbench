import {
  previewDelimitedImport,
  type CompetitorImportPreview,
  type DelimitedImportFormat,
} from './import-preview.js';
import { previewXlsxImport } from './xlsx-preview.js';

export type CompetitorDataProviderInput =
  | {
      readonly format: DelimitedImportFormat;
      readonly content: string;
    }
  | {
      readonly format: 'xlsx';
      readonly content: Uint8Array;
    };

export interface CompetitorDataProvider {
  preview(input: CompetitorDataProviderInput): Promise<CompetitorImportPreview>;
}

export function createLocalCompetitorDataProvider(): CompetitorDataProvider {
  return {
    async preview(input) {
      return input.format === 'xlsx'
        ? previewXlsxImport(input.content)
        : previewDelimitedImport(input);
    },
  };
}
