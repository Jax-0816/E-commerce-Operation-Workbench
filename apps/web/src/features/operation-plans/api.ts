export type OperationPlanPlatformId = 'pinduoduo' | 'taobao' | 'douyin';
export type OperationPlanStatus = 'draft' | 'locked';
export type OperationPlanBlockerCode =
  | 'SOURCE_STALE'
  | 'SOURCE_NEEDS_REVIEW'
  | 'CONTENT_UNLOCKED'
  | 'FINANCIAL_INPUT_MISMATCH'
  | 'RULE_SNAPSHOT_MISMATCH';

export interface CreateOperationPlanInput {
  readonly workflowRunId: string;
  readonly pricingRecordId: string;
  readonly promotionScenarioId?: string;
  readonly promotionResultIds?: readonly string[];
}

export interface OperationPlanNodeSource {
  readonly nodeKey:
    | 'competitor_analysis'
    | 'market_insight'
    | 'selling_points'
    | 'titles'
    | 'creative'
    | 'detail_page';
  readonly assetType: string;
  readonly assetId: string;
  readonly revisionNo: number;
  readonly dependencyHash: string;
}

export interface OperationPlanResponse {
  readonly id: string;
  readonly lineageId: string;
  readonly productId: string;
  readonly platformId: OperationPlanPlatformId;
  readonly revisionNo: number;
  readonly status: OperationPlanStatus;
  readonly lockedAt: string | null;
  readonly sources: {
    readonly workflowRunId: string;
    readonly workflowRunRevision: number;
    readonly nodes: readonly OperationPlanNodeSource[];
    readonly competitorSnapshotIds: readonly string[];
    readonly pricing: {
      readonly resultId: string;
      readonly scenarioId: string;
      readonly skuId: string;
      readonly costProfileId: string;
      readonly costProfileRevisionNo: number;
    };
    readonly promotion: {
      readonly scenarioId: string;
      readonly resultIds: readonly string[];
      readonly ruleSnapshotHash: string;
    } | null;
  };
  readonly sourceHash: string;
  readonly blockers: readonly {
    readonly code: OperationPlanBlockerCode;
    readonly source: string;
  }[];
  readonly supersedesRevisionId: string | null;
  readonly createdAt: string;
}

export interface OperationPlansApi {
  create(productId: string, input: CreateOperationPlanInput): Promise<OperationPlanResponse>;
  list(productId: string): Promise<readonly OperationPlanResponse[]>;
  get(operationPlanId: string): Promise<OperationPlanResponse>;
  lock(operationPlanId: string, expectedRevisionNo: number): Promise<OperationPlanResponse>;
}

export function createBrowserOperationPlansApi(fetcher: typeof fetch = fetch): OperationPlansApi {
  const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error('运营方案请求失败');
    return response.json() as Promise<T>;
  };
  const post = (value: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });

  return {
    create: (productId, input) =>
      request(`/api/v1/products/${encodeURIComponent(productId)}/operation-plans`, post(input)),
    async list(productId) {
      const response = await request<{ readonly items: readonly OperationPlanResponse[] }>(
        `/api/v1/products/${encodeURIComponent(productId)}/operation-plans`,
      );
      return response.items;
    },
    get: (operationPlanId) =>
      request(`/api/v1/operation-plans/${encodeURIComponent(operationPlanId)}`),
    lock: (operationPlanId, expectedRevisionNo) =>
      request(
        `/api/v1/operation-plans/${encodeURIComponent(operationPlanId)}/lock`,
        post({ expectedRevisionNo }),
      ),
  };
}
