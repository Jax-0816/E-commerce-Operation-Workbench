export interface NormalizedCountResponse {
  readonly kind: 'exact' | 'lower_bound' | 'approximate';
  readonly value: string;
}

export interface CompetitorImportRowResponse {
  readonly rowNumber: number;
  readonly name: string;
  readonly sourceUrl: string | null;
  readonly displayedPriceText: string | null;
  readonly normalizedPriceMinorUnits: string | null;
  readonly displayedSalesText: string | null;
  readonly normalizedSales: NormalizedCountResponse | null;
  readonly displayedReviewText: string | null;
  readonly normalizedReviews: NormalizedCountResponse | null;
  readonly skuTexts: readonly string[];
  readonly sellingPoints: readonly string[];
  readonly imageReferences: readonly string[];
  readonly capturedAtText: string | null;
  readonly rawPayload: Readonly<Record<string, string>>;
}

export interface CompetitorImportPreviewResponse {
  readonly productId: string;
  readonly format: 'csv' | 'paste' | 'xlsx';
  readonly sourceName: string;
  readonly valid: boolean;
  readonly rows: readonly CompetitorImportRowResponse[];
  readonly issues: readonly { rowNumber: number; field: string; code: 'invalid' | 'required' }[];
}

export interface CompetitorSnapshotResponse extends Omit<
  CompetitorImportRowResponse,
  'rowNumber' | 'capturedAtText'
> {
  readonly id: string;
  readonly competitorId: string;
  readonly productId: string;
  readonly importBatchId: string;
  readonly source: 'manual' | 'paste' | 'csv' | 'xlsx' | 'url';
  readonly capturedAt: string;
  readonly importedAt: string;
}

export interface CompetitorListItemResponse {
  readonly competitor: {
    readonly id: string;
    readonly productId: string;
    readonly name: string;
    readonly sourceUrl: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly archivedAt: string | null;
  };
  readonly latestSnapshot: CompetitorSnapshotResponse;
}

export interface CompetitorsApi {
  previewText(
    productId: string,
    input: { format: 'csv' | 'paste'; sourceName: string; content: string },
  ): Promise<CompetitorImportPreviewResponse>;
  previewFile(productId: string, file: File): Promise<CompetitorImportPreviewResponse>;
  confirm(
    productId: string,
    preview: CompetitorImportPreviewResponse,
  ): Promise<readonly CompetitorListItemResponse[]>;
  list(productId: string): Promise<readonly CompetitorListItemResponse[]>;
}

export function createBrowserCompetitorsApi(fetcher: typeof fetch = fetch): CompetitorsApi {
  const request = async (url: string, init?: RequestInit) => {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error('竞品导入操作失败');
    return response;
  };
  const preview = async (productId: string, payload: unknown) => {
    const response = await request(
      `/api/v1/products/${encodeURIComponent(productId)}/competitors/import/preview`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return (await response.json()) as CompetitorImportPreviewResponse;
  };
  return {
    previewText: preview,
    async previewFile(productId, file) {
      if (file.size > 5_000_000) throw new Error('竞品文件过大');
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return preview(productId, {
          format: 'xlsx',
          sourceName: file.name,
          contentsBase64: btoa(binary),
        });
      }
      return preview(productId, {
        format: 'csv',
        sourceName: file.name,
        content: await file.text(),
      });
    },
    async confirm(productId, previewResult) {
      const response = await request(
        `/api/v1/products/${encodeURIComponent(productId)}/competitors/import/confirm`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            previewProductId: previewResult.productId,
            format: previewResult.format,
            sourceName: previewResult.sourceName,
            rows: previewResult.rows,
          }),
        },
      );
      const imported = (await response.json()) as {
        items: readonly {
          competitor: CompetitorListItemResponse['competitor'];
          snapshot: CompetitorSnapshotResponse;
        }[];
      };
      return imported.items.map(({ competitor, snapshot }) => ({
        competitor,
        latestSnapshot: snapshot,
      }));
    },
    async list(productId) {
      const response = await request(
        `/api/v1/products/${encodeURIComponent(productId)}/competitors`,
      );
      return ((await response.json()) as { items: readonly CompetitorListItemResponse[] }).items;
    },
  };
}
