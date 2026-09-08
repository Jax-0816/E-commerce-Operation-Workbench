export type WorkflowPlatformId = 'pinduoduo' | 'taobao' | 'douyin';
export type WorkflowNodeKey =
  | 'competitor_analysis'
  | 'market_insight'
  | 'selling_points'
  | 'titles'
  | 'creative'
  | 'detail_page';
export type WorkflowRunStatus =
  | 'not_started'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';
export type WorkflowNodeStatus =
  | 'not_started'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stale'
  | 'locked'
  | 'needs_review'
  | 'cancelled';

export interface WorkflowOutputReference {
  readonly assetType: string;
  readonly assetId: string;
  readonly revisionNo: number;
}
export interface WorkflowNode {
  readonly key: WorkflowNodeKey;
  readonly taskType: string;
  readonly status: WorkflowNodeStatus;
  readonly dependencyHash: string | null;
  readonly output: WorkflowOutputReference | null;
  readonly error: { readonly code: string; readonly message: string } | null;
}
export interface WorkflowRun {
  readonly id: string;
  readonly productId: string;
  readonly platformId: WorkflowPlatformId;
  readonly definition: {
    readonly definitionId: 'product_content';
    readonly version: string;
    readonly nodes: readonly {
      readonly key: WorkflowNodeKey;
      readonly taskType: string;
      readonly dependsOn: readonly WorkflowNodeKey[];
      readonly order: number;
    }[];
  };
  readonly status: WorkflowRunStatus;
  readonly revision: number;
  readonly cancellationRequested: boolean;
  readonly nodes: readonly WorkflowNode[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface WorkflowPreflight {
  readonly definitionId: 'product_content';
  readonly definitionVersion: string;
  readonly productId: string;
  readonly platformId: WorkflowPlatformId;
  readonly nodes: readonly {
    readonly key: WorkflowNodeKey;
    readonly taskType: string;
    readonly order: number;
    readonly runnable: boolean;
    readonly missingInputs: readonly string[];
    readonly dependencyHash: string;
    readonly reusableOutput?: WorkflowOutputReference;
  }[];
}
export interface WorkflowEvent {
  readonly workflowRunId: string;
  readonly sequence: number;
  readonly type: string;
  readonly runRevision: number;
  readonly nodeKey: WorkflowNodeKey | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface WorkflowApi {
  preflight(productId: string, platformId: WorkflowPlatformId): Promise<WorkflowPreflight>;
  start(productId: string, platformId: WorkflowPlatformId): Promise<WorkflowRun>;
  list(productId: string): Promise<readonly WorkflowRun[]>;
  get(runId: string): Promise<WorkflowRun>;
  resume(runId: string, expectedRevision: number): Promise<WorkflowRun>;
  retry(runId: string, nodeKey: WorkflowNodeKey, expectedRevision: number): Promise<WorkflowRun>;
  cancel(runId: string, expectedRevision: number): Promise<WorkflowRun>;
  subscribe(
    runId: string,
    afterSequence: number,
    onEvent: (event: WorkflowEvent) => void,
    onDisconnect: () => void,
  ): () => void;
}

interface EventSourcePort {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
}

const eventTypes = [
  'workflow_created',
  'workflow_started',
  'workflow_completed',
  'workflow_cancelled',
  'workflow_interrupted',
  'node_stale',
  'node_claimed',
  'node_completed',
  'node_failed',
] as const;

export function createBrowserWorkflowApi(
  fetcher: typeof fetch = fetch,
  eventSourceFactory: (url: string) => EventSourcePort = (url) => new EventSource(url),
): WorkflowApi {
  const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(url, init);
    if (!response.ok) throw new Error('工作流请求失败');
    return response.json() as Promise<T>;
  };
  const body = (value: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
  return {
    preflight: (productId, platformId) =>
      request(`/api/v1/products/${encodeURIComponent(productId)}/workflows/preflight`, body({ platformId, definitionId: 'product_content' })),
    start: (productId, platformId) =>
      request(`/api/v1/products/${encodeURIComponent(productId)}/workflows`, body({ platformId, definitionId: 'product_content' })),
    async list(productId) {
      const response = await request<{ items: WorkflowRun[] }>(`/api/v1/products/${encodeURIComponent(productId)}/workflows`);
      return response.items;
    },
    get: (runId) => request(`/api/v1/workflows/${encodeURIComponent(runId)}`),
    resume: (runId, expectedRevision) =>
      request(`/api/v1/workflows/${encodeURIComponent(runId)}/resume`, body({ expectedRevision })),
    retry: (runId, nodeKey, expectedRevision) =>
      request(`/api/v1/workflows/${encodeURIComponent(runId)}/nodes/${nodeKey}/retry`, body({ expectedRevision })),
    cancel: (runId, expectedRevision) =>
      request(`/api/v1/workflows/${encodeURIComponent(runId)}/cancel`, body({ expectedRevision })),
    subscribe(runId, afterSequence, onEvent, onDisconnect) {
      const source = eventSourceFactory(
        `/api/v1/workflows/${encodeURIComponent(runId)}/events?afterSequence=${afterSequence}`,
      );
      for (const type of eventTypes) {
        source.addEventListener(type, (message) => {
          try {
            onEvent(JSON.parse(message.data) as WorkflowEvent);
          } catch {
            onDisconnect();
          }
        });
      }
      source.onerror = () => onDisconnect();
      return () => source.close();
    },
  };
}
