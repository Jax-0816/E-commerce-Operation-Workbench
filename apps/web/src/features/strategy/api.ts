export type StrategyKind = 'competitor_analysis' | 'market_insight' | 'selling_point_set';

export interface EvidenceReference {
  readonly kind: 'product_fact' | 'competitor_snapshot' | 'market_insight';
  readonly id: string;
  readonly productId: string;
}

export interface StrategyAssetItem {
  readonly id: string;
  readonly productId: string;
  readonly kind: StrategyKind;
  readonly revisionNo: number;
  readonly generationId: string;
  readonly status: 'verified' | 'needs_review';
  readonly payload: Record<string, unknown>;
  readonly supersedesAssetId: string | null;
  readonly createdAt: string;
}

export interface StrategyApi {
  generate(productId: string, kind: StrategyKind): Promise<StrategyAssetItem>;
  list(productId: string, kind: StrategyKind): Promise<readonly StrategyAssetItem[]>;
}

export function createBrowserStrategyApi(fetcher: typeof fetch = fetch): StrategyApi {
  const request = async (url: string, method = 'GET') => {
    const response = await fetcher(url, { method });
    if (!response.ok) throw new Error('策略请求失败');
    return response.json() as Promise<unknown>;
  };
  return {
    async generate(productId, kind) {
      return (await request(
        `/api/v1/products/${productId}/strategy/${kind}/generate`,
        'POST',
      )) as StrategyAssetItem;
    },
    async list(productId, kind) {
      const result = (await request(`/api/v1/products/${productId}/strategy/${kind}`)) as {
        items: StrategyAssetItem[];
      };
      return result.items;
    },
  };
}
