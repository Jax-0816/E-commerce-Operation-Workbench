import type { FactItem, FactsApi } from './fact-status-table.js';

interface FactListResponse {
  readonly items: FactItem[];
}

export interface BrowserFactsApi extends FactsApi {
  create(productId: string, input: unknown): Promise<FactItem>;
  update(productId: string, factId: string, input: unknown): Promise<FactItem>;
  revise(productId: string, factId: string, input: unknown): Promise<FactItem>;
  delete(productId: string, factId: string, expectedUpdatedAt: string): Promise<void>;
}

export function createBrowserFactsApi(): BrowserFactsApi {
  return {
    async list(productId) {
      const response = await fetch(base(productId));
      if (!response.ok) throw new Error('Unable to load facts.');
      return ((await response.json()) as FactListResponse).items;
    },
    async create(productId, input) {
      return write(base(productId), 'POST', input);
    },
    async update(productId, factId, input) {
      return write(item(productId, factId), 'PATCH', input);
    },
    async confirm(productId, factId, input) {
      return write(`${item(productId, factId)}/confirm`, 'POST', input);
    },
    async revise(productId, factId, input) {
      return write(`${item(productId, factId)}/revisions`, 'POST', input);
    },
    async delete(productId, factId, expectedUpdatedAt) {
      const response = await fetch(item(productId, factId), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedUpdatedAt }),
      });
      if (!response.ok) throw new Error('Unable to delete fact.');
    },
  };
}

function base(productId: string): string {
  return `/api/v1/products/${encodeURIComponent(productId)}/facts`;
}
function item(productId: string, factId: string): string {
  return `${base(productId)}/${encodeURIComponent(factId)}`;
}
async function write(url: string, method: 'POST' | 'PATCH', input: unknown): Promise<FactItem> {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Unable to write fact.');
  return (await response.json()) as FactItem;
}
