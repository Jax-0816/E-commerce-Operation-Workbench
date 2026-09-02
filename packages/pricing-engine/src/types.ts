import type { FormulaNode, Money, RoundingPolicy } from '@eaw/calculation-engine';

export type FinancialInputStatus = 'confirmed' | 'estimated' | 'missing';
export type CostClassification = 'cost_of_goods' | 'operating';
export type PercentageBase =
  'campaign_price' | 'consumer_payment' | 'merchant_settlement' | 'recognized_revenue';

interface CostItemBase {
  readonly classification: CostClassification;
  readonly critical: boolean;
  readonly key: string;
  readonly label: string;
  readonly status: FinancialInputStatus;
}

export interface AmountCostItem extends CostItemBase {
  readonly amount: Money | null;
  readonly allocationUnits?: bigint;
  readonly kind: 'fixed' | 'per_order' | 'per_unit';
  readonly unitsPerOrder?: bigint;
}

export interface PercentageCostItem extends CostItemBase {
  readonly base: PercentageBase;
  readonly kind: 'percentage';
  readonly rateBasisPoints: bigint | null;
}

export interface FormulaCostItem extends CostItemBase {
  readonly formula: FormulaNode | null;
  readonly kind: 'formula';
}

export type CostItem = AmountCostItem | FormulaCostItem | PercentageCostItem;

export type PricingGoal =
  | { readonly type: 'break_even' }
  | { readonly amount: Money; readonly type: 'target_unit_profit' }
  | { readonly basisPoints: bigint; readonly type: 'gross_margin' | 'net_margin' };

export interface PricingInput {
  readonly costs: readonly CostItem[];
  readonly currency: string;
  readonly goal: PricingGoal;
  readonly rounding: RoundingPolicy;
  readonly search: {
    readonly maximumMinorUnits: bigint;
    readonly minimumMinorUnits: bigint;
  };
}

export interface SignedMoney {
  readonly currency: string;
  readonly minorUnits: bigint;
}

export interface PricingTraceStep {
  readonly inputs: Readonly<Record<string, string>>;
  readonly operation: string;
  readonly outputMinorUnits: bigint;
}

export interface PricingOutcome {
  readonly campaignPrice: Money;
  readonly consumerPayment: Money;
  readonly costOfGoods: Money;
  readonly grossMarginBasisPoints: bigint | null;
  readonly grossProfit: SignedMoney;
  readonly merchantSettlement: Money;
  readonly netMarginBasisPoints: bigint | null;
  readonly netProfit: SignedMoney;
  readonly operatingCosts: Money;
  readonly recognizedRevenue: Money;
  readonly totalCosts: Money;
}

export interface PricingResult {
  readonly inputSummary: {
    readonly confirmed: readonly string[];
    readonly estimated: readonly string[];
    readonly missing: readonly string[];
  };
  readonly outcome: PricingOutcome;
  readonly prices: {
    readonly breakEven: Money | null;
    readonly minimumSafe: Money | null;
    readonly recommended: Money | null;
    readonly target: Money | null;
  };
  readonly status: 'incomplete' | 'invalid' | 'verified' | 'warning';
  readonly trace: readonly PricingTraceStep[];
}

export interface PricingCashFlowInput {
  readonly cashFlows: Readonly<Record<PercentageBase, Money>>;
  readonly costs: readonly CostItem[];
  readonly currency: string;
  readonly rounding: RoundingPolicy;
}

export interface PricingCashFlowResult {
  readonly inputSummary: PricingResult['inputSummary'];
  readonly outcome: PricingOutcome;
  readonly status: PricingResult['status'];
  readonly trace: readonly PricingTraceStep[];
}

export interface BreakEvenResult {
  readonly outcome: PricingOutcome;
  readonly previousOutcome: PricingOutcome | null;
  readonly price: Money;
  readonly trace: readonly PricingTraceStep[];
}
