import { describe, expect, it } from 'vitest';

import {
  CalculatePricingInputSchema,
  CostProfileResponseSchema,
  SaveCostProfileInputSchema,
} from './pricing.js';

const id = '0198f0a0-0000-7000-8000-000000000001';

describe('cost and pricing contracts', () => {
  it('accepts exact cost inputs and rejects contradictory missing values', () => {
    const valid = {
      currency: 'CNY',
      items: [
        {
          key: 'materials',
          label: '材料',
          kind: 'per_unit',
          classification: 'cost_of_goods',
          critical: true,
          status: 'confirmed',
          amountMinorUnits: '2000',
          allocationUnits: null,
          unitsPerOrder: null,
          rateBasisPoints: null,
          percentageBase: null,
          formula: null,
        },
      ],
    };
    expect(SaveCostProfileInputSchema.parse(valid)).toEqual(valid);
    expect(() =>
      SaveCostProfileInputSchema.parse({
        ...valid,
        items: [{ ...valid.items[0], status: 'missing', amountMinorUnits: '2000' }],
      }),
    ).toThrow();
    expect(() => SaveCostProfileInputSchema.parse({ ...valid, databaseRevision: 2 })).toThrow();
  });

  it('accepts pricing goals as exact strings and rejects unsafe search ranges', () => {
    expect(
      CalculatePricingInputSchema.parse({
        name: '目标利润',
        goal: { type: 'target_unit_profit', amountMinorUnits: '1000' },
        minimumMinorUnits: '0',
        maximumMinorUnits: '100000',
      }),
    ).toMatchObject({ goal: { amountMinorUnits: '1000' } });
    expect(() =>
      CalculatePricingInputSchema.parse({
        name: '错误范围',
        goal: { type: 'net_margin', basisPoints: '2500' },
        minimumMinorUnits: '100',
        maximumMinorUnits: '99',
      }),
    ).toThrow();
    expect(() =>
      CalculatePricingInputSchema.parse({
        name: '过宽范围',
        goal: { type: 'break_even' },
        minimumMinorUnits: '0',
        maximumMinorUnits: '100001',
      }),
    ).toThrow();
  });

  it('strictly validates serializable cost profile responses', () => {
    expect(() =>
      CostProfileResponseSchema.parse({
        id,
        skuId: id,
        currency: 'CNY',
        revisionNo: 1,
        items: [],
        createdAt: '2026-08-31T04:00:00.000Z',
        updatedAt: '2026-08-31T04:00:00.000Z',
        internal: true,
      }),
    ).toThrow();
  });
});
