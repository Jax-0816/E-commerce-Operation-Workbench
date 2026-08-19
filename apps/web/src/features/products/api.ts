import type { ProductItem, ProductsApi } from './product-library.js';

interface ProductListResponse {
  readonly items: ProductItem[];
}

export function createBrowserProductsApi(): ProductsApi {
  return {
    async archive(id) {
      const response = await fetch(`/api/v1/products/${encodeURIComponent(id)}/archive`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Unable to archive product.');
    },
    async list() {
      const response = await fetch('/api/v1/products');
      if (!response.ok) throw new Error('Unable to load products.');
      return ((await response.json()) as ProductListResponse).items;
    },
    async create(input) {
      const response = await fetch('/api/v1/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error('Unable to create product.');
      return (await response.json()) as ProductItem;
    },
  };
}
