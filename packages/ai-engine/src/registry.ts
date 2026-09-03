import type { AIProvider } from './provider.js';

export class AIProviderRegistry {
  readonly #providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    if (this.#providers.has(provider.id))
      throw new TypeError(`Duplicate AI provider: ${provider.id}`);
    this.#providers.set(provider.id, provider);
  }

  get(id: string): AIProvider | undefined {
    return this.#providers.get(id);
  }

  list(): readonly AIProvider[] {
    return [...this.#providers.values()].sort((left, right) => left.id.localeCompare(right.id));
  }
}
