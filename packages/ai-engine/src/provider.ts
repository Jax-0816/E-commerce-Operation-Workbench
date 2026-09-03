export type ProviderMessageRole = 'system' | 'user' | 'assistant';

export interface ProviderMessage {
  readonly role: ProviderMessageRole;
  readonly content: string;
}

export interface ProviderRequest {
  readonly model: string;
  readonly messages: readonly ProviderMessage[];
  readonly temperature: number;
  readonly maxOutputTokens?: number;
  readonly responseFormat?: 'json';
}

export interface ProviderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface ProviderResponse {
  readonly provider: string;
  readonly responseId: string;
  readonly model: string;
  readonly content: string;
  readonly usage: ProviderUsage;
}

export interface ProviderCapabilities {
  readonly text: boolean;
  readonly structured: boolean;
}

export interface AIProvider {
  readonly id: string;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  testConnection(): Promise<boolean>;
  getCapabilities(): ProviderCapabilities;
}
