export const PLATFORM_IDS = ['pinduoduo', 'taobao', 'douyin'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface PlatformProfileResponse {
  readonly id: string;
  readonly productId: string;
  readonly platformId: PlatformId;
  readonly categoryCode: string | null;
  readonly categoryName: string | null;
  readonly externalProductId: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly status: 'draft' | 'ready';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SavePlatformProfileInput {
  readonly categoryCode: string | null;
  readonly categoryName: string | null;
  readonly externalProductId: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly expectedUpdatedAt?: string;
}

export interface PlatformProfilesApi {
  get(productId: string, platformId: PlatformId): Promise<PlatformProfileResponse | undefined>;
  getCapabilities(platformId: PlatformId): Promise<PlatformCapabilitiesResponse>;
  save(
    productId: string,
    platformId: PlatformId,
    input: SavePlatformProfileInput,
  ): Promise<PlatformProfileResponse>;
}

export type CapabilityStatus =
  'supported' | 'generic' | 'requires_rule_pack' | 'incomplete' | 'unavailable';

export interface CapabilityState {
  readonly status: CapabilityStatus;
  readonly available: boolean;
  readonly message: string;
}

export interface PlatformCapabilitiesResponse {
  readonly platformId: 'pinduoduo' | 'taobao_tmall' | 'douyin_ecommerce';
  readonly profilePlatformId: PlatformId;
  readonly displayName: string;
  readonly capabilities: Readonly<
    Record<'content' | 'creative' | 'pricing' | 'promotion' | 'fee_model', CapabilityState>
  >;
}

export function createBrowserPlatformProfilesApi(
  fetcher: typeof fetch = fetch,
): PlatformProfilesApi {
  return {
    async get(productId, platformId) {
      const response = await fetcher(endpoint(productId, platformId));
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error('加载平台档案失败');
      return (await response.json()) as PlatformProfileResponse;
    },
    async save(productId, platformId, input) {
      const response = await fetcher(endpoint(productId, platformId), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error('保存平台档案失败');
      return (await response.json()) as PlatformProfileResponse;
    },
    async getCapabilities(platformId) {
      const response = await fetcher(`/api/v1/platforms/${platformId}/capabilities`);
      if (!response.ok) throw new Error('加载平台能力失败');
      return (await response.json()) as PlatformCapabilitiesResponse;
    },
  };
}

function endpoint(productId: string, platformId: PlatformId): string {
  return `/api/v1/products/${productId}/platform-profiles/${platformId}`;
}
