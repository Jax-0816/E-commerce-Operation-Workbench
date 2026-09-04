import { DomainError, type NormalizedCount } from '@eaw/domain';

export type DelimitedImportFormat = 'csv' | 'paste';

export interface CompetitorImportIssue {
  readonly rowNumber: number;
  readonly field: string;
  readonly code: 'invalid' | 'required';
}

export interface CompetitorImportPreviewRow {
  readonly rowNumber: number;
  readonly name: string;
  readonly sourceUrl: string | null;
  readonly displayedPriceText: string | null;
  readonly normalizedPriceMinorUnits: string | null;
  readonly displayedSalesText: string | null;
  readonly normalizedSales: NormalizedCount | null;
  readonly displayedReviewText: string | null;
  readonly normalizedReviews: NormalizedCount | null;
  readonly skuTexts: readonly string[];
  readonly sellingPoints: readonly string[];
  readonly imageReferences: readonly string[];
  readonly capturedAtText: string | null;
  readonly rawPayload: Readonly<Record<string, string>>;
}

export interface CompetitorImportPreview {
  readonly valid: boolean;
  readonly rows: readonly CompetitorImportPreviewRow[];
  readonly issues: readonly CompetitorImportIssue[];
}

type Field =
  | 'name'
  | 'sourceUrl'
  | 'displayedPriceText'
  | 'displayedSalesText'
  | 'displayedReviewText'
  | 'skuTexts'
  | 'sellingPoints'
  | 'imageReferences'
  | 'capturedAtText';

const aliases = new Map<string, Field>([
  ['name', 'name'],
  ['competitor_name', 'name'],
  ['竞品名称', 'name'],
  ['url', 'sourceUrl'],
  ['source_url', 'sourceUrl'],
  ['链接', 'sourceUrl'],
  ['price', 'displayedPriceText'],
  ['价格', 'displayedPriceText'],
  ['sales', 'displayedSalesText'],
  ['销量', 'displayedSalesText'],
  ['reviews', 'displayedReviewText'],
  ['review', 'displayedReviewText'],
  ['评价', 'displayedReviewText'],
  ['sku', 'skuTexts'],
  ['skus', 'skuTexts'],
  ['卖点', 'sellingPoints'],
  ['selling_points', 'sellingPoints'],
  ['images', 'imageReferences'],
  ['图片', 'imageReferences'],
  ['captured_at', 'capturedAtText'],
  ['采集时间', 'capturedAtText'],
]);

export function previewDelimitedImport(input: {
  readonly format: DelimitedImportFormat;
  readonly content: string;
}): CompetitorImportPreview {
  if (input.content.length === 0 || input.content.length > 1_000_000) {
    throw new DomainError('VALIDATION_ERROR', 'Competitor import size is invalid.');
  }
  const delimiter = input.format === 'csv' ? ',' : '\t';
  const records = parseDelimited(input.content, delimiter);
  return previewTabularRecords(records);
}

export function previewTabularRecords(
  records: readonly (readonly string[])[],
): CompetitorImportPreview {
  if (records.length === 0) throw invalidHeaders();
  if (records.length > 1_001 || records.some((row) => row.length > 20)) {
    throw new DomainError('VALIDATION_ERROR', 'Competitor import size is invalid.');
  }
  const fields = parseHeaders(records[0] ?? []);
  const rows: CompetitorImportPreviewRow[] = [];
  const issues: CompetitorImportIssue[] = [];
  for (const [index, record] of records.slice(1).entries()) {
    if (record.every((value) => value.trim() === '')) continue;
    const rowNumber = index + 2;
    const raw = Object.fromEntries(
      fields.map(({ source }, column) => [source, record[column] ?? '']),
    );
    const values = Object.fromEntries(
      fields.map(({ field }, column) => [field, (record[column] ?? '').trim()]),
    ) as Partial<Record<Field, string>>;
    const rowIssues = validateRow(values, rowNumber);
    issues.push(...rowIssues);
    if (rowIssues.length > 0) continue;
    rows.push(
      Object.freeze({
        rowNumber,
        name: values.name!,
        sourceUrl: nullable(values.sourceUrl),
        displayedPriceText: nullable(values.displayedPriceText),
        normalizedPriceMinorUnits: normalizePrice(values.displayedPriceText ?? ''),
        displayedSalesText: nullable(values.displayedSalesText),
        normalizedSales: normalizeCount(values.displayedSalesText ?? ''),
        displayedReviewText: nullable(values.displayedReviewText),
        normalizedReviews: normalizeCount(values.displayedReviewText ?? ''),
        skuTexts: splitList(values.skuTexts ?? ''),
        sellingPoints: splitList(values.sellingPoints ?? ''),
        imageReferences: splitList(values.imageReferences ?? ''),
        capturedAtText: nullable(values.capturedAtText),
        rawPayload: Object.freeze(raw),
      }),
    );
  }
  if (rows.length === 0 && issues.length === 0) {
    issues.push({ rowNumber: 1, field: 'rows', code: 'required' });
  }
  return Object.freeze({ valid: issues.length === 0, rows, issues });
}

function parseHeaders(headers: readonly string[]) {
  if (headers.length === 0 || headers.length > 20) throw invalidHeaders();
  const seen = new Set<Field>();
  const parsed = headers.map((header) => {
    const source = header.trim();
    const field = aliases.get(source.toLocaleLowerCase('en-US'));
    if (field === undefined || seen.has(field)) throw invalidHeaders();
    seen.add(field);
    return { field, source };
  });
  if (!seen.has('name')) throw invalidHeaders();
  return parsed;
}

function validateRow(values: Partial<Record<Field, string>>, rowNumber: number) {
  const issues: CompetitorImportIssue[] = [];
  const issue = (field: string, code: CompetitorImportIssue['code']) =>
    issues.push({ rowNumber, field, code });
  if (!values.name || values.name.length > 160) issue('name', 'required');
  if (values.sourceUrl && !isHttpUrl(values.sourceUrl)) issue('sourceUrl', 'invalid');
  if (values.displayedPriceText && normalizePrice(values.displayedPriceText) === null) {
    issue('displayedPriceText', 'invalid');
  }
  if (values.displayedSalesText && normalizeCount(values.displayedSalesText) === null) {
    issue('displayedSalesText', 'invalid');
  }
  if (values.displayedReviewText && normalizeCount(values.displayedReviewText) === null) {
    issue('displayedReviewText', 'invalid');
  }
  if (
    splitList(values.imageReferences ?? '').some(
      (value) =>
        !value.startsWith('assets/competitors/') || value.includes('..') || value.includes('\\'),
    )
  ) {
    issue('imageReferences', 'invalid');
  }
  if (values.capturedAtText && !Number.isSafeInteger(new Date(values.capturedAtText).getTime())) {
    issue('capturedAtText', 'invalid');
  }
  return issues;
}

function normalizePrice(value: string): string | null {
  if (!value) return null;
  const compact = value.replace(/[\s,¥￥]/gu, '').replace(/^CNY/iu, '');
  const match = /^(0|[1-9][0-9]{0,27})(?:\.([0-9]{1,2}))?$/u.exec(compact);
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return (BigInt(match[1]!) * 100n + BigInt(fraction || '0')).toString();
}

function normalizeCount(value: string): NormalizedCount | null {
  if (!value) return null;
  const match = /^([0-9]+)(?:\.([0-9]+))?\s*(万|亿)?\s*(\+)?$/u.exec(value.trim());
  if (!match) return null;
  const multiplier = match[3] === '亿' ? 100_000_000n : match[3] === '万' ? 10_000n : 1n;
  const fraction = match[2] ?? '';
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(`${match[1]}${fraction}`) * multiplier;
  if (numerator % denominator !== 0n) return null;
  return {
    kind: match[4] ? 'lower_bound' : match[3] || fraction ? 'approximate' : 'exact',
    value: (numerator / denominator).toString(),
  };
}

function splitList(value: string): readonly string[] {
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function nullable(value: string | undefined): string | null {
  return value ? value : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseDelimited(content: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) quoted = true;
    else if (character === delimiter) {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field.replace(/\r$/u, ''));
      records.push(record);
      record = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new DomainError('VALIDATION_ERROR', 'Competitor import CSV is malformed.');
  record.push(field.replace(/\r$/u, ''));
  if (record.length > 1 || record[0] !== '' || records.length === 0) records.push(record);
  return records;
}

function invalidHeaders(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Competitor import header is invalid.');
}
