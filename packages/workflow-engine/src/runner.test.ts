import { describe, expect, it } from 'vitest';

import { createUuidV7, DomainError, type UuidV7 } from '@eaw/domain';

import { contentWorkflowDefinition } from './definition.js';
import type { WorkflowRepository } from './repository.js';
import { createWorkflowRunner } from './runner.js';
import type { WorkflowNode, WorkflowNodeResult, WorkflowRun, WorkflowRunStatus } from './types.js';

describe('workflow runner', () => {
  it('resumes after a failure without charging completed unchanged nodes again', async () => {
    const run = workflowRun();
    const repository = new MemoryWorkflowRepository(run);
    const counts = new Map<string, number>();
    let failCreative = true;
    const handlers = Object.fromEntries(
      contentWorkflowDefinition.nodes.map((definition, index) => [
        definition.taskType,
        {
          async inspect() {
            return { dependencyHash: (index + 1).toString(16).repeat(64) };
          },
          async execute(): Promise<WorkflowNodeResult> {
            counts.set(definition.key, (counts.get(definition.key) ?? 0) + 1);
            if (definition.key === 'creative' && failCreative) {
              failCreative = false;
              throw new DomainError('AI_PROVIDER_UNAVAILABLE', 'Temporary failure.');
            }
            return {
              status: 'completed',
              output: {
                assetType: definition.key,
                assetId: createUuidV7(),
                revisionNo: 1,
              },
            };
          },
        },
      ]),
    );
    const runner = createWorkflowRunner({
      definition: contentWorkflowDefinition,
      repository,
      handlers,
    });

    const failed = await runner.run(run.id, 1);

    expect(failed.status).toBe('failed');
    expect(failed.nodes.map(({ status }) => status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'failed',
      'not_started',
    ]);
    expect(Object.fromEntries(counts)).toEqual({
      competitor_analysis: 1,
      market_insight: 1,
      selling_points: 1,
      titles: 1,
      creative: 1,
    });

    const completed = await runner.resume(run.id, failed.revision);

    expect(completed.status).toBe('completed');
    expect(completed.nodes.every(({ status }) => status === 'completed')).toBe(true);
    expect(Object.fromEntries(counts)).toEqual({
      competitor_analysis: 1,
      market_insight: 1,
      selling_points: 1,
      titles: 1,
      creative: 2,
      detail_page: 1,
    });
    await expect(runner.resume(run.id, failed.revision)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('persists inspection failures instead of leaving the run stuck as running', async () => {
    const run = workflowRun();
    const repository = new MemoryWorkflowRepository(run);
    const handlers = Object.fromEntries(
      contentWorkflowDefinition.nodes.map((definition) => [
        definition.taskType,
        {
          async inspect() {
            if (definition.key === 'competitor_analysis') throw new Error('private provider body');
            return { dependencyHash: 'a'.repeat(64) };
          },
          async execute(): Promise<WorkflowNodeResult> {
            throw new Error('must not execute');
          },
        },
      ]),
    );
    const runner = createWorkflowRunner({
      definition: contentWorkflowDefinition,
      repository,
      handlers,
    });

    const failed = await runner.run(run.id, run.revision);

    expect(failed.status).toBe('failed');
    expect(failed.nodes[0]).toMatchObject({
      status: 'failed',
      error: { code: 'UNEXPECTED_ERROR', message: 'Workflow node execution failed.' },
    });
    expect(JSON.stringify(failed)).not.toContain('private provider body');
  });
});

class MemoryWorkflowRepository implements WorkflowRepository {
  constructor(private value: WorkflowRun) {}

  async findById(id: UuidV7) {
    return id === this.value.id ? structuredClone(this.value) : undefined;
  }

  async markRunning(id: UuidV7, expectedRevision: number) {
    return this.update(id, expectedRevision, (run) => ({ ...run, status: 'running' }));
  }

  async markNodeStale(
    id: UuidV7,
    nodeKey: string,
    dependencyHash: string,
    expectedRevision: number,
  ) {
    return this.nodeUpdate(id, nodeKey, expectedRevision, (node) => ({
      ...node,
      status: 'stale',
      dependencyHash,
    }));
  }

  async claimNode(id: UuidV7, nodeKey: string, dependencyHash: string, expectedRevision: number) {
    return this.nodeUpdate(id, nodeKey, expectedRevision, (node) => ({
      ...node,
      status: 'running',
      dependencyHash,
      error: null,
    }));
  }

  async completeNode(
    id: UuidV7,
    nodeKey: string,
    result: WorkflowNodeResult,
    expectedRevision: number,
  ) {
    return this.nodeUpdate(id, nodeKey, expectedRevision, (node) => ({
      ...node,
      status: result.status,
      output: result.output,
      error: null,
    }));
  }

  async failNode(
    id: UuidV7,
    nodeKey: string,
    error: { readonly code: string; readonly message: string },
    expectedRevision: number,
  ) {
    return this.nodeUpdate(
      id,
      nodeKey,
      expectedRevision,
      (node) => ({ ...node, status: 'failed', error }),
      'failed',
    );
  }

  async completeRun(id: UuidV7, expectedRevision: number) {
    return this.update(id, expectedRevision, (run) => ({ ...run, status: 'completed' }));
  }

  async cancelRun(id: UuidV7, expectedRevision: number) {
    return this.update(id, expectedRevision, (run) => ({ ...run, status: 'cancelled' }));
  }

  private nodeUpdate(
    id: UuidV7,
    nodeKey: string,
    expectedRevision: number,
    change: (node: WorkflowNode) => WorkflowNode,
    status?: WorkflowRunStatus,
  ) {
    return this.update(id, expectedRevision, (run) => ({
      ...run,
      status: status ?? run.status,
      nodes: run.nodes.map((node) => (node.key === nodeKey ? change(node) : node)),
    }));
  }

  private update(id: UuidV7, expectedRevision: number, change: (run: WorkflowRun) => WorkflowRun) {
    if (id !== this.value.id || expectedRevision !== this.value.revision) {
      throw new DomainError('CONFLICT', 'Workflow revision conflict.');
    }
    this.value = {
      ...change(this.value),
      revision: this.value.revision + 1,
      updatedAt: new Date(),
    };
    return structuredClone(this.value);
  }
}

function workflowRun(): WorkflowRun {
  const now = new Date('2026-09-08T00:00:00.000Z');
  return {
    id: createUuidV7(now),
    productId: createUuidV7(now),
    platformId: 'pinduoduo',
    definition: contentWorkflowDefinition,
    status: 'not_started',
    revision: 1,
    cancellationRequested: false,
    nodes: contentWorkflowDefinition.nodes.map((definition) => ({
      key: definition.key,
      taskType: definition.taskType,
      status: 'not_started',
      dependencyHash: null,
      output: null,
      error: null,
    })),
    createdAt: now,
    updatedAt: now,
  };
}
