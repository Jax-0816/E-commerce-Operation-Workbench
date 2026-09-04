import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '@eaw/domain';

import { TitleGenerationOutputSchema, validateTitleOutput } from './title.js';

describe('title generation validation', () => {
  it('checks variants, local length rules and unsupported terms deterministically', () => {
    const productId = createUuidV7();
    const factId = createUuidV7();
    const base = {
      text: '保温杯',
      keywords: ['保温杯'],
      claims: [
        {
          text: '304不锈钢',
          evidenceRefs: [{ kind: 'product_fact' as const, id: factId, productId }],
        },
      ],
      reviewTerms: [],
    };
    const output = TitleGenerationOutputSchema.parse({
      productId,
      titles: [
        { ...base, variant: 'recommended' },
        { ...base, variant: 'search', text: '国家级保温杯' },
        { ...base, variant: 'selling_point', claims: [{ text: '24小时保温', evidenceRefs: [] }] },
        { ...base, variant: 'scenario', reviewTerms: ['母婴适用'] },
      ],
    });
    const issues = validateTitleOutput(output, {
      productId,
      platformId: 'pinduoduo',
      allowedFactRefs: new Set([factId]),
    });
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['forbidden_term', 'unsupported_claim', 'review_term']),
    );
  });
});
