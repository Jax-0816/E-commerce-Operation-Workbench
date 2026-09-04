export type TitlePlatform = 'pinduoduo' | 'taobao' | 'douyin';
export interface TitleCandidate {
  readonly variant: 'recommended' | 'search' | 'selling_point' | 'scenario';
  readonly text: string;
  readonly keywords: readonly string[];
  readonly claims: readonly {
    readonly text: string;
    readonly evidenceRefs: readonly {
      readonly kind: 'product_fact';
      readonly id: string;
      readonly productId: string;
    }[];
  }[];
  readonly reviewTerms: readonly string[];
}
export interface TitleAssetView {
  readonly revision: {
    readonly id: string;
    readonly revisionNo: number;
    readonly origin: 'generated' | 'edited' | 'locked';
    readonly status: 'verified' | 'needs_review';
    readonly locked: boolean;
    readonly titles: readonly TitleCandidate[];
    readonly validationIssues: readonly {
      readonly candidateIndex: number;
      readonly code: string;
      readonly detail: string;
    }[];
    readonly createdAt: string;
  };
  readonly stale: boolean;
  readonly staleReasons: readonly string[];
}
export interface TitlesApi {
  list(productId: string, platformId: TitlePlatform): Promise<readonly TitleAssetView[]>;
  generate(productId: string, platformId: TitlePlatform): Promise<TitleAssetView>;
  edit(
    productId: string,
    platformId: TitlePlatform,
    titles: readonly TitleCandidate[],
  ): Promise<TitleAssetView>;
  lock(productId: string, platformId: TitlePlatform): Promise<TitleAssetView>;
}
export function createBrowserTitlesApi(fetcher: typeof fetch = fetch): TitlesApi {
  const request = async (
    productId: string,
    platformId: TitlePlatform,
    suffix: string,
    init?: RequestInit,
  ) => {
    const response = await fetcher(
      `/api/v1/products/${productId}/titles${suffix}?platformId=${platformId}`,
      init,
    );
    if (!response.ok) throw new Error('标题请求失败');
    return response.json() as Promise<unknown>;
  };
  return {
    async list(productId, platformId) {
      return ((await request(productId, platformId, '')) as { items: TitleAssetView[] }).items;
    },
    async generate(productId, platformId) {
      return (await request(productId, platformId, '/generate', {
        method: 'POST',
      })) as TitleAssetView;
    },
    async edit(productId, platformId, titles) {
      return (await request(productId, platformId, '', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titles }),
      })) as TitleAssetView;
    },
    async lock(productId, platformId) {
      return (await request(productId, platformId, '/lock', { method: 'POST' })) as TitleAssetView;
    },
  };
}
