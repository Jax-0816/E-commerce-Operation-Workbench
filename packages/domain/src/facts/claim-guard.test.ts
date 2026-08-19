import { describe, expect, it } from 'vitest';

import { parseUuidV7 } from '../ids.js';
import { checkClaims, evaluateFacts, type DeterministicClaim, type ProductFact } from './index.js';

const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');
const otherProductId = parseUuidV7('0198f0a0-0000-7000-8000-000000000002');
const materialId = parseUuidV7('0198f0a0-0000-7000-8000-000000000101');
const capacityId = parseUuidV7('0198f0a0-0000-7000-8000-000000000102');

describe('checkClaims canonical fixture', () => {
  it('allows only claims backed by exact eligible current-product fact references', () => {
    const allowedFacts = evaluateFacts([
      confirmedFact(materialId, 'material', { type: 'text', value: '304不锈钢' }),
      confirmedFact(capacityId, 'capacity', { type: 'number', value: 750 }, 'ml'),
    ]).allowed;

    const claims: DeterministicClaim[] = [
      claim('材质为304不锈钢', materialId, 'material'),
      claim('容量750ml', capacityId, 'capacity'),
      claim('食品级', materialId, 'food_grade'),
      claim('24小时保温', capacityId, 'insulation_duration'),
    ];

    const result = checkClaims(claims, allowedFacts, productId);

    expect(result.supportedClaims.map(({ text }) => text)).toEqual([
      '材质为304不锈钢',
      '容量750ml',
    ]);
    expect(result.unsupportedClaims.map(({ claim, reason }) => [claim.text, reason])).toEqual([
      ['食品级', 'fact_key_mismatch'],
      ['24小时保温', 'fact_key_mismatch'],
    ]);
    expect(result.autoApprovalAllowed).toBe(false);
    expect(result.assetStatus).toBe('needs_review');
  });

  it('blocks missing, cross-product, unconfirmed, inferred, and sensitive-ineligible evidence', () => {
    const inferred = confirmedFact(materialId, 'material', { type: 'text', value: '304' });
    const restrictedFacts: ProductFact[] = [
      { ...inferred, verification: 'inferred', confirmedAt: null, confirmation: null },
    ];
    const allowed = evaluateFacts(restrictedFacts).allowed;
    const cases: Array<
      [
        string,
        DeterministicClaim,
        ReturnType<typeof checkClaims>['unsupportedClaims'][number]['reason'],
      ]
    > = [
      ['no reference', { id: 'claim-1', text: '无证据', evidenceRefs: [] }, 'evidence_required'],
      [
        'foreign product',
        {
          ...claim('跨产品', materialId, 'material'),
          evidenceRefs: [{ productId: otherProductId, factId: materialId, factKey: 'material' }],
        },
        'cross_product_evidence',
      ],
      ['inferred', claim('推断', materialId, 'material'), 'fact_not_allowed'],
    ];

    for (const [name, candidate, reason] of cases) {
      expect(checkClaims([candidate], allowed, productId).unsupportedClaims[0]?.reason, name).toBe(
        reason,
      );
    }
  });

  it('requires every structured evidence reference to be eligible for the exact claim key', () => {
    const material = confirmedFact(materialId, 'material', { type: 'text', value: '304不锈钢' });
    const capacity = confirmedFact(capacityId, 'capacity', { type: 'number', value: 750 }, 'ml');
    const allowed = evaluateFacts([material, capacity]).allowed;
    const candidate: DeterministicClaim = {
      id: 'claim-composite',
      text: '304不锈钢，容量750ml',
      evidenceRefs: [
        { productId, factId: materialId, factKey: 'material' },
        { productId, factId: capacityId, factKey: 'insulation_duration' },
      ],
    };
    expect(checkClaims([candidate], allowed, productId)).toMatchObject({
      autoApprovalAllowed: false,
      assetStatus: 'needs_review',
      unsupportedClaims: [{ reason: 'fact_key_mismatch' }],
    });
  });

  it('requires an explicit policy reference and eligible sensitive evidence for sensitive claims', () => {
    const plain = confirmedFact(materialId, 'material', { type: 'text', value: '304不锈钢' });
    const sensitive = {
      ...confirmedFact(capacityId, 'food_contact_safe', { type: 'boolean', value: true }),
      sensitive: true,
      policyEligible: true,
    };
    const allowed = evaluateFacts([plain, sensitive]).allowed;
    const noPolicy = {
      ...claim('食品接触安全', capacityId, 'food_contact_safe'),
      sensitivity: 'sensitive' as const,
      policyRef: null,
    };
    expect(checkClaims([noPolicy], allowed, productId).unsupportedClaims[0]?.reason).toBe(
      'sensitive_policy_required',
    );

    const plainEvidence = {
      ...claim('食品接触安全', materialId, 'material'),
      sensitivity: 'sensitive' as const,
      policyRef: 'policy:food-contact-v1',
    };
    expect(checkClaims([plainEvidence], allowed, productId).unsupportedClaims[0]?.reason).toBe(
      'sensitive_evidence_required',
    );

    const supported = { ...noPolicy, policyRef: 'policy:food-contact-v1' };
    expect(checkClaims([supported], allowed, productId)).toMatchObject({
      autoApprovalAllowed: true,
      assetStatus: 'approved',
      unsupportedClaims: [],
    });
  });
});

function claim(text: string, factId: ProductFact['id'], factKey: string): DeterministicClaim {
  return {
    id: `claim-${text}`,
    text,
    evidenceRefs: [{ productId, factId, factKey }],
  };
}

function confirmedFact(
  id: ProductFact['id'],
  key: string,
  value: NonNullable<ProductFact['value']>,
  unit: string | null = null,
): ProductFact {
  const now = new Date('2026-08-19T08:00:00.000Z');
  return {
    id,
    productId,
    key,
    label: key,
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
  };
}
