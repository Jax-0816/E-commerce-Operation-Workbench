import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '../ids.js';
import { createPromotionResultRecord, createPromotionScenario } from './promotion-record.js';

describe('promotion records', () => {
  it('creates detached immutable scenario and result snapshots', () => {
    const components = [{ key: 'coupon', amountMinorUnits: '100' }];
    const scenario = createPromotionScenario({
      id: createUuidV7(),
      productId: createUuidV7(),
      name: '大促模拟',
      platformId: 'pinduoduo',
      region: 'CN',
      ruleSnapshotId: createUuidV7(),
      ruleSnapshotHash: 'a'.repeat(64),
      configurationSnapshot: { components, search: { minimum: '0', maximum: '10000' } },
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    components[0]!.key = 'changed';

    expect(scenario.configurationSnapshot).toMatchObject({
      components: [{ key: 'coupon' }],
    });
    const result = createPromotionResultRecord({
      id: createUuidV7(),
      scenarioId: scenario.id,
      skuId: createUuidV7(),
      costProfileId: null,
      costProfileRevisionNo: null,
      status: 'incomplete',
      inputSnapshot: { campaignPriceMinorUnits: '10000' },
      resultSnapshot: { financial: null },
      engineVersion: '0.1.0',
      createdAt: new Date('2026-09-02T00:00:01.000Z'),
    });
    expect(result.status).toBe('incomplete');
  });

  it('rejects inconsistent nullable cost profile references', () => {
    expect(() =>
      createPromotionResultRecord({
        id: createUuidV7(),
        scenarioId: createUuidV7(),
        skuId: createUuidV7(),
        costProfileId: createUuidV7(),
        costProfileRevisionNo: null,
        status: 'verified',
        inputSnapshot: {},
        resultSnapshot: {},
        engineVersion: '0.1.0',
        createdAt: new Date(),
      }),
    ).toThrow(/promotion record/i);
  });
});
