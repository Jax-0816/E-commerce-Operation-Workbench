import { describe, expect, it } from 'vitest';

import { moneyFromMinorUnits, roundingPolicy } from '@eaw/calculation-engine';
import type { CostItem } from '@eaw/pricing-engine';
import type { RuleSnapshot } from '@eaw/rule-engine';

import { simulatePinduoduo } from './pinduoduo.js';
import type { PromotionComponent } from './types.js';

describe('Pinduoduo promotion adapter', () => {
  it('answers the complete money-flow, profit, margin and break-even questions', () => {
    const result = simulatePinduoduo({
      campaignPrice: moneyFromMinorUnits(10_000n),
      components: components(),
      costs: costs(),
      rounding: roundingPolicy('half-up'),
      ruleSnapshot: snapshot('verified'),
      search: { minimumMinorUnits: 5_000n, maximumMinorUnits: 12_000n },
    });

    expect(result.status).toBe('verified');
    expect(result.promotion.consumerPayment.minorUnits).toBe(7_000n);
    expect(result.promotion.platformFundedDiscount.minorUnits).toBe(2_000n);
    expect(result.promotion.merchantSettlement.minorUnits).toBe(9_000n);
    expect(result.financial?.operatingCosts.minorUnits).toBe(1_350n);
    expect(result.financial?.netProfit.minorUnits).toBe(2_650n);
    expect(result.financial?.netMarginBasisPoints).toBe(2_944n);
    expect(result.breakEvenCampaignPrice?.minorUnits).not.toBeNull();
    expect(result.trace.map(({ operation }) => operation)).toEqual(
      expect.arrayContaining([
        'promotion:merchant-coupon',
        'promotion:platform-coupon',
        'cost:platform.commission_rate',
        'cost:platform.service_fee_rate',
        'pricing:net-profit',
      ]),
    );
  });

  it('returns incomplete without fabricated profit when financial rules need review', () => {
    const result = simulatePinduoduo({
      campaignPrice: moneyFromMinorUnits(10_000n),
      components: components(),
      costs: costs(),
      rounding: roundingPolicy('half-up'),
      ruleSnapshot: snapshot('incomplete'),
      search: { minimumMinorUnits: 5_000n, maximumMinorUnits: 12_000n },
    });

    expect(result.status).toBe('incomplete');
    expect(result.financial).toBeNull();
    expect(result.breakEvenCampaignPrice).toBeNull();
    expect(result.issues).toContain('RULE_NEEDS_REVIEW:platform.commission_rate');
  });

  it('marks estimated costs as warning while preserving deterministic answers', () => {
    const estimated = costs().map((cost, index) =>
      index === 0 ? ({ ...cost, status: 'estimated' } as CostItem) : cost,
    );
    const first = simulatePinduoduo({
      campaignPrice: moneyFromMinorUnits(10_000n),
      components: components(),
      costs: estimated,
      rounding: roundingPolicy('half-up'),
      ruleSnapshot: snapshot('verified'),
      search: { minimumMinorUnits: 5_000n, maximumMinorUnits: 12_000n },
    });
    const second = simulatePinduoduo({
      campaignPrice: moneyFromMinorUnits(10_000n),
      components: components(),
      costs: estimated,
      rounding: roundingPolicy('half-up'),
      ruleSnapshot: snapshot('verified'),
      search: { minimumMinorUnits: 5_000n, maximumMinorUnits: 12_000n },
    });

    expect(first.status).toBe('warning');
    expect(second).toEqual(first);
  });
});

function components(): readonly PromotionComponent[] {
  return [
    {
      key: 'merchant-coupon',
      kind: 'coupon',
      funder: 'merchant',
      priority: 1,
      threshold: moneyFromMinorUnits(0n),
      amount: moneyFromMinorUnits(1_000n),
    },
    {
      key: 'platform-coupon',
      kind: 'coupon',
      funder: 'platform',
      priority: 2,
      threshold: moneyFromMinorUnits(0n),
      amount: moneyFromMinorUnits(2_000n),
    },
  ];
}

function costs(): readonly CostItem[] {
  return [
    {
      key: 'materials',
      label: '材料',
      kind: 'per_unit',
      classification: 'cost_of_goods',
      critical: true,
      status: 'confirmed',
      amount: moneyFromMinorUnits(5_000n),
    },
  ];
}

function snapshot(status: 'verified' | 'incomplete'): RuleSnapshot {
  const needsReview = status === 'incomplete';
  const rule = (key: string, config: Record<string, string | null>) => ({
    key,
    type: key.startsWith('promotion.') ? ('promotion' as const) : ('financial' as const),
    scope: { level: 'platform' as const },
    provenance: {
      url: 'https://www.yangkeduo.com/home/help/',
      title: '拼多多帮助中心',
      type: 'official' as const,
    },
    verifiedAt: '2026-09-02T00:00:00.000Z',
    effectiveFrom: '2026-09-02T00:00:00.000Z',
    expiresAt: null,
    status: needsReview ? ('needs_review' as const) : ('verified' as const),
    summary: '测试规则',
    implementationNote: '测试规则',
    config,
    impact: 'financial' as const,
  });
  const rules = [
    rule('platform.commission_rate', {
      rateBasisPoints: needsReview ? null : '1000',
    }),
    rule('platform.service_fee_rate', {
      rateBasisPoints: needsReview ? null : '500',
    }),
    rule('promotion.platform_subsidy_attribution', {
      defaultBearer: needsReview ? null : 'platform',
    }),
  ];
  const issues = needsReview
    ? rules.map(({ key }) => ({
        code: 'RULE_NEEDS_REVIEW' as const,
        key,
        message: 'Rule needs human review.',
      }))
    : [];
  return {
    platformId: 'pinduoduo',
    categoryCode: null,
    resolvedAt: '2026-09-02T00:00:00.000Z',
    status,
    rules,
    issues,
    hash: 'a'.repeat(64),
  };
}
