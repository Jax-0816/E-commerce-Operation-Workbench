import type { AIProvider } from '@eaw/ai-engine';
import { DomainError } from '@eaw/domain';
import type { SecretStore } from '@eaw/workspace';

const DEEPSEEK_SECRET_KEY = 'deepseek-api-key';

export interface AISettingsStatus {
  readonly provider: 'deepseek';
  readonly configured: boolean;
  readonly model: 'deepseek-chat';
}

export interface AISettingsApplication {
  get(): Promise<AISettingsStatus>;
  configure(input: { readonly apiKey: string }): Promise<AISettingsStatus>;
  clear(): Promise<AISettingsStatus>;
  testConnection(): Promise<{ readonly ok: boolean }>;
}

export function createAISettingsApplication(input: {
  readonly secrets: SecretStore;
  readonly providerFactory: (apiKey: string) => AIProvider;
}): AISettingsApplication {
  const get = async (): Promise<AISettingsStatus> => ({
    provider: 'deepseek',
    configured: await input.secrets.isConfigured(DEEPSEEK_SECRET_KEY),
    model: 'deepseek-chat',
  });
  return {
    get,
    async configure({ apiKey }) {
      const normalized = apiKey.trim();
      if (normalized.length < 8 || normalized.length > 500) {
        throw new DomainError('VALIDATION_ERROR', 'DeepSeek API key is invalid.');
      }
      await input.secrets.set(DEEPSEEK_SECRET_KEY, normalized);
      return get();
    },
    async clear() {
      await input.secrets.delete(DEEPSEEK_SECRET_KEY);
      return get();
    },
    async testConnection() {
      const apiKey = await input.secrets.get(DEEPSEEK_SECRET_KEY);
      if (apiKey === undefined) {
        throw new DomainError('AI_PROVIDER_UNAVAILABLE', 'DeepSeek is not configured.');
      }
      return { ok: await input.providerFactory(apiKey).testConnection() };
    },
  };
}
