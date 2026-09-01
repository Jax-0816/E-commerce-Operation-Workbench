import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export type CostKind = 'fixed' | 'formula' | 'per_order' | 'per_unit' | 'percentage';
export type CostClassification = 'cost_of_goods' | 'operating';
export type CostInputStatus = 'confirmed' | 'estimated' | 'missing';
export type CostPercentageBase =
  'campaign_price' | 'consumer_payment' | 'merchant_settlement' | 'recognized_revenue';

export interface CostProfileItem {
  readonly allocationUnits: string | null;
  readonly amountMinorUnits: string | null;
  readonly classification: CostClassification;
  readonly critical: boolean;
  readonly formula: unknown | null;
  readonly key: string;
  readonly kind: CostKind;
  readonly label: string;
  readonly percentageBase: CostPercentageBase | null;
  readonly rateBasisPoints: string | null;
  readonly status: CostInputStatus;
  readonly unitsPerOrder: string | null;
}

export interface CostProfile {
  readonly createdAt: Date;
  readonly currency: string;
  readonly id: UuidV7;
  readonly items: readonly CostProfileItem[];
  readonly revisionNo: number;
  readonly skuId: UuidV7;
  readonly updatedAt: Date;
}

export function createCostProfile(input: {
  readonly currency: string;
  readonly id: UuidV7;
  readonly items: readonly CostProfileItem[];
  readonly now: Date;
  readonly skuId: UuidV7;
}): CostProfile {
  const timestamp = validDate(input.now);
  return {
    id: input.id,
    skuId: input.skuId,
    currency: validCurrency(input.currency),
    items: validateItems(input.items),
    revisionNo: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function reviseCostProfile(
  profile: CostProfile,
  input: {
    readonly expectedRevisionNo: number;
    readonly items: readonly CostProfileItem[];
    readonly now: Date;
  },
): CostProfile {
  if (input.expectedRevisionNo !== profile.revisionNo) {
    throw new DomainError('CONFLICT', 'Cost profile changed; reload.');
  }
  const updatedAt = validDate(input.now);
  if (updatedAt.getTime() <= profile.updatedAt.getTime()) throw invalid();
  return {
    ...profile,
    items: validateItems(input.items),
    revisionNo: profile.revisionNo + 1,
    updatedAt,
  };
}

function validateItems(items: readonly CostProfileItem[]): readonly CostProfileItem[] {
  if (items.length > 256) throw invalid();
  const keys = new Set<string>();
  return items.map((item) => {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u.test(item.key) || keys.has(item.key)) {
      throw invalid();
    }
    keys.add(item.key);
    const label = item.label.trim();
    if (!label || label.length > 120 || typeof item.critical !== 'boolean') throw invalid();

    const normalized = { ...item, label };
    if (item.status === 'missing') {
      if (
        [
          item.amountMinorUnits,
          item.allocationUnits,
          item.unitsPerOrder,
          item.rateBasisPoints,
          item.percentageBase,
          item.formula,
        ].some((value) => value !== null)
      ) {
        throw invalid();
      }
      return normalized;
    }

    switch (item.kind) {
      case 'per_unit':
        assertShape(item, ['amountMinorUnits']);
        nonnegativeInteger(item.amountMinorUnits);
        break;
      case 'fixed':
        assertShape(item, ['amountMinorUnits', 'allocationUnits']);
        nonnegativeInteger(item.amountMinorUnits);
        positiveInteger(item.allocationUnits);
        break;
      case 'per_order':
        assertShape(item, ['amountMinorUnits', 'unitsPerOrder']);
        nonnegativeInteger(item.amountMinorUnits);
        positiveInteger(item.unitsPerOrder);
        break;
      case 'percentage':
        assertShape(item, ['rateBasisPoints', 'percentageBase']);
        nonnegativeInteger(item.rateBasisPoints);
        if (
          ![
            'campaign_price',
            'consumer_payment',
            'merchant_settlement',
            'recognized_revenue',
          ].includes(item.percentageBase ?? '')
        ) {
          throw invalid();
        }
        break;
      case 'formula':
        assertShape(item, ['formula']);
        if (typeof item.formula !== 'object' || item.formula === null) throw invalid();
        break;
    }
    return normalized;
  });
}

function assertShape(item: CostProfileItem, expected: readonly (keyof CostProfileItem)[]): void {
  const populated = (
    [
      'amountMinorUnits',
      'allocationUnits',
      'unitsPerOrder',
      'rateBasisPoints',
      'percentageBase',
      'formula',
    ] as const
  ).filter((key) => item[key] !== null);
  if (populated.length !== expected.length || populated.some((key) => !expected.includes(key))) {
    throw invalid();
  }
}

function nonnegativeInteger(value: string | null): void {
  if (value === null || !/^(0|[1-9][0-9]{0,127})$/u.test(value)) throw invalid();
}

function positiveInteger(value: string | null): void {
  nonnegativeInteger(value);
  if (value === '0') throw invalid();
}

function validCurrency(value: string): string {
  if (!/^[A-Z]{3}$/u.test(value)) throw invalid();
  return value;
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) throw invalid();
  return value;
}

function invalid(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Cost profile is invalid.');
}
