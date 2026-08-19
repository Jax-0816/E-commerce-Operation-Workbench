export interface SkuMatrixResponse {
  readonly dimensions: readonly {
    id: string;
    name: string;
    position: number;
    values: readonly { id: string; label: string; position: number }[];
  }[];
  readonly skus: readonly {
    id: string;
    signature: string;
    valueIds: readonly string[];
    enabled: boolean;
    internalCode: string | null;
    externalCode: string | null;
    barcode: string | null;
    weightGrams: number | null;
  }[];
}
export interface SkusApi {
  get(productId: string): Promise<SkuMatrixResponse>;
  configure(
    productId: string,
    dimensions: readonly { name: string; values: readonly string[] }[],
  ): Promise<SkuMatrixResponse>;
  update(
    productId: string,
    skuId: string,
    input: SkuMatrixResponse['skus'][number],
  ): Promise<SkuMatrixResponse>;
}
export function createBrowserSkusApi(fetcher: typeof fetch = fetch): SkusApi {
  const request = async (url: string, init?: RequestInit) => {
    const r = await fetcher(url, init);
    if (!r.ok) throw new Error('保存 SKU 失败');
    return (await r.json()) as SkuMatrixResponse;
  };
  return {
    get: (id) => request(`/api/v1/products/${id}/skus`),
    configure: (id, dimensions) =>
      request(`/api/v1/products/${id}/skus`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dimensions }),
      }),
    update: (id, skuId, input) =>
      request(`/api/v1/products/${id}/skus/${skuId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: input.enabled,
          internalCode: input.internalCode,
          externalCode: input.externalCode,
          barcode: input.barcode,
          weightGrams: input.weightGrams,
        }),
      }),
  };
}
