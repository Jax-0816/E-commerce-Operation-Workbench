export type ContentPlatform = 'pinduoduo' | 'taobao' | 'douyin';
export interface EvidenceRef {
  readonly kind: 'product_fact' | 'strategy_asset' | 'title_revision';
  readonly id: string;
  readonly productId: string;
}
export interface CreativeItem {
  readonly id: string;
  readonly order: number;
  readonly role: 'hero' | 'supporting';
  readonly headline: string;
  readonly body: string;
  readonly promptZh: string;
  readonly promptEn: string;
  readonly negativePromptZh: string;
  readonly negativePromptEn: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly reviewTerms: readonly string[];
  readonly locked: boolean;
}
export interface DetailSection {
  readonly id: string;
  readonly order: number;
  readonly kind:
    'hero' | 'benefit' | 'specification' | 'scenario' | 'trust' | 'faq' | 'call_to_action';
  readonly headline: string;
  readonly body: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly reviewTerms: readonly string[];
  readonly locked: boolean;
}
interface BaseView {
  readonly stale: boolean;
  readonly staleReasons: readonly string[];
}
export interface CreativePlanView extends BaseView {
  readonly revision: {
    readonly id: string;
    readonly lineageId: string;
    readonly productId: string;
    readonly platformId: ContentPlatform;
    readonly revisionNo: number;
    readonly origin: 'generated' | 'regenerated_item' | 'locked_item' | 'reordered';
    readonly status: 'verified' | 'needs_review';
    readonly items: readonly CreativeItem[];
    readonly dependencyHashes: Readonly<Record<string, string>>;
    readonly validationIssues: readonly {
      readonly itemId: string;
      readonly code: string;
      readonly detail: string;
    }[];
    readonly generationId: string | null;
    readonly supersedesRevisionId: string | null;
    readonly createdAt: string;
  };
}
export interface DetailPageView extends BaseView {
  readonly revision: {
    readonly id: string;
    readonly revisionNo: number;
    readonly origin: 'generated' | 'locked_section' | 'reordered';
    readonly status: 'verified' | 'needs_review';
    readonly sections: readonly DetailSection[];
    readonly createdAt: string;
  };
}
export interface ContentBuildersApi {
  listCreative(
    productId: string,
    platformId: ContentPlatform,
  ): Promise<readonly CreativePlanView[]>;
  generateCreative(productId: string, platformId: ContentPlatform): Promise<CreativePlanView>;
  regenerateCreativeItem(
    productId: string,
    platformId: ContentPlatform,
    itemId: string,
  ): Promise<CreativePlanView>;
  lockCreativeItem(
    productId: string,
    platformId: ContentPlatform,
    itemId: string,
  ): Promise<CreativePlanView>;
  reorderCreative(
    productId: string,
    platformId: ContentPlatform,
    orderedIds: readonly string[],
  ): Promise<CreativePlanView>;
  listDetail(productId: string, platformId: ContentPlatform): Promise<readonly DetailPageView[]>;
  generateDetail(productId: string, platformId: ContentPlatform): Promise<DetailPageView>;
  lockDetailSection(
    productId: string,
    platformId: ContentPlatform,
    sectionId: string,
  ): Promise<DetailPageView>;
  reorderDetail(
    productId: string,
    platformId: ContentPlatform,
    orderedIds: readonly string[],
  ): Promise<DetailPageView>;
}
export function createBrowserContentBuildersApi(fetcher: typeof fetch = fetch): ContentBuildersApi {
  const call = async <T>(
    productId: string,
    platformId: ContentPlatform,
    path: string,
    init?: RequestInit,
  ) => {
    const response = await fetcher(
      `/api/v1/products/${productId}/${path}?platformId=${platformId}`,
      init,
    );
    if (!response.ok) throw new Error('内容构建请求失败');
    return response.json() as Promise<T>;
  };
  const post = { method: 'POST', headers: { 'content-type': 'application/json' } };
  return {
    async listCreative(p, x) {
      return (await call<{ items: CreativePlanView[] }>(p, x, 'creative')).items;
    },
    async generateCreative(p, x) {
      return call(p, x, 'creative/generate', post);
    },
    async regenerateCreativeItem(p, x, id) {
      return call(p, x, `creative/items/${id}/regenerate`, post);
    },
    async lockCreativeItem(p, x, id) {
      return call(p, x, `creative/items/${id}/lock`, post);
    },
    async reorderCreative(p, x, orderedIds) {
      return call(p, x, 'creative/reorder', { ...post, body: JSON.stringify({ orderedIds }) });
    },
    async listDetail(p, x) {
      return (await call<{ items: DetailPageView[] }>(p, x, 'detail')).items;
    },
    async generateDetail(p, x) {
      return call(p, x, 'detail/generate', post);
    },
    async lockDetailSection(p, x, id) {
      return call(p, x, `detail/sections/${id}/lock`, post);
    },
    async reorderDetail(p, x, orderedIds) {
      return call(p, x, 'detail/reorder', { ...post, body: JSON.stringify({ orderedIds }) });
    },
  };
}
