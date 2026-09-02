import type { Money, RoundingPolicy } from '@eaw/calculation-engine';

export type PromotionFunder = 'merchant' | 'platform';

interface PromotionComponentBase {
  readonly funder: PromotionFunder;
  readonly key: string;
  readonly priority: number;
  readonly threshold: Money;
}

export interface FixedReductionComponent extends PromotionComponentBase {
  readonly amount: Money;
  readonly kind: 'fixed_reduction';
}

export interface CouponComponent extends PromotionComponentBase {
  readonly amount: Money;
  readonly kind: 'coupon';
}

export interface PercentageDiscountComponent extends PromotionComponentBase {
  readonly kind: 'percentage_discount';
  readonly maximumReduction: Money | null;
  readonly payRateBasisPoints: bigint;
}

export type PromotionComponent =
  CouponComponent | FixedReductionComponent | PercentageDiscountComponent;

export interface PromotionInput {
  readonly campaignPrice: Money;
  readonly components: readonly PromotionComponent[];
  readonly rounding: RoundingPolicy;
}

export interface PromotionTraceStep {
  readonly afterConsumerPaymentMinorUnits: bigint;
  readonly afterMerchantSettlementMinorUnits: bigint;
  readonly appliedMinorUnits: bigint;
  readonly beforeConsumerPaymentMinorUnits: bigint;
  readonly beforeMerchantSettlementMinorUnits: bigint;
  readonly componentKey: string;
  readonly eligible: boolean;
  readonly funder: PromotionFunder;
  readonly kind: PromotionComponent['kind'];
  readonly requestedMinorUnits: bigint;
}

export interface PromotionResult {
  readonly campaignPrice: Money;
  readonly consumerPayment: Money;
  readonly merchantFundedDiscount: Money;
  readonly merchantSettlement: Money;
  readonly platformFundedDiscount: Money;
  readonly recognizedRevenue: Money;
  readonly totalDiscount: Money;
  readonly trace: readonly PromotionTraceStep[];
}

export interface CampaignPriceInput {
  readonly components: readonly PromotionComponent[];
  readonly currency: string;
  readonly minimumMerchantSettlement: Money;
  readonly rounding: RoundingPolicy;
  readonly search: {
    readonly maximumMinorUnits: bigint;
    readonly minimumMinorUnits: bigint;
  };
}

export interface CampaignPriceResult {
  readonly campaignPrice: Money | null;
  readonly evaluatedCandidates: number;
  readonly promotion: PromotionResult | null;
}
