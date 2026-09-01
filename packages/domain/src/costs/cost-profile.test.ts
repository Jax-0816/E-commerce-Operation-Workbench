import { describe, expect, it } from 'vitest';

import { parseUuidV7 } from '../ids.js';
import { createCostProfile, reviseCostProfile } from './cost-profile.js';
import { createPricingResultRecord } from './pricing-record.js';

const profileId = id(1);
const skuId = id(2);

describe('cost profile', () => {
  it('creates a normalized SKU profile covering supported cost bases and input states', () => {
    const profile = createCostProfile({
      id: profileId,
      skuId,
      currency: 'CNY',
      now: new Date('2026-08-31T04:00:00.000Z'),
      items: [
        item('materials', ' 材料 ', 'per_unit', 'confirmed', { amountMinorUnits: '2000' }),
        item('overhead', '固定开支', 'fixed', 'estimated', {
          amountMinorUnits: '10000',
          allocationUnits: '100',
        }),
        item('commission', '佣金', 'percentage', 'confirmed', {
          rateBasisPoints: '1000',
          percentageBase: 'recognized_revenue',
        }),
        item('unknown', '待确认成本', 'per_order', 'missing', {}),
      ],
    });

    expect(profile.revisionNo).toBe(1);
    expect(profile.items.map(({ label }) => label)).toEqual([
      '材料',
      '固定开支',
      '佣金',
      '待确认成本',
    ]);
    expect(profile.items[3]).toMatchObject({ status: 'missing', amountMinorUnits: null });
  });

  it('rejects duplicate keys and values that contradict missing status', () => {
    const base = item('materials', '材料', 'per_unit', 'confirmed', {
      amountMinorUnits: '2000',
    });
    expect(() =>
      createCostProfile({
        id: profileId,
        skuId,
        currency: 'CNY',
        now: new Date(),
        items: [base, base],
      }),
    ).toThrow(/cost profile/i);
    expect(() =>
      createCostProfile({
        id: profileId,
        skuId,
        currency: 'CNY',
        now: new Date(),
        items: [item('missing', '缺失', 'per_unit', 'missing', { amountMinorUnits: '1' })],
      }),
    ).toThrow(/cost profile/i);
  });

  it('creates a new revision only from the expected current revision', () => {
    const created = createCostProfile({
      id: profileId,
      skuId,
      currency: 'CNY',
      now: new Date('2026-08-31T04:00:00.000Z'),
      items: [item('materials', '材料', 'per_unit', 'confirmed', { amountMinorUnits: '2000' })],
    });
    const revised = reviseCostProfile(created, {
      expectedRevisionNo: 1,
      now: new Date('2026-08-31T05:00:00.000Z'),
      items: [item('materials', '材料', 'per_unit', 'confirmed', { amountMinorUnits: '2200' })],
    });

    expect(revised.revisionNo).toBe(2);
    expect(revised.items[0]?.amountMinorUnits).toBe('2200');
    expect(() =>
      reviseCostProfile(created, {
        expectedRevisionNo: 2,
        items: revised.items,
        now: new Date('2026-08-31T06:00:00.000Z'),
      }),
    ).toThrow(/changed|reload/i);
  });
});

describe('pricing record', () => {
  it('rejects an unknown persisted result status at runtime', () => {
    expect(() =>
      createPricingResultRecord({
        id: id(10),
        scenarioId: id(11),
        skuId,
        status: 'unknown' as never,
        inputSnapshot: {},
        resultSnapshot: {},
        engineVersion: '0.1.0',
        createdAt: new Date('2026-08-31T05:00:00.000Z'),
      }),
    ).toThrow(/pricing record/i);
  });
});

function item(
  key: string,
  label: string,
  kind: 'fixed' | 'per_order' | 'per_unit' | 'percentage',
  status: 'confirmed' | 'estimated' | 'missing',
  values: {
    amountMinorUnits?: string;
    allocationUnits?: string;
    percentageBase?: 'recognized_revenue';
    rateBasisPoints?: string;
  },
) {
  return {
    key,
    label,
    kind,
    classification: key === 'materials' ? ('cost_of_goods' as const) : ('operating' as const),
    critical: true,
    status,
    amountMinorUnits: values.amountMinorUnits ?? null,
    allocationUnits: values.allocationUnits ?? null,
    unitsPerOrder: null,
    rateBasisPoints: values.rateBasisPoints ?? null,
    percentageBase: values.percentageBase ?? null,
    formula: null,
  };
}

function id(value: number) {
  return parseUuidV7(`0198f0a0-0000-7000-8000-${String(value).padStart(12, '0')}`);
}
