export interface AISettingsStatus {
  readonly provider: 'deepseek';
  readonly configured: boolean;
  readonly model: 'deepseek-chat';
}

export interface AISettingsApi {
  get(): Promise<AISettingsStatus>;
  configure(apiKey: string): Promise<AISettingsStatus>;
  clear(): Promise<AISettingsStatus>;
  testConnection(): Promise<{ readonly ok: boolean }>;
}

export function createBrowserAISettingsApi(fetcher: typeof fetch = fetch): AISettingsApi {
  const request = async (url: string, init?: RequestInit) => {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error('AI 设置操作失败');
    return response;
  };
  return {
    async get() {
      return (await (await request('/api/v1/ai/settings')).json()) as AISettingsStatus;
    },
    async configure(apiKey) {
      const response = await request('/api/v1/ai/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      return (await response.json()) as AISettingsStatus;
    },
    async clear() {
      return (await (
        await request('/api/v1/ai/settings', { method: 'DELETE' })
      ).json()) as AISettingsStatus;
    },
    async testConnection() {
      return (await (await request('/api/v1/ai/settings/test', { method: 'POST' })).json()) as {
        ok: boolean;
      };
    },
  };
}
