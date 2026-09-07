import { DomainError } from '@eaw/domain';

import type { RevisionedRunState, WorkflowNodeStatus, WorkflowRunStatus } from './types.js';

const RUN_TRANSITIONS: Readonly<Record<WorkflowRunStatus, readonly WorkflowRunStatus[]>> = {
  not_started: ['running', 'cancelled'],
  running: ['completed', 'failed', 'interrupted', 'cancelled'],
  completed: [],
  failed: ['running', 'cancelled'],
  interrupted: ['running', 'cancelled'],
  cancelled: [],
};

const NODE_TRANSITIONS: Readonly<Record<WorkflowNodeStatus, readonly WorkflowNodeStatus[]>> = {
  not_started: ['running', 'cancelled'],
  running: ['completed', 'failed', 'locked', 'needs_review', 'cancelled'],
  completed: ['stale', 'locked'],
  failed: ['running', 'cancelled'],
  stale: ['running', 'cancelled'],
  locked: [],
  needs_review: ['stale', 'locked'],
  cancelled: [],
};

export function transitionRun(
  current: RevisionedRunState,
  next: WorkflowRunStatus,
): RevisionedRunState {
  if (!Number.isSafeInteger(current.revision) || current.revision < 1) throw invalid();
  if (!RUN_TRANSITIONS[current.status].includes(next)) throw invalid();
  return Object.freeze({ status: next, revision: current.revision + 1 });
}

export function transitionNode(
  current: WorkflowNodeStatus,
  next: WorkflowNodeStatus,
): WorkflowNodeStatus {
  if (!NODE_TRANSITIONS[current].includes(next)) throw invalid();
  return next;
}

function invalid(): DomainError {
  return new DomainError('CONFLICT', 'Workflow state transition is invalid.');
}
