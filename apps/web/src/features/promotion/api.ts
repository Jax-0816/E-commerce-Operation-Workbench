export interface MoneyResponse {
  readonly currency: string;
  readonly minorUnits: string;
}

export type PromotionStatus = 'incomplete' | 'verified' | 'warning';

export type PromotionComponentRequest =
  | {
      readonly amount: MoneyResponse;
      readonly funder: 'merchant' | 'platform';
      readonly key: string;
      readonly kind: 'coupon' | 'fixed_reduction';
      readonly priority: number;
      readonly threshold: MoneyResponse;
    }
  | {
      readonly funder: 'merchant' | 'platform';
      readonly key: string;
      readonly kind: 'percentage_discount';
      readonly maximumReduction: MoneyResponse | null;
      readonly payRateBasisPoints: string;
      readonly priority: number;
      readonly threshold: MoneyResponse;
    };

export interface CreatePromotionScenarioRequest {
  readonly categoryCode: string | null;
  readonly components: readonly PromotionComponentRequest[];
  readonly maximumMinorUnits: string;
  readonly minimumMinorUnits: string;
  readonly name: string;
  readonly region: string;
}

export interface PromotionScenarioResponse {
  readonly configurationSnapshot: unknown;
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
  readonly platformId: 'pinduoduo';
  readonly productId: string;
  readonly region: string;
  readonly ruleSnapshotHash: string;
  readonly ruleSnapshotId: string;
}

interface PromotionResultRecordResponse {
  readonly costProfileId: string | null;
  readonly costProfileRevisionNo: number | null;
  readonly createdAt: string;
  readonly engineVersion: string;
  readonly id: string;
  readonly inputSnapshot: unknown;
  readonly resultSnapshot: unknown;
  readonly scenarioId: string;
  readonly skuId: string;
  readonly status: PromotionStatus;
}

export interface PromotionSimulationResponse {
  readonly breakEvenCampaignPrice: MoneyResponse | null;
  readonly financial: {
    readonly campaignPrice: MoneyResponse;
    readonly consumerPayment: MoneyResponse;
    readonly costOfGoods: MoneyResponse;
    readonly grossMarginBasisPoints: string | null;
    readonly grossProfit: MoneyResponse;
    readonly merchantSettlement: MoneyResponse;
    readonly netMarginBasisPoints: string | null;
    readonly netProfit: MoneyResponse;
    readonly operatingCosts: MoneyResponse;
    readonly recognizedRevenue: MoneyResponse;
    readonly totalCosts: MoneyResponse;
  } | null;
  readonly issues: readonly string[];
  readonly promotion: {
    readonly campaignPrice: MoneyResponse;
    readonly consumerPayment: MoneyResponse;
    readonly merchantFundedDiscount: MoneyResponse;
    readonly merchantSettlement: MoneyResponse;
    readonly platformFundedDiscount: MoneyResponse;
    readonly recognizedRevenue: MoneyResponse;
    readonly totalDiscount: MoneyResponse;
    readonly trace: readonly unknown[];
  };
  readonly ruleSnapshotHash: string;
  readonly status: PromotionStatus;
  readonly trace: readonly {
    readonly inputs: Readonly<Record<string, string>>;
    readonly operation: string;
    readonly outputMinorUnits: string;
  }[];
}

export interface PromotionBatchResponse {
  readonly rows: readonly {
    readonly record: PromotionResultRecordResponse;
    readonly simulation: PromotionSimulationResponse;
    readonly skuId: string;
    readonly status: PromotionStatus;
  }[];
  readonly scenario: PromotionScenarioResponse;
}

export interface PromotionHistoryResponse {
  readonly items: readonly {
    readonly results: readonly PromotionResultRecordResponse[];
    readonly scenario: PromotionScenarioResponse;
  }[];
}

export interface PromotionApi {
  calculate(
    scenarioId: string,
    input: {
      readonly rows: readonly {
        readonly campaignPrice: MoneyResponse;
        readonly skuId: string;
      }[];
    },
  ): Promise<PromotionBatchResponse>;
  create(
    productId: string,
    input: CreatePromotionScenarioRequest,
  ): Promise<PromotionScenarioResponse>;
  history(productId: string): Promise<PromotionHistoryResponse>;
}

export function createBrowserPromotionApi(fetcher: typeof fetch = fetch): PromotionApi {
  const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error('活动模拟失败，请检查规则包、成本档案和输入');
    return (await response.json()) as T;
  };
  return {
    create: (productId, input) =>
      request(`/api/v1/products/${productId}/promotion-scenarios`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    calculate: (scenarioId, input) =>
      request(`/api/v1/promotion-scenarios/${scenarioId}/calculate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    history: (productId) => request(`/api/v1/products/${productId}/promotion-scenarios`),
  };
}
