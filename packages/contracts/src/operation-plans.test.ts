import { createUuidV7 } from '@eaw/domain';
import { describe, expect, it } from 'vitest';

import {
  CreateOperationPlanInputSchema,
  LockOperationPlanInputSchema,
  OperationPlanParamsSchema,
  OperationPlanResponseSchema,
  ProductOperationPlansParamsSchema,
} from './operation-plans.js';

describe('operation plan contracts', () => {
  it('strictly validates product, plan, create, and lock inputs', () => {
    const productId = createUuidV7();
    const operationPlanId = createUuidV7();
    const workflowRunId = createUuidV7();
    const pricingRecordId = createUuidV7();
    const promotionScenarioId = createUuidV7();
    const promotionResultIds = [createUuidV7()];

    expect(ProductOperationPlansParamsSchema.parse({ productId })).toEqual({ productId });
    expect(OperationPlanParamsSchema.parse({ operationPlanId })).toEqual({ operationPlanId });
    expect(
      CreateOperationPlanInputSchema.parse({
        workflowRunId,
        pricingRecordId,
        promotionScenarioId,
        promotionResultIds,
      }),
    ).toEqual({ workflowRunId, pricingRecordId, promotionScenarioId, promotionResultIds });
    expect(LockOperationPlanInputSchema.parse({ expectedRevisionNo: 1 })).toEqual({
      expectedRevisionNo: 1,
    });
    expect(() =>
      CreateOperationPlanInputSchema.parse({ workflowRunId, pricingRecordId, extra: true }),
    ).toThrow();
    expect(() =>
      CreateOperationPlanInputSchema.parse({
        workflowRunId,
        pricingRecordId,
        promotionScenarioId,
      }),
    ).toThrow();
    expect(() =>
      CreateOperationPlanInputSchema.parse({
        workflowRunId,
        pricingRecordId,
        promotionScenarioId,
        promotionResultIds: [],
      }),
    ).toThrow();
    expect(() => LockOperationPlanInputSchema.parse({ expectedRevisionNo: 0 })).toThrow();
  });

  it('accepts an exact strict draft response and rejects nested unknown fields', () => {
    const response = validResponse();
    expect(OperationPlanResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      OperationPlanResponseSchema.parse({
        ...response,
        sources: { ...response.sources, unknown: true },
      }),
    ).toThrow();
    expect(() =>
      OperationPlanResponseSchema.parse({
        ...response,
        sources: {
          ...response.sources,
          nodes: response.sources.nodes.map((node, index) =>
            index === 0 ? { ...node, assetType: 'title_asset' } : node,
          ),
        },
      }),
    ).toThrow();
  });

  it('enforces lifecycle and lowercase hashes', () => {
    const response = validResponse();
    expect(() =>
      OperationPlanResponseSchema.parse({ ...response, status: 'locked', lockedAt: null }),
    ).toThrow();
    expect(() =>
      OperationPlanResponseSchema.parse({ ...response, sourceHash: 'A'.repeat(64) }),
    ).toThrow();
    expect(() =>
      OperationPlanResponseSchema.parse({
        ...response,
        blockers: [{ code: 'CONTENT_UNLOCKED', source: ' titles ' }],
      }),
    ).toThrow();
  });
});

function validResponse() {
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
  const id = createUuidV7();
  return {
    id,
    lineageId: id,
    productId: createUuidV7(),
    platformId: 'pinduoduo' as const,
    revisionNo: 1,
    status: 'draft' as const,
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
    blockers: [{ code: 'CONTENT_UNLOCKED' as const, source: 'titles' }],
    supersedesRevisionId: null,
    createdAt: '2026-09-09T03:00:00.000Z',
  };
}
