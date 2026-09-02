export type RulePlatformId = 'pinduoduo' | 'taobao_tmall' | 'douyin_ecommerce';
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface RuleDefinitionResponse {
  readonly key: string;
  readonly type: 'financial' | 'promotion' | 'content' | 'category_mapping' | 'rounding';
  readonly scope:
    | { readonly level: 'platform' | 'user' | 'fallback' }
    | { readonly level: 'category'; readonly categoryCode: string };
  readonly provenance: {
    readonly url: string;
    readonly title: string;
    readonly type: 'official' | 'documentation' | 'merchant' | 'other';
  };
  readonly verifiedAt: string;
  readonly effectiveFrom: string;
  readonly expiresAt: string | null;
  readonly status: 'verified' | 'needs_review';
  readonly summary: string;
  readonly implementationNote: string;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly impact: 'financial' | 'non_financial';
}

export interface RulePackRecordResponse {
  readonly id: string;
  readonly manifest: {
    readonly schemaVersion: '1';
    readonly platformId: RulePlatformId;
    readonly region: string;
    readonly version: string;
    readonly publisher: string;
    readonly verifiedAt: string;
    readonly minimumAppVersion: string;
    readonly checksum: string;
    readonly description: string;
  };
  readonly rules: readonly RuleDefinitionResponse[];
  readonly installedAt: string;
  readonly activatedAt: string | null;
  readonly active: boolean;
}

export interface RulePackDiffResponse {
  readonly added: readonly RuleDefinitionResponse[];
  readonly removed: readonly RuleDefinitionResponse[];
  readonly changed: readonly {
    readonly key: string;
    readonly before: RuleDefinitionResponse;
    readonly after: RuleDefinitionResponse;
  }[];
}

export interface RulePacksApi {
  list(platformId: RulePlatformId, region: string): Promise<readonly RulePackRecordResponse[]>;
  importJson(contents: string): Promise<RulePackRecordResponse>;
  importFile?(file: File): Promise<RulePackRecordResponse>;
  activate(id: string): Promise<RulePackRecordResponse>;
  diff(beforeId: string, afterId: string): Promise<RulePackDiffResponse>;
}

export function createBrowserRulePacksApi(fetcher: typeof fetch = fetch): RulePacksApi {
  const request = async (url: string, init?: RequestInit): Promise<Response> => {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error('规则包操作失败');
    return response;
  };
  return {
    async list(platformId, region) {
      const query = new URLSearchParams({ platformId, region });
      const response = await request(`/api/v1/rule-packs?${query}`);
      return ((await response.json()) as { items: RulePackRecordResponse[] }).items;
    },
    async importJson(contents) {
      const response = await request('/api/v1/rule-packs/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format: 'json', contents }),
      });
      return (await response.json()) as RulePackRecordResponse;
    },
    async importFile(file) {
      if (file.size > 6_000_000) throw new Error('规则包文件过大');
      if (!file.name.toLowerCase().endsWith('.zip')) return this.importJson(await file.text());
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const response = await request('/api/v1/rule-packs/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format: 'zip-base64', contents: btoa(binary) }),
      });
      return (await response.json()) as RulePackRecordResponse;
    },
    async activate(id) {
      const response = await request(`/api/v1/rule-packs/${encodeURIComponent(id)}/activate`, {
        method: 'POST',
      });
      return (await response.json()) as RulePackRecordResponse;
    },
    async diff(beforeId, afterId) {
      const query = new URLSearchParams({ against: beforeId });
      const response = await request(
        `/api/v1/rule-packs/${encodeURIComponent(afterId)}/diff?${query}`,
      );
      return (await response.json()) as RulePackDiffResponse;
    },
  };
}
