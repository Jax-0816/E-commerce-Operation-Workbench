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
