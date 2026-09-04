import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '@eaw/domain';

import { SellingPointSetOutputSchema, reviewSellingPointSet } from './strategy.js';

describe('strategy output review', () => {
  it('downgrades unsupported selling points to suggested facts', () => {
    const productId = createUuidV7();
    const snapshotId = createUuidV7();
    const factId = createUuidV7();
    const output = SellingPointSetOutputSchema.parse({
      productId,
      sellingPoints: [
        {
          headline: '24 小时保温',
          description: '长效保温',
          consumerPainOrBenefit: '减少重复加热',
          differentiation: '更长保温',
          risk: '需要检测报告',
          priority: 1,
          recommendedUsage: '详情页',
          evidenceRefs: [],
        },
        {
          headline: '竞品常见 304 材质',
          description: '竞品页面普遍展示',
          consumerPainOrBenefit: '材质易理解',
          differentiation: '行业基线',
          risk: '不得推断本商品材质',
          priority: 2,
          recommendedUsage: '调研记录',
          evidenceRefs: [
            { kind: 'competitor_snapshot', id: snapshotId, productId },
            { kind: 'product_fact', id: factId, productId },
          ],
        },
      ],
      suggestedFacts: [],
      limitations: [],
    });

    const reviewed = reviewSellingPointSet(output, {
      productId,
      allowedEvidenceRefs: new Set([`competitor_snapshot:${snapshotId}`, `product_fact:${factId}`]),
    });

    expect(reviewed.issues).toContain('unsupported_claim');
    expect(reviewed.value.sellingPoints).toHaveLength(1);
    expect(reviewed.value.suggestedFacts[0]?.label).toBe('24 小时保温');
  });
});
