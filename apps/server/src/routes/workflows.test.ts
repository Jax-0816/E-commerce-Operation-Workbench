import { DomainError, createUuidV7 } from '@eaw/domain';
import type { WorkflowsApplication } from '@eaw/application';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const contentWorkflowDefinition = {
  definitionId: 'product_content',
  version: '1.0.0',
  nodes: [
    { key: 'competitor_analysis', taskType: 'competitor_analysis', dependsOn: [], order: 1 },
    { key: 'market_insight', taskType: 'market_insight', dependsOn: ['competitor_analysis'], order: 2 },
    { key: 'selling_points', taskType: 'selling_point_set', dependsOn: ['market_insight'], order: 3 },
    { key: 'titles', taskType: 'title_generation', dependsOn: ['selling_points'], order: 4 },
    { key: 'creative', taskType: 'creative_plan', dependsOn: ['titles'], order: 5 },
    { key: 'detail_page', taskType: 'detail_page', dependsOn: ['titles'], order: 6 },
  ],
} as const;

describe('workflow routes', () => {
  it('routes preflight, start, list, get, resume, retry, and cancel with exact identities', async () => {
    const productId = createUuidV7();
    const run = workflowRun(productId);
    const calls: string[] = [];
    const workflows = application({
      preflight: async (owner, platform) => {
        calls.push(`preflight:${owner}:${platform}`);
        return {
          definitionId: 'product_content', definitionVersion: '1.0.0', productId, platformId: platform,
          nodes: contentWorkflowDefinition.nodes.map(({ key, taskType, order }) => ({
            key, taskType, order, runnable: true, missingInputs: [], dependencyHash: 'a'.repeat(64),
          })),
        };
      },
      start: async (owner, platform) => { calls.push(`start:${owner}:${platform}`); return run; },
      list: async (owner) => { calls.push(`list:${owner}`); return [run]; },
      get: async (id) => { calls.push(`get:${id}`); return run; },
      resume: async (id, revision) => { calls.push(`resume:${id}:${revision}`); return run; },
      retryNode: async (id, node, revision) => { calls.push(`retry:${id}:${node}:${revision}`); return run; },
      cancel: async (id, revision) => { calls.push(`cancel:${id}:${revision}`); return run; },
    });
    const app = buildApp(createAppContext({ workflows }));
    const body = { platformId: 'taobao', definitionId: 'product_content' };

    expect((await app.inject({ method: 'POST', url: `/api/v1/products/${productId}/workflows/preflight`, payload: body })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/v1/products/${productId}/workflows`, payload: body })).statusCode).toBe(202);
    expect((await app.inject({ method: 'GET', url: `/api/v1/products/${productId}/workflows` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/v1/workflows/${run.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/v1/workflows/${run.id}/resume`, payload: { expectedRevision: 1 } })).statusCode).toBe(202);
    expect((await app.inject({ method: 'POST', url: `/api/v1/workflows/${run.id}/nodes/selling_points/retry`, payload: { expectedRevision: 1 } })).statusCode).toBe(202);
    expect((await app.inject({ method: 'POST', url: `/api/v1/workflows/${run.id}/cancel`, payload: { expectedRevision: 1 } })).statusCode).toBe(200);

    expect(calls).toEqual([
      `preflight:${productId}:taobao`, `start:${productId}:taobao`, `list:${productId}`,
      `get:${run.id}`, `resume:${run.id}:1`, `retry:${run.id}:selling_points:1`, `cancel:${run.id}:1`,
    ]);
    await app.close();
  });

  it('rejects malformed and unknown request data before calling the application', async () => {
    let calls = 0;
    const app = buildApp(createAppContext({ workflows: application({ get: async () => { calls += 1; throw new Error('not used'); } }) }));
    const runId = createUuidV7();
    const invalid = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/products/${createUuidV7()}/workflows`, payload: { platformId: 'taobao', definitionId: 'product_content', extra: true } }),
      app.inject({ method: 'GET', url: `/api/v1/workflows/${crypto.randomUUID()}` }),
      app.inject({ method: 'POST', url: `/api/v1/workflows/${runId}/resume`, payload: { expectedRevision: 0 } }),
      app.inject({ method: 'POST', url: `/api/v1/workflows/${runId}/nodes/unknown/retry`, payload: { expectedRevision: 1 } }),
    ]);
    expect(invalid.map(({ statusCode }) => statusCode)).toEqual([400, 400, 400, 400]);
    expect(calls).toBe(0);
    await app.close();
  });

  it('maps unavailable, missing, and revision conflicts safely', async () => {
    const unavailable = buildApp(createAppContext({}));
    expect((await unavailable.inject({ method: 'GET', url: `/api/v1/workflows/${createUuidV7()}` })).statusCode).toBe(503);
    await unavailable.close();

    const runId = createUuidV7();
    const app = buildApp(createAppContext({ workflows: application({
      get: async () => { throw new DomainError('NOT_FOUND', 'private'); },
      resume: async () => { throw new DomainError('CONFLICT', 'private'); },
    }) }));
    expect((await app.inject({ method: 'GET', url: `/api/v1/workflows/${runId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/v1/workflows/${runId}/resume`, payload: { expectedRevision: 1 } })).statusCode).toBe(409);
    await app.close();
  });
});

function application(overrides: Partial<WorkflowsApplication>): WorkflowsApplication {
  const unavailable = async () => { throw new DomainError('CAPABILITY_UNAVAILABLE', 'not configured'); };
  return {
    preflight: unavailable, start: unavailable, list: unavailable, get: unavailable,
    resume: unavailable, retryNode: unavailable, cancel: unavailable, listEvents: unavailable,
    subscribe: unavailable,
    ...overrides,
  } as WorkflowsApplication;
}

function workflowRun(
  productId: ReturnType<typeof createUuidV7>,
): Awaited<ReturnType<WorkflowsApplication['start']>> {
  const now = new Date('2026-09-08T08:00:00.000Z');
  return {
    id: createUuidV7(now), productId, platformId: 'taobao', definition: contentWorkflowDefinition,
    status: 'not_started', revision: 1, cancellationRequested: false,
    nodes: contentWorkflowDefinition.nodes.map(({ key, taskType }) => ({
      key, taskType, status: 'not_started', dependencyHash: null, output: null, error: null,
    })),
    createdAt: now, updatedAt: now,
  };
}
