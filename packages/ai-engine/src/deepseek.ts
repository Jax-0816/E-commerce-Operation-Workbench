import { DomainError } from '@eaw/domain';

import type {
  AIProvider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderResponse,
} from './provider.js';
import { withRetry } from './retry.js';

interface DeepSeekProviderOptions {
  readonly apiKey: string;
  readonly endpoint?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

class RetryableProviderError extends Error {}

export class DeepSeekProvider implements AIProvider {
  readonly id = 'deepseek';
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #sleep: (delayMs: number) => Promise<void>;
  readonly #timeoutMs: number;
  readonly #maxAttempts: number;

  constructor(options: DeepSeekProviderOptions) {
    if (!options.apiKey.trim()) throw new TypeError('DeepSeek API key is required.');
    this.#apiKey = options.apiKey;
    this.#endpoint = (options.endpoint ?? 'https://api.deepseek.com').replace(/\/$/u, '');
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep =
      options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
    this.#timeoutMs = boundedInteger(options.timeoutMs ?? 30_000, 1, 120_000, 'timeoutMs');
    this.#maxAttempts = boundedInteger(options.maxAttempts ?? 3, 1, 5, 'maxAttempts');
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    validateRequest(request);
    try {
      return await withRetry(() => this.requestCompletion(request), {
        maxAttempts: this.#maxAttempts,
        baseDelayMs: 250,
        sleep: this.#sleep,
        shouldRetry: (error) => error instanceof RetryableProviderError,
      });
    } catch {
      throw new DomainError('AI_PROVIDER_UNAVAILABLE', 'DeepSeek request failed.');
    }
  }

  async testConnection(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(`${this.#endpoint}/models`, {
        headers: { authorization: `Bearer ${this.#apiKey}` },
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  getCapabilities(): ProviderCapabilities {
    return { text: true, structured: true };
  }

  private async requestCompletion(request: ProviderRequest): Promise<ProviderResponse> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new RetryableProviderError('DeepSeek request timed out.')),
      this.#timeoutMs,
    );
    let response: Response;
    try {
      response = await this.#fetch(`${this.#endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
          ...(request.responseFormat === 'json'
            ? { response_format: { type: 'json_object' } }
            : {}),
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new RetryableProviderError('Request timed out.');
      throw new RetryableProviderError('Network request failed.', { cause: error });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableProviderError(`Retryable upstream status ${response.status}.`);
      }
      throw new Error(`Non-retryable upstream status ${response.status}.`);
    }
    const payload = (await response.json()) as unknown;
    return parseResponse(payload);
  }
}

function parseResponse(input: unknown): ProviderResponse {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) invalidResponse();
  const payload = input as Record<string, unknown>;
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const message = objectValue(choice)?.message;
  const usage = objectValue(payload.usage);
  const content = objectValue(message)?.content;
  if (
    typeof payload.id !== 'string' ||
    typeof payload.model !== 'string' ||
    typeof content !== 'string' ||
    typeof usage?.prompt_tokens !== 'number' ||
    typeof usage.completion_tokens !== 'number' ||
    typeof usage.total_tokens !== 'number'
  ) {
    invalidResponse();
  }
  return {
    provider: 'deepseek',
    responseId: payload.id,
    model: payload.model,
    content,
    usage: {
      inputTokens: safeNonnegativeInteger(usage.prompt_tokens),
      outputTokens: safeNonnegativeInteger(usage.completion_tokens),
      totalTokens: safeNonnegativeInteger(usage.total_tokens),
    },
  };
}

function objectValue(input: unknown): Record<string, unknown> | undefined {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
}

function validateRequest(request: ProviderRequest): void {
  if (!request.model.trim() || request.messages.length === 0 || request.messages.length > 100) {
    throw new TypeError('Provider request is invalid.');
  }
  if (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2) {
    throw new TypeError('Provider temperature is invalid.');
  }
}

function safeNonnegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) invalidResponse();
  return value;
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} is outside the supported range.`);
  }
  return value;
}

function invalidResponse(): never {
  throw new Error('DeepSeek returned an invalid response.');
}
