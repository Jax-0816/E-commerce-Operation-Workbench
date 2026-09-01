export type CostKind = 'fixed' | 'formula' | 'per_order' | 'per_unit' | 'percentage';
export type CostStatus = 'confirmed' | 'estimated' | 'missing';

export interface CostProfileItem {
  readonly key: string;
  readonly label: string;
  readonly kind: CostKind;
  readonly classification: 'cost_of_goods' | 'operating';
  readonly critical: boolean;
  readonly status: CostStatus;
  readonly amountMinorUnits: string | null;
  readonly allocationUnits: string | null;
  readonly unitsPerOrder: string | null;
  readonly rateBasisPoints: string | null;
  readonly percentageBase:
    'campaign_price' | 'consumer_payment' | 'merchant_settlement' | 'recognized_revenue' | null;
  readonly formula: unknown | null;
}

export interface CostProfileResponse {
  readonly id: string;
  readonly skuId: string;
  readonly currency: string;
  readonly revisionNo: number;
  readonly items: readonly CostProfileItem[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SaveCostProfileRequest {
  readonly currency: string;
  readonly expectedRevisionNo?: number;
  readonly items: readonly CostProfileItem[];
}

export interface CostsApi {
  get(productId: string, skuId: string): Promise<CostProfileResponse | undefined>;
  save(
    productId: string,
    skuId: string,
    input: SaveCostProfileRequest,
  ): Promise<CostProfileResponse>;
}

export function createBrowserCostsApi(fetcher: typeof fetch = fetch): CostsApi {
  return {
    async get(productId, skuId) {
      const response = await fetcher(`/api/v1/products/${productId}/skus/${skuId}/cost-profile`);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error('加载成本档案失败');
      return (await response.json()) as CostProfileResponse;
    },
    async save(productId, skuId, input) {
      const response = await fetcher(`/api/v1/products/${productId}/skus/${skuId}/cost-profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error('保存成本档案失败，请刷新后重试');
      return (await response.json()) as CostProfileResponse;
    },
  };
}
