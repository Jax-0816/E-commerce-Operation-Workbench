import { DomainError, type UuidV7 } from '@eaw/domain';

import { createIdempotencyKey } from './idempotency.js';
import type { WorkflowRepository } from './repository.js';
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeError,
  WorkflowNodeHandler,
  WorkflowNodeInput,
  WorkflowNodeInspection,
  WorkflowRun,
} from './types.js';

const REUSABLE = new Set<WorkflowNode['status']>(['completed', 'locked', 'needs_review']);

export interface WorkflowRunner {
  run(id: UuidV7, expectedRevision: number): Promise<WorkflowRun>;
  resume(id: UuidV7, expectedRevision: number): Promise<WorkflowRun>;
}

export function createWorkflowRunner(dependencies: {
  readonly definition: WorkflowDefinition;
  readonly repository: WorkflowRepository;
  readonly handlers: Readonly<Record<string, WorkflowNodeHandler>>;
}): WorkflowRunner {
  return {
    run: (id, revision) => execute(id, revision, ['not_started'], dependencies),
    resume: (id, revision) => execute(id, revision, ['failed', 'interrupted'], dependencies),
  };
}

async function execute(
  id: UuidV7,
  expectedRevision: number,
  allowedStatuses: readonly WorkflowRun['status'][],
  dependencies: Parameters<typeof createWorkflowRunner>[0],
): Promise<WorkflowRun> {
  const initial = await requiredRun(dependencies.repository, id);
  if (initial.revision !== expectedRevision || !allowedStatuses.includes(initial.status)) {
    throw conflict();
  }
  for (const definition of dependencies.definition.nodes) {
    if (!dependencies.handlers[definition.taskType]) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Workflow handler is unavailable.');
    }
  }
  let run = await dependencies.repository.markRunning(id, expectedRevision);
  for (const definition of dependencies.definition.nodes) {
    let node = requiredNode(run, definition.key);
    const handler = dependencies.handlers[definition.taskType];
    if (!handler)
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Workflow handler is unavailable.');
    const input: WorkflowNodeInput = {
      workflowRunId: run.id,
      productId: run.productId,
      platformId: run.platformId,
      nodeKey: node.key,
    };
    let inspection: WorkflowNodeInspection;
    try {
      inspection = await handler.inspect(input);
      createIdempotencyKey(run.id, node.key, inspection.dependencyHash);
    } catch (error) {
      return dependencies.repository.failNode(id, node.key, safeError(error), run.revision);
    }
    if (node.status === 'locked') continue;
    if (REUSABLE.has(node.status) && node.dependencyHash === inspection.dependencyHash) continue;
    if (REUSABLE.has(node.status)) {
      run = await dependencies.repository.markNodeStale(
        id,
        node.key,
        inspection.dependencyHash,
        run.revision,
      );
      node = requiredNode(run, definition.key);
    }
    ensureDependencies(run, definition.dependsOn);
    run = await dependencies.repository.claimNode(
      id,
      node.key,
      inspection.dependencyHash,
      run.revision,
    );
    try {
      const result = await handler.execute({ ...input, signal: new AbortController().signal });
      run = await dependencies.repository.completeNode(id, node.key, result, run.revision);
    } catch (error) {
      return dependencies.repository.failNode(id, node.key, safeError(error), run.revision);
    }
  }
  return dependencies.repository.completeRun(id, run.revision);
}

async function requiredRun(repository: WorkflowRepository, id: UuidV7): Promise<WorkflowRun> {
  const run = await repository.findById(id);
  if (!run) throw new DomainError('NOT_FOUND', 'Workflow run was not found.');
  return run;
}

function requiredNode(run: WorkflowRun, key: string): WorkflowNode {
  const node = run.nodes.find((candidate) => candidate.key === key);
  if (!node) throw new DomainError('VALIDATION_ERROR', 'Workflow node is missing.');
  return node;
}

function ensureDependencies(run: WorkflowRun, keys: readonly string[]): void {
  if (keys.some((key) => !REUSABLE.has(requiredNode(run, key).status))) {
    throw new DomainError('CONFLICT', 'Workflow dependencies are incomplete.');
  }
}

function safeError(error: unknown): WorkflowNodeError {
  return error instanceof DomainError
    ? { code: error.code, message: error.message }
    : { code: 'UNEXPECTED_ERROR', message: 'Workflow node execution failed.' };
}

function conflict(): DomainError {
  return new DomainError('CONFLICT', 'Workflow revision or status conflict.');
}
