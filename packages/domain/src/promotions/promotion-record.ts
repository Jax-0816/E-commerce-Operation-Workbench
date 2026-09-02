import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export type PromotionRecordStatus = 'incomplete' | 'verified' | 'warning';

export interface PromotionScenario {
  readonly configurationSnapshot: unknown;
  readonly createdAt: Date;
  readonly id: UuidV7;
  readonly name: string;
  readonly platformId: 'pinduoduo';
  readonly productId: UuidV7;
  readonly region: string;
  readonly ruleSnapshotHash: string;
  readonly ruleSnapshotId: UuidV7;
}

export interface PromotionResultRecord {
  readonly costProfileId: UuidV7 | null;
  readonly costProfileRevisionNo: number | null;
  readonly createdAt: Date;
  readonly engineVersion: string;
  readonly id: UuidV7;
  readonly inputSnapshot: unknown;
  readonly resultSnapshot: unknown;
  readonly scenarioId: UuidV7;
  readonly skuId: UuidV7;
  readonly status: PromotionRecordStatus;
}

export interface PromotionRepository {
  appendResults(
    scenarioId: UuidV7,
    results: readonly PromotionResultRecord[],
  ): Promise<readonly PromotionResultRecord[]>;
  createScenario(scenario: PromotionScenario): Promise<PromotionScenario>;
  findScenario(id: UuidV7): Promise<PromotionScenario | undefined>;
  listResults(scenarioId: UuidV7): Promise<readonly PromotionResultRecord[]>;
  listScenarios(productId: UuidV7): Promise<readonly PromotionScenario[]>;
}

export function createPromotionScenario(input: PromotionScenario): PromotionScenario {
  const name = input.name.trim();
  const region = input.region.trim();
  if (
    !name ||
    name.length > 160 ||
    !/^[A-Z]{2}(?:-[A-Z0-9]{2,8})?$/u.test(region) ||
    !/^[0-9a-f]{64}$/u.test(input.ruleSnapshotHash) ||
    input.platformId !== 'pinduoduo'
  ) {
    throw invalidPromotionRecord();
  }
  return deepFreeze({
    ...input,
    name,
    region,
    configurationSnapshot: jsonSnapshot(input.configurationSnapshot),
    createdAt: validDate(input.createdAt),
  });
}

export function createPromotionResultRecord(input: PromotionResultRecord): PromotionResultRecord {
  const engineVersion = input.engineVersion.trim();
  const costReferenceConsistent =
    (input.costProfileId === null && input.costProfileRevisionNo === null) ||
    (input.costProfileId !== null &&
      Number.isSafeInteger(input.costProfileRevisionNo) &&
      (input.costProfileRevisionNo ?? 0) > 0);
  if (
    !engineVersion ||
    engineVersion.length > 80 ||
    !costReferenceConsistent ||
    !(['incomplete', 'verified', 'warning'] as const).includes(input.status)
  ) {
    throw invalidPromotionRecord();
  }
  return deepFreeze({
    ...input,
    engineVersion,
    inputSnapshot: jsonSnapshot(input.inputSnapshot),
    resultSnapshot: jsonSnapshot(input.resultSnapshot),
    createdAt: validDate(input.createdAt),
  });
}

function jsonSnapshot(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized.length > 1_000_000) {
      throw invalidPromotionRecord();
    }
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalidPromotionRecord();
  }
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) throw invalidPromotionRecord();
  return new Date(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function invalidPromotionRecord(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Promotion record is invalid.');
}
