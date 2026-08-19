import { describe, expect, it } from 'vitest';

import { parseUuidV7 } from '../ids.js';
import { evaluateFacts, type ProductFact } from './index.js';

const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');

describe('evaluateFacts', () => {
  it('partitions every fact exactly once and only allows eligible confirmed evidence', () => {
    const facts = [
      fact('000000000101', 'material', 'confirmed'),
      fact('000000000102', 'capacity', 'unverified'),
      fact('000000000103', 'insulation_duration', 'inferred', 'ai_inferred'),
      fact('000000000104', 'food_grade', 'missing'),
      fact('000000000105', 'medical_safe', 'confirmed', 'document', true, false),
    ];

    const result = evaluateFacts(facts);

    expect(result.allowed.map(({ key }) => key)).toEqual(['material']);
    expect(result.restricted.map(({ fact }) => fact.key)).toEqual([
      'capacity',
      'insulation_duration',
      'medical_safe',
    ]);
    expect(result.restricted.map(({ reason }) => reason)).toEqual([
      'not_confirmed',
      'ai_inferred',
      'sensitive_policy_ineligible',
    ]);
    expect(result.missing.map(({ key }) => key)).toEqual(['food_grade']);

    const partitionedIds = [
      ...result.allowed.map(({ id }) => id),
      ...result.restricted.map(({ fact }) => fact.id),
      ...result.missing.map(({ id }) => id),
    ];
    expect(partitionedIds).toHaveLength(facts.length);
    expect(new Set(partitionedIds).size).toBe(facts.length);
  });

  it('never allows an inferred status across varied source types', () => {
    const sources: ProductFact['sourceType'][] = [
      'manual',
      'supplier',
      'import',
      'document',
      'ai_inferred',
      'competitor_reference',
      'other',
    ];

    for (const [index, source] of sources.entries()) {
      const candidate = fact(
        `0000000002${String(index).padStart(2, '0')}`,
        `key_${index}`,
        'inferred',
        source,
      );
      const result = evaluateFacts([candidate]);
      expect(result.allowed, source).toEqual([]);
      expect(result.restricted, source).toHaveLength(1);
    }
  });

  it('maintains a total disjoint partition across status, source, and sensitivity combinations', () => {
    const sources: ProductFact['sourceType'][] = [
      'manual',
      'supplier',
      'import',
      'document',
      'ai_inferred',
      'competitor_reference',
      'other',
    ];
    const statuses: ProductFact['verification'][] = [
      'confirmed',
      'unverified',
      'inferred',
      'missing',
    ];
    const candidates: ProductFact[] = [];
    let sequence = 300;
    for (const status of statuses) {
      for (const source of sources) {
        for (const [sensitive, policyEligible] of [
          [false, true],
          [true, false],
          [true, true],
        ] as const) {
          candidates.push(
            fact(
              String(sequence++).padStart(12, '0'),
              `matrix_${sequence}`,
              status,
              source,
              sensitive,
              policyEligible,
            ),
          );
        }
      }
    }

    const result = evaluateFacts(candidates);
    const ids = [
      ...result.allowed.map(({ id }) => id),
      ...result.restricted.map(({ fact: { id } }) => id),
      ...result.missing.map(({ id }) => id),
    ];
    expect(ids).toHaveLength(candidates.length);
    expect(new Set(ids).size).toBe(candidates.length);
    expect(
      result.allowed.every(
        (candidate) =>
          candidate.verification === 'confirmed' &&
          (!candidate.sensitive || candidate.policyEligible),
      ),
    ).toBe(true);
    expect(result.missing.every(({ verification }) => verification === 'missing')).toBe(true);
  });
});

function fact(
  suffix: string,
  key: string,
  verification: ProductFact['verification'],
  sourceType: ProductFact['sourceType'] = 'manual',
  sensitive = false,
  policyEligible = true,
): ProductFact {
  const now = new Date('2026-08-19T08:00:00.000Z');
  return {
    id: parseUuidV7(`0198f0a0-0000-7000-8000-${suffix}`),
    productId,
    key,
    label: key,
    value: verification === 'missing' ? null : { type: 'text', value: key },
    unit: null,
    sourceType,
    sourceRef: sourceType === 'manual' ? null : `${sourceType}:fixture`,
    verification,
    sensitive,
    policyEligible,
    revisionNo: 1,
    supersedesFactId: null,
    createdAt: now,
    updatedAt: now,
    confirmedAt: verification === 'confirmed' ? now : null,
    confirmation:
      verification === 'confirmed'
        ? { actorType: 'user', actorRef: 'local-user', evidenceRef: 'manual:fixture' }
        : null,
  };
}
