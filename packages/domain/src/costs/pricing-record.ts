import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export type PricingRecordStatus = 'incomplete' | 'invalid' | 'verified' | 'warning';

export interface PricingScenario {
  readonly costProfileId: UuidV7;
  readonly costProfileRevisionNo: number;
  readonly createdAt: Date;
  readonly goalSnapshot: unknown;
  readonly id: UuidV7;
  readonly name: string;
  readonly skuId: UuidV7;
}

export interface PricingResultRecord {
  readonly createdAt: Date;
  readonly engineVersion: string;
  readonly id: UuidV7;
  readonly inputSnapshot: unknown;
  readonly resultSnapshot: unknown;
  readonly scenarioId: UuidV7;
  readonly skuId: UuidV7;
  readonly status: PricingRecordStatus;
}

export interface PricingRepository {
  appendCalculation(
    scenario: PricingScenario,
    result: PricingResultRecord,
  ): Promise<{ readonly scenario: PricingScenario; readonly result: PricingResultRecord }>;
  listScenarios(skuId: UuidV7): Promise<readonly PricingScenario[]>;
  listResults(scenarioId: UuidV7): Promise<readonly PricingResultRecord[]>;
}

export function createPricingScenario(input: PricingScenario): PricingScenario {
  const name = input.name.trim();
  if (
    !name ||
    name.length > 160 ||
    !Number.isSafeInteger(input.costProfileRevisionNo) ||
    input.costProfileRevisionNo < 1
  ) {
    throw invalidPricingRecord();
  }
  return {
    ...input,
    name,
    goalSnapshot: jsonSnapshot(input.goalSnapshot),
    createdAt: validDate(input.createdAt),
  };
}

export function createPricingResultRecord(input: PricingResultRecord): PricingResultRecord {
  const engineVersion = input.engineVersion.trim();
  if (
    !engineVersion ||
    engineVersion.length > 80 ||
    !(['incomplete', 'invalid', 'verified', 'warning'] as const).includes(input.status)
  ) {
    throw invalidPricingRecord();
  }
  return {
    ...input,
    engineVersion,
    inputSnapshot: jsonSnapshot(input.inputSnapshot),
    resultSnapshot: jsonSnapshot(input.resultSnapshot),
    createdAt: validDate(input.createdAt),
  };
}

function jsonSnapshot(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized.length > 1_000_000) throw invalidPricingRecord();
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalidPricingRecord();
  }
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) throw invalidPricingRecord();
  return value;
}

function invalidPricingRecord(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Pricing record is invalid.');
}
