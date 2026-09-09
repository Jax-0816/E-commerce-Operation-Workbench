import type { OperationPlansApplication } from '@eaw/application';
import { createUuidV7, DomainError, type OperationPlanRevision } from '@eaw/domain';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

describe('operation plan routes', () => {
  it('creates, lists, reads, and locks exact revisions', async () => {
    const productId = createUuidV7();
    const plan = revision(productId);
    const calls: string[] = [];
    const operationPlans = application({
      createDraft: async (owner, input) => {
        calls.push(`create:${owner}:${input.workflowRunId}:${input.pricingRecordId}`);
        return plan;
      },
      list: async (owner) => {
        calls.push(`list:${owner}`);
        return [plan];
      },
      get: async (id) => {
        calls.push(`get:${id}`);
        return plan;
      },
      lock: async (id, expectedRevisionNo) => {
        calls.push(`lock:${id}:${expectedRevisionNo}`);
        return {
          ...plan,
          id: createUuidV7(),
          revisionNo: 2,
          status: 'locked',
          lockedAt: new Date(),
          blockers: [],
          supersedesRevisionId: plan.id,
        };
      },
    });
    const app = buildApp(createAppContext({ operationPlans }));
    const payload = {
      workflowRunId: plan.sources.workflowRunId,
      pricingRecordId: plan.sources.pricing.resultId,
    };

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/operation-plans`,
      payload,
    });
    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}/operation-plans`,
    });
    const read = await app.inject({ method: 'GET', url: `/api/v1/operation-plans/${plan.id}` });
    const locked = await app.inject({
      method: 'POST',
      url: `/api/v1/operation-plans/${plan.id}/lock`,
      payload: { expectedRevisionNo: 1 },
    });

    expect([created.statusCode, listed.statusCode, read.statusCode, locked.statusCode]).toEqual([
      201, 200, 200, 201,
    ]);
    expect(created.json()).toMatchObject({ id: plan.id, createdAt: plan.createdAt.toISOString() });
    expect(listed.json()).toMatchObject({ items: [{ id: plan.id }] });
    expect(calls).toEqual([
      `create:${productId}:${payload.workflowRunId}:${payload.pricingRecordId}`,
      `list:${productId}`,
      `get:${plan.id}`,
      `lock:${plan.id}:1`,
    ]);
    await app.close();
  });

  it('rejects malformed inputs before invoking the application', async () => {
    let calls = 0;
    const operationPlans = application({
      createDraft: async () => {
        calls += 1;
        throw new Error('not used');
      },
      lock: async () => {
        calls += 1;
        throw new Error('not used');
      },
    });
    const app = buildApp(createAppContext({ operationPlans }));
    const productId = createUuidV7();
    const planId = createUuidV7();
    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/products/${productId}/operation-plans`,
        payload: { workflowRunId: createUuidV7(), pricingRecordId: createUuidV7(), extra: true },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/operation-plans/${planId}/lock`,
        payload: { expectedRevisionNo: 0 },
      }),
      app.inject({ method: 'GET', url: `/api/v1/operation-plans/${crypto.randomUUID()}` }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([400, 400, 400]);
    expect(calls).toBe(0);
    await app.close();
  });

  it('maps unavailable, missing, and conflicts safely', async () => {
    const unavailable = buildApp(createAppContext({}));
    expect(
      (
        await unavailable.inject({
          method: 'GET',
          url: `/api/v1/operation-plans/${createUuidV7()}`,
        })
      ).statusCode,
    ).toBe(503);
    await unavailable.close();

    const planId = createUuidV7();
    const app = buildApp(
      createAppContext({
        operationPlans: application({
          get: async () => {
            throw new DomainError('NOT_FOUND', 'private');
          },
          lock: async () => {
            throw new DomainError('CONFLICT', 'private');
          },
        }),
      }),
    );
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/operation-plans/${planId}` })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/operation-plans/${planId}/lock`,
          payload: { expectedRevisionNo: 1 },
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
  });
});

function application(overrides: Partial<OperationPlansApplication>): OperationPlansApplication {
  const unavailable = async () => {
    throw new DomainError('CAPABILITY_UNAVAILABLE', 'not configured');
  };
  return {
    createDraft: unavailable,
    list: unavailable,
    get: unavailable,
    lock: unavailable,
    ...overrides,
  };
}

function revision(productId: ReturnType<typeof createUuidV7>): OperationPlanRevision {
  const id = createUuidV7();
  const nodeKeys = [
    'competitor_analysis',
    'market_insight',
    'selling_points',
    'titles',
    'creative',
    'detail_page',
  ] as const;
  const assetTypes = [
    'competitor_analysis',
    'market_insight',
    'selling_point_set',
    'title_asset',
    'creative_plan',
    'detail_page',
  ] as const;
  return {
    id,
    lineageId: id,
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    status: 'draft',
    lockedAt: null,
    sources: {
      workflowRunId: createUuidV7(),
      workflowRunRevision: 9,
      nodes: nodeKeys.map((nodeKey, index) => ({
        nodeKey,
        assetType: assetTypes[index]!,
        assetId: createUuidV7(),
        revisionNo: 1,
        dependencyHash: 'a'.repeat(64),
      })),
      competitorSnapshotIds: [createUuidV7()],
      pricing: {
        resultId: createUuidV7(),
        scenarioId: createUuidV7(),
        skuId: createUuidV7(),
        costProfileId: createUuidV7(),
        costProfileRevisionNo: 1,
      },
      promotion: null,
    },
    sourceHash: 'b'.repeat(64),
    blockers: [],
    supersedesRevisionId: null,
    createdAt: new Date('2026-09-09T03:00:00.000Z'),
  };
}
