import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '../ids.js';
import {
  createOperationPlanRevision,
  lockOperationPlanRevision,
  type OperationPlanRevision,
  type OperationPlanSources,
} from './operation-plan.js';

describe('operation plan revision', () => {
  it('preserves an exact immutable six-node source graph', () => {
    const input = revision();
    const created = createOperationPlanRevision(input);

    expect(created.sources.nodes.map(({ nodeKey }) => nodeKey)).toEqual(nodeKeys);
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.sources.nodes)).toBe(true);
    input.sources.nodes[0]!.dependencyHash = 'f'.repeat(64);
    expect(created.sources.nodes[0]!.dependencyHash).toBe('a'.repeat(64));
  });

  it('rejects malformed hashes, node order, and duplicate external references', () => {
    const valid = revision();
    expect(() =>
      createOperationPlanRevision({
        ...valid,
        sourceHash: 'INVALID',
      }),
    ).toThrow(/operation plan/i);
    expect(() =>
      createOperationPlanRevision({
        ...valid,
        sources: { ...valid.sources, nodes: [...valid.sources.nodes].reverse() },
      }),
    ).toThrow(/operation plan/i);
    expect(() =>
      createOperationPlanRevision({
        ...valid,
        sources: {
          ...valid.sources,
          competitorSnapshotIds: [
            valid.sources.competitorSnapshotIds[0]!,
            valid.sources.competitorSnapshotIds[0]!,
          ],
        },
      }),
    ).toThrow(/operation plan/i);
    expect(() =>
      createOperationPlanRevision({
        ...valid,
        sources: {
          ...valid.sources,
          promotion: {
            scenarioId: createUuidV7(),
            resultIds: [valid.id, valid.id],
            ruleSnapshotHash: 'b'.repeat(64),
          },
        },
      }),
    ).toThrow(/operation plan/i);
  });

  it('locks only a blocker-free draft and keeps every exact source unchanged', () => {
    const draft = createOperationPlanRevision(revision());
    const locked = lockOperationPlanRevision(
      draft,
      createUuidV7(),
      new Date('2026-09-09T02:00:00.000Z'),
    );

    expect(locked).toMatchObject({
      lineageId: draft.lineageId,
      productId: draft.productId,
      platformId: draft.platformId,
      revisionNo: 2,
      status: 'locked',
      lockedAt: new Date('2026-09-09T02:00:00.000Z'),
      supersedesRevisionId: draft.id,
      sourceHash: draft.sourceHash,
    });
    expect(locked.sources).toEqual(draft.sources);
    expect(() => lockOperationPlanRevision(locked, createUuidV7(), new Date())).toThrow(/draft/i);

    const blocked = createOperationPlanRevision(
      revision({ blockers: [{ code: 'SOURCE_STALE', source: 'titles' }] }),
    );
    expect(() => lockOperationPlanRevision(blocked, createUuidV7(), new Date())).toThrow(
      /blocker/i,
    );
    expect(() =>
      createOperationPlanRevision({
        ...revision({ blockers: [{ code: 'CONTENT_UNLOCKED', source: 'creative' }] }),
        status: 'locked',
        lockedAt: new Date(),
      }),
    ).toThrow(/operation plan/i);
  });
});

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

function revision(
  overrides: Partial<OperationPlanRevision> = {},
): OperationPlanRevision & { sources: MutableSources } {
  const id = createUuidV7();
  return {
    id,
    lineageId: id,
    productId: createUuidV7(),
    platformId: 'pinduoduo',
    revisionNo: 1,
    status: 'draft',
    lockedAt: null,
    sources: sources(),
    sourceHash: 'c'.repeat(64),
    blockers: [],
    supersedesRevisionId: null,
    createdAt: new Date('2026-09-09T01:00:00.000Z'),
    ...overrides,
  } as OperationPlanRevision & { sources: MutableSources };
}

type MutableSources = {
  -readonly [Key in keyof OperationPlanSources]: OperationPlanSources[Key];
} & {
  nodes: Array<{
    nodeKey: (typeof nodeKeys)[number];
    assetType: (typeof assetTypes)[number];
    assetId: ReturnType<typeof createUuidV7>;
    revisionNo: number;
    dependencyHash: string;
  }>;
};

function sources(): MutableSources {
  return {
    workflowRunId: createUuidV7(),
    workflowRunRevision: 12,
    nodes: nodeKeys.map((nodeKey, index) => ({
      nodeKey,
      assetType: assetTypes[index]!,
      assetId: createUuidV7(),
      revisionNo: index + 1,
      dependencyHash: 'a'.repeat(64),
    })),
    competitorSnapshotIds: [createUuidV7()],
    pricing: {
      resultId: createUuidV7(),
      scenarioId: createUuidV7(),
      skuId: createUuidV7(),
      costProfileId: createUuidV7(),
      costProfileRevisionNo: 3,
    },
    promotion: null,
  };
}
