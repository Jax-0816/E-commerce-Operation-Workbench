import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export type CompetitorImportSource = 'manual' | 'paste' | 'csv' | 'xlsx' | 'url';
export type NormalizedCountKind = 'exact' | 'lower_bound' | 'approximate';

export interface NormalizedCount {
  readonly kind: NormalizedCountKind;
  readonly value: string;
}

export interface Competitor {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly name: string;
  readonly sourceUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export interface CreateCompetitorInput {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly name: string;
  readonly sourceUrl: string | null;
  readonly now: Date;
}

export interface CompetitorSnapshot {
  readonly id: UuidV7;
  readonly competitorId: UuidV7;
  readonly productId: UuidV7;
  readonly importBatchId: UuidV7;
  readonly source: CompetitorImportSource;
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
  readonly rawPayload: unknown;
  readonly capturedAt: Date;
  readonly importedAt: Date;
}

export interface CreateCompetitorSnapshotInput extends CompetitorSnapshot {
  readonly expectedProductId?: UuidV7;
}

const decimalInteger = /^(?:0|[1-9][0-9]{0,29})$/u;

export function createCompetitor(input: CreateCompetitorInput): Competitor {
  const name = requiredText(input.name, 160);
  return Object.freeze({
    id: input.id,
    productId: input.productId,
    name,
    sourceUrl: optionalUrl(input.sourceUrl),
    createdAt: validDate(input.now),
    updatedAt: validDate(input.now),
    archivedAt: null,
  });
}

export function createCompetitorSnapshot(input: CreateCompetitorSnapshotInput): CompetitorSnapshot {
  if (input.expectedProductId !== undefined && input.expectedProductId !== input.productId) {
    throw new DomainError('VALIDATION_ERROR', 'Competitor snapshot belongs to another product.');
  }
  if (!(['manual', 'paste', 'csv', 'xlsx', 'url'] as const).includes(input.source)) {
    throw invalidSnapshot();
  }
  const snapshot: CompetitorSnapshot = {
    id: input.id,
    competitorId: input.competitorId,
    productId: input.productId,
    importBatchId: input.importBatchId,
    source: input.source,
    sourceUrl: optionalUrl(input.sourceUrl),
    displayedPriceText: optionalText(input.displayedPriceText, 160),
    normalizedPriceMinorUnits: optionalInteger(input.normalizedPriceMinorUnits),
    displayedSalesText: optionalText(input.displayedSalesText, 160),
    normalizedSales: normalizedCount(input.normalizedSales),
    displayedReviewText: optionalText(input.displayedReviewText, 160),
    normalizedReviews: normalizedCount(input.normalizedReviews),
    skuTexts: textList(input.skuTexts, 100, 300),
    sellingPoints: textList(input.sellingPoints, 100, 1_000),
    imageReferences: assetList(input.imageReferences),
    rawPayload: jsonSnapshot(input.rawPayload),
    capturedAt: validDate(input.capturedAt),
    importedAt: validDate(input.importedAt),
  };
  if (
    (snapshot.normalizedPriceMinorUnits !== null && snapshot.displayedPriceText === null) ||
    (snapshot.normalizedSales !== null && snapshot.displayedSalesText === null) ||
    (snapshot.normalizedReviews !== null && snapshot.displayedReviewText === null)
  ) {
    throw invalidSnapshot();
  }
  return deepFreeze(snapshot);
}

function normalizedCount(value: NormalizedCount | null): NormalizedCount | null {
  if (value === null) return null;
  if (
    !(['exact', 'lower_bound', 'approximate'] as const).includes(value.kind) ||
    !decimalInteger.test(value.value)
  ) {
    throw invalidSnapshot();
  }
  return { kind: value.kind, value: value.value };
}

function optionalInteger(value: string | null): string | null {
  if (value === null) return null;
  if (!decimalInteger.test(value)) throw invalidSnapshot();
  return value;
}

function requiredText(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw invalidSnapshot();
  return normalized;
}

function optionalText(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw invalidSnapshot();
  return normalized;
}

function textList(values: readonly string[], maximumItems: number, maximumLength: number) {
  if (values.length > maximumItems) throw invalidSnapshot();
  return values.map((value) => requiredText(value, maximumLength));
}

function assetList(values: readonly string[]): readonly string[] {
  const assets = textList(values, 100, 500);
  if (
    assets.some(
      (value) =>
        !value.startsWith('assets/competitors/') ||
        value.includes('..') ||
        value.includes('\\') ||
        value.startsWith('/'),
    )
  ) {
    throw invalidSnapshot();
  }
  return assets;
}

function optionalUrl(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_048) throw invalidSnapshot();
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalidSnapshot();
    return url.toString();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalidSnapshot();
  }
}

function jsonSnapshot(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized.length > 1_000_000) throw invalidSnapshot();
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalidSnapshot();
  }
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) throw invalidSnapshot();
  return new Date(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function invalidSnapshot(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Competitor snapshot is invalid.');
}
