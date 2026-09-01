export interface CalculatePricingRequest {
  readonly name: string;
  readonly goal:
    | { readonly type: 'break_even' }
    | { readonly type: 'target_unit_profit'; readonly amountMinorUnits: string }
    | { readonly type: 'gross_margin' | 'net_margin'; readonly basisPoints: string };
  readonly minimumMinorUnits: string;
  readonly maximumMinorUnits: string;
}

interface MoneyResponse {
  readonly currency: string;
  readonly minorUnits: string;
}

interface ScenarioResponse {
  readonly id: string;
  readonly skuId: string;
  readonly costProfileId: string;
  readonly costProfileRevisionNo: number;
  readonly name: string;
  readonly goalSnapshot: unknown;
  readonly createdAt: string;
}

interface ResultRecordResponse {
  readonly id: string;
  readonly scenarioId: string;
  readonly skuId: string;
  readonly status: PricingStatus;
  readonly inputSnapshot: unknown;
  readonly resultSnapshot: unknown;
  readonly engineVersion: string;
  readonly createdAt: string;
}

export type PricingStatus = 'incomplete' | 'invalid' | 'verified' | 'warning';

export interface PricingCalculationResponse {
  readonly scenario: ScenarioResponse;
  readonly record: ResultRecordResponse;
  readonly pricing: {
    readonly status: PricingStatus;
    readonly inputSummary: {
      readonly confirmed: readonly string[];
      readonly estimated: readonly string[];
      readonly missing: readonly string[];
    };
    readonly prices: {
      readonly breakEven: MoneyResponse | null;
      readonly minimumSafe: MoneyResponse | null;
      readonly target: MoneyResponse | null;
      readonly recommended: MoneyResponse | null;
    };
    readonly outcome: {
      readonly campaignPrice: MoneyResponse;
      readonly consumerPayment: MoneyResponse;
      readonly recognizedRevenue: MoneyResponse;
      readonly merchantSettlement: MoneyResponse;
      readonly costOfGoods: MoneyResponse;
      readonly operatingCosts: MoneyResponse;
      readonly totalCosts: MoneyResponse;
      readonly grossProfit: MoneyResponse;
      readonly netProfit: MoneyResponse;
      readonly grossMarginBasisPoints: string | null;
      readonly netMarginBasisPoints: string | null;
    };
    readonly trace: readonly {
      readonly operation: string;
      readonly inputs: Readonly<Record<string, string>>;
      readonly outputMinorUnits: string;
    }[];
  };
}

export interface PricingHistoryResponse {
  readonly items: readonly {
    readonly scenario: ScenarioResponse;
    readonly results: readonly ResultRecordResponse[];
  }[];
}

export interface PricingApi {
  calculate(
    productId: string,
    skuId: string,
    input: CalculatePricingRequest,
  ): Promise<PricingCalculationResponse>;
  history(productId: string, skuId: string): Promise<PricingHistoryResponse>;
}

export function createBrowserPricingApi(fetcher: typeof fetch = fetch): PricingApi {
  const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error('定价计算失败，请检查成本档案与输入');
    return (await response.json()) as T;
  };
  return {
    calculate: (productId, skuId, input) =>
      request(`/api/v1/products/${productId}/skus/${skuId}/pricing-calculations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    history: (productId, skuId) =>
      request(`/api/v1/products/${productId}/skus/${skuId}/pricing-history`),
  };
}
