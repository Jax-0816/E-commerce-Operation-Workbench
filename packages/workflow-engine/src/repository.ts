import type { UuidV7 } from '@eaw/domain';

import type { WorkflowNodeError, WorkflowNodeResult, WorkflowRun } from './types.js';

export interface WorkflowRepository {
  findById(id: UuidV7): Promise<WorkflowRun | undefined>;
  markRunning(id: UuidV7, expectedRevision: number): Promise<WorkflowRun>;
  markNodeStale(
    id: UuidV7,
    nodeKey: string,
    dependencyHash: string,
    expectedRevision: number,
  ): Promise<WorkflowRun>;
  claimNode(
    id: UuidV7,
    nodeKey: string,
    dependencyHash: string,
    expectedRevision: number,
  ): Promise<WorkflowRun>;
  completeNode(
    id: UuidV7,
    nodeKey: string,
    result: WorkflowNodeResult,
    expectedRevision: number,
  ): Promise<WorkflowRun>;
  failNode(
    id: UuidV7,
    nodeKey: string,
    error: WorkflowNodeError,
    expectedRevision: number,
  ): Promise<WorkflowRun>;
  completeRun(id: UuidV7, expectedRevision: number): Promise<WorkflowRun>;
  cancelRun(id: UuidV7, expectedRevision: number): Promise<WorkflowRun>;
}
