export interface WorkflowNodeDefinition {
  readonly key: string;
  readonly taskType: string;
  readonly dependsOn: readonly string[];
  readonly order: number;
}

export interface WorkflowDefinition {
  readonly definitionId: string;
  readonly version: string;
  readonly nodes: readonly WorkflowNodeDefinition[];
}

export type WorkflowRunStatus =
  'not_started' | 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled';

export type WorkflowNodeStatus =
  | 'not_started'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stale'
  | 'locked'
  | 'needs_review'
  | 'cancelled';

export interface RevisionedRunState {
  readonly status: WorkflowRunStatus;
  readonly revision: number;
}

export interface WorkflowNodeOutputReference {
  readonly assetType: string;
  readonly assetId: import('@eaw/domain').UuidV7;
  readonly revisionNo: number;
}

export interface WorkflowNodeError {
  readonly code: string;
  readonly message: string;
}

export interface WorkflowNode {
  readonly key: string;
  readonly taskType: string;
  readonly status: WorkflowNodeStatus;
  readonly dependencyHash: string | null;
  readonly output: WorkflowNodeOutputReference | null;
  readonly error: WorkflowNodeError | null;
}

export interface WorkflowRun {
  readonly id: import('@eaw/domain').UuidV7;
  readonly productId: import('@eaw/domain').UuidV7;
  readonly platformId: import('@eaw/domain').PlatformId;
  readonly definition: WorkflowDefinition;
  readonly status: WorkflowRunStatus;
  readonly revision: number;
  readonly cancellationRequested: boolean;
  readonly nodes: readonly WorkflowNode[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkflowNodeInspection {
  readonly dependencyHash: string;
  readonly reusableOutput?: WorkflowNodeOutputReference;
}

export interface WorkflowNodeResult {
  readonly status: 'completed' | 'locked' | 'needs_review';
  readonly output: WorkflowNodeOutputReference;
}

export interface WorkflowNodeInput {
  readonly workflowRunId: import('@eaw/domain').UuidV7;
  readonly productId: import('@eaw/domain').UuidV7;
  readonly platformId: import('@eaw/domain').PlatformId;
  readonly nodeKey: string;
}

export interface WorkflowNodeHandler {
  inspect(input: WorkflowNodeInput): Promise<WorkflowNodeInspection>;
  execute(input: WorkflowNodeInput & { readonly signal: AbortSignal }): Promise<WorkflowNodeResult>;
}

export interface CreateWorkflowRunInput {
  readonly id: import('@eaw/domain').UuidV7;
  readonly productId: import('@eaw/domain').UuidV7;
  readonly platformId: import('@eaw/domain').PlatformId;
  readonly definition: WorkflowDefinition;
  readonly createdAt: Date;
  readonly reusableNodes?: readonly {
    readonly key: string;
    readonly status: 'completed' | 'locked' | 'needs_review';
    readonly dependencyHash: string;
    readonly output: WorkflowNodeOutputReference;
  }[];
}

export interface WorkflowEvent {
  readonly workflowRunId: import('@eaw/domain').UuidV7;
  readonly sequence: number;
  readonly type: string;
  readonly runRevision: number;
  readonly nodeKey: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}
