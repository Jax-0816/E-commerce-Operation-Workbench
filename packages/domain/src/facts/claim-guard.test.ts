import { describe, expect, it } from 'vitest';

import { parseUuidV7 } from '../ids.js';
import { checkClaims, evaluateFacts, type DeterministicClaim, type ProductFact } from './index.js';

const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');
const otherProductId = parseUuidV7('0198f0a0-0000-7000-8000-000000000002');
const materialId = parseUuidV7('0198f0a0-0000-7000-8000-000000000101');
const capacityId = parseUuidV7('0198f0a0-0000-7000-8000-000000000102');

describe('checkClaims canonical fixture', () => {
  it('allows canonical 304 steel/750ml claims but blocks spoofed food-grade and 24-hour text', () => {
    const material = confirmedFact(materialId, 'material', '材质', {
      type: 'text',
      value: '304不锈钢',
    });
    const capacity = confirmedFact(
      capacityId,
      'capacity',
      '容量',
      { type: 'number', value: 750 },
      'ml',
    );
    const allowed = evaluateFacts([material, capacity]).allowed;
    const claims = [
      claim('材质为304不锈钢', material),
      claim('容量750ml', capacity),
      claim('食品级', material),
      claim('24小时保温', capacity),
    ];

    const result = checkClaims(claims, allowed, productId);

    expect(result.supportedClaims.map(({ text }) => text)).toEqual([
      '材质为304不锈钢',
      '容量750ml',
    ]);
    expect(result.unsupportedClaims.map(({ claim, reason }) => [claim.text, reason])).toEqual([
      ['食品级', 'text_not_canonical'],
      ['24小时保温', 'text_not_canonical'],
    ]);
    expect(result).toMatchObject({ autoApprovalAllowed: false, assetStatus: 'needs_review' });
  });

  it('binds exact typed asserted value and unit to the allowed fact', () => {
    const capacity = confirmedFact(
      capacityId,
      'capacity',
      '容量',
      { type: 'number', value: 750 },
      'ml',
    );
    const allowed = evaluateFacts([capacity]).allowed;
    const baseline = claim('容量750ml', capacity);
    const wrongValue = {
      ...baseline,
      evidenceRefs: [
        { ...baseline.evidenceRefs[0]!, assertedValue: { type: 'number' as const, value: 24 } },
      ],
    };
    const wrongUnit = {
      ...baseline,
      evidenceRefs: [{ ...baseline.evidenceRefs[0]!, assertedUnit: 'h' }],
    };

    expect(checkClaims([wrongValue], allowed, productId).unsupportedClaims[0]?.reason).toBe(
      'assertion_mismatch',
    );
    expect(checkClaims([wrongUnit], allowed, productId).unsupportedClaims[0]?.reason).toBe(
      'assertion_mismatch',
    );
    const malformed = {
      ...baseline,
      evidenceRefs: [{ ...baseline.evidenceRefs[0]!, assertedValue: undefined }],
    } as unknown as DeterministicClaim;
    expect(checkClaims([malformed], allowed, productId).unsupportedClaims[0]?.reason).toBe(
      'assertion_mismatch',
    );
  });

  it('blocks missing, cross-product, and inferred evidence', () => {
    const inferred = confirmedFact(materialId, 'material', '材质', { type: 'text', value: '304' });
    const allowed = evaluateFacts([
      { ...inferred, verification: 'inferred', confirmedAt: null, confirmation: null },
    ]).allowed;
    const noReference: DeterministicClaim = { id: 'claim-1', text: '无证据', evidenceRefs: [] };
    const baseline = claim('材质为304', inferred);
    const foreign = {
      ...baseline,
      evidenceRefs: [{ ...baseline.evidenceRefs[0]!, productId: otherProductId }],
    };

    expect(checkClaims([noReference], allowed, productId).unsupportedClaims[0]?.reason).toBe(
      'evidence_required',
    );
    expect(checkClaims([foreign], allowed, productId).unsupportedClaims[0]?.reason).toBe(
      'cross_product_evidence',
    );
    expect(
      checkClaims([claim('材质为304', inferred)], allowed, productId).unsupportedClaims[0]?.reason,
    ).toBe('fact_not_allowed');
  });

  it('derives sensitivity from matched fact and never trusts omitted caller sensitivity', () => {
    const sensitive = {
      ...confirmedFact(capacityId, 'food_contact_safe', '食品接触安全', {
        type: 'boolean',
        value: true,
      }),
      sensitive: true,
      policyEligible: true,
    };
    const allowed = evaluateFacts([sensitive]).allowed;
    const omitted = claim('食品接触安全为是', sensitive);

    expect(checkClaims([omitted], allowed, productId).unsupportedClaims[0]?.reason).toBe(
      'sensitive_policy_required',
    );
    expect(
      checkClaims([{ ...omitted, policyRef: 'policy:food-contact-v1' }], allowed, productId),
    ).toMatchObject({
      autoApprovalAllowed: true,
      assetStatus: 'approved',
    });
  });
});

function claim(text: string, fact: ProductFact): DeterministicClaim {
  return {
    id: `claim-${text}`,
    text,
    evidenceRefs: [
      {
        productId: fact.productId,
        factId: fact.id,
        factKey: fact.key,
        assertedValue: fact.value!,
        assertedUnit: fact.unit,
      },
    ],
  };
}

function confirmedFact(
  id: ProductFact['id'],
  key: string,
  label: string,
  value: NonNullable<ProductFact['value']>,
  unit: string | null = null,
): ProductFact {
  const now = new Date('2026-08-19T08:00:00.000Z');
  return {
    id,
    lineageId: id,
    productId,
    key,
    label,
    value,
    unit,
    sourceType: 'supplier',
    sourceRef: 'supplier:catalogue-1',
    verification: 'confirmed',
    sensitive: false,
    policyEligible: true,
    revisionNo: 1,
    supersedesFactId: null,
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
    confirmation: {
      actorType: 'user',
      actorRef: 'local-user',
      evidenceRef: 'supplier:catalogue-1',
    },
    deletedAt: null,
  };
}
