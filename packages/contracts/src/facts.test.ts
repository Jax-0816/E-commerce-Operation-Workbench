import { describe, expect, it } from 'vitest';

import {
  ConfirmFactInputSchema,
  CreateFactInputSchema,
  ProductFactResponseSchema,
} from './facts.js';

describe('product fact contracts', () => {
  it('accepts typed values but rejects direct confirmed creation and unknown fields', () => {
    expect(
      CreateFactInputSchema.parse({
        key: 'capacity',
        label: '容量',
        value: { type: 'number', value: 750 },
        unit: 'ml',
        sourceType: 'supplier',
        sourceRef: 'supplier:1',
        verification: 'unverified',
        sensitive: false,
        policyEligible: true,
      }),
    ).toMatchObject({ value: { type: 'number', value: 750 } });
    expect(() =>
      CreateFactInputSchema.parse({
        key: 'material',
        label: '材质',
        value: { type: 'text', value: '304不锈钢' },
        unit: null,
        sourceType: 'manual',
        sourceRef: null,
        verification: 'confirmed',
        sensitive: false,
        policyEligible: true,
      }),
    ).toThrow();
    expect(() =>
      CreateFactInputSchema.parse({
        key: 'material',
        label: '材质',
        value: { type: 'text', value: '304' },
        unit: null,
        sourceType: 'manual',
        sourceRef: null,
        verification: 'unverified',
        sensitive: false,
        policyEligible: true,
        databaseOnly: 'must not cross',
      }),
    ).toThrow();
    expect(() =>
      CreateFactInputSchema.parse({
        key: 'material',
        label: '材质',
        value: { type: 'text', value: '304不锈钢' },
        unit: 'ml',
        sourceType: 'manual',
        sourceRef: null,
        verification: 'unverified',
        sensitive: false,
        policyEligible: true,
      }),
    ).toThrow();
  });

  it('requires explicit optimistic timestamp and user provenance for confirmation', () => {
    expect(() =>
      ConfirmFactInputSchema.parse({
        expectedUpdatedAt: '2026-08-19T08:00:00.000Z',
        actorRef: '',
        evidenceRef: '',
      }),
    ).toThrow();
    expect(
      ConfirmFactInputSchema.parse({
        expectedUpdatedAt: '2026-08-19T08:00:00.000Z',
        actorRef: 'local-user',
        evidenceRef: 'supplier:1',
      }),
    ).toMatchObject({ actorRef: 'local-user' });
  });

  it('filters persistence-only current flags from public fact DTOs', () => {
    const dto = ProductFactResponseSchema.parse({
      id: '0198f0a0-0000-7000-8000-000000000101',
      lineageId: '0198f0a0-0000-7000-8000-000000000101',
      productId: '0198f0a0-0000-7000-8000-000000000001',
      key: 'material',
      label: '材质',
      value: { type: 'text', value: '304不锈钢' },
      unit: null,
      sourceType: 'supplier',
      sourceRef: 'supplier:1',
      verification: 'unverified',
      sensitive: false,
      policyEligible: true,
      revisionNo: 1,
      supersedesFactId: null,
      createdAt: '2026-08-19T08:00:00.000Z',
      updatedAt: '2026-08-19T08:00:00.000Z',
      confirmedAt: null,
      confirmation: null,
    });
    expect(dto).not.toHaveProperty('isCurrent');
  });
});
