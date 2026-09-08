import { createUuidV7 } from '@eaw/domain';
import { describe, expect, it } from 'vitest';

import {
  createContentWorkflowHandlers,
  type ContentWorkflowContextPort,
} from './content-workflow-handlers.js';

describe('content workflow handlers', () => {
  it('hashes the exact inspection snapshot and preserves a reusable output', async () => {
    const reusable = {
      assetType: 'competitor_analysis',
      assetId: createUuidV7(),
      revisionNo: 3,
    } as const;
    const context: ContentWorkflowContextPort = {
      async inspect() {
        return { dependencies: { source: 'facts-v1' }, reusableOutput: reusable };
      },
    };
    const { handlers } = createContentWorkflowHandlers({
      context,
      strategies: {
        generate: async () => ({ id: createUuidV7(), revisionNo: 1, status: 'verified' }),
      },
      titles: {
        generate: async () => ({
          id: createUuidV7(),
          revisionNo: 1,
          status: 'verified',
          locked: false,
        }),
      },
      content: {
        generateCreative: async () => ({ id: createUuidV7(), revisionNo: 1, status: 'verified' }),
        generateDetail: async () => ({ id: createUuidV7(), revisionNo: 1, status: 'verified' }),
      },
    });

    await expect(
      handlers.competitor_analysis!.inspect({
        workflowRunId: createUuidV7(),
        productId: createUuidV7(),
        platformId: 'pinduoduo',
        nodeKey: 'competitor_analysis',
      }),
    ).resolves.toEqual({
      dependencyHash: '0f857c4dad3595fc43cc6b51e94b09cc7dd673aa27e795af2ebcb23f4e948b22',
      reusableOutput: reusable,
    });
  });

  it('routes all six tasks and returns exact output references and states', async () => {
    const productId = createUuidV7();
    const workflowRunId = createUuidV7();
    const ids = Array.from({ length: 6 }, () => createUuidV7());
    const calls: string[] = [];
    const { handlers } = createContentWorkflowHandlers({
      context: {
        async inspect() {
          return { dependencies: {} };
        },
      },
      strategies: {
        async generate(owner, kind) {
          calls.push(`strategy:${owner}:${kind}`);
          const index = ['competitor_analysis', 'market_insight', 'selling_point_set'].indexOf(
            kind,
          );
          return {
            id: ids[index]!,
            revisionNo: index + 1,
            status: index === 0 ? 'needs_review' : 'verified',
          };
        },
      },
      titles: {
        async generate(owner, platform) {
          calls.push(`titles:${owner}:${platform}`);
          return { id: ids[3]!, revisionNo: 4, status: 'verified', locked: true };
        },
      },
      content: {
        async generateCreative(owner, platform) {
          calls.push(`creative:${owner}:${platform}`);
          return { id: ids[4]!, revisionNo: 5, status: 'verified' };
        },
        async generateDetail(owner, platform) {
          calls.push(`detail:${owner}:${platform}`);
          return { id: ids[5]!, revisionNo: 6, status: 'needs_review' };
        },
      },
    });
    const taskTypes = [
      'competitor_analysis',
      'market_insight',
      'selling_point_set',
      'title_generation',
      'creative_plan',
      'detail_page',
    ] as const;

    const results = await Promise.all(
      taskTypes.map((taskType) =>
        handlers[taskType]!.execute({
          workflowRunId,
          productId,
          platformId: 'taobao',
          nodeKey: taskType,
          signal: new AbortController().signal,
        }),
      ),
    );

    expect(calls).toEqual([
      `strategy:${productId}:competitor_analysis`,
      `strategy:${productId}:market_insight`,
      `strategy:${productId}:selling_point_set`,
      `titles:${productId}:taobao`,
      `creative:${productId}:taobao`,
      `detail:${productId}:taobao`,
    ]);
    expect(results.map(({ status, output }) => [status, output])).toEqual([
      ['needs_review', { assetType: 'competitor_analysis', assetId: ids[0], revisionNo: 1 }],
      ['completed', { assetType: 'market_insight', assetId: ids[1], revisionNo: 2 }],
      ['completed', { assetType: 'selling_point_set', assetId: ids[2], revisionNo: 3 }],
      ['locked', { assetType: 'title_asset', assetId: ids[3], revisionNo: 4 }],
      ['completed', { assetType: 'creative_plan', assetId: ids[4], revisionNo: 5 }],
      ['needs_review', { assetType: 'detail_page', assetId: ids[5], revisionNo: 6 }],
    ]);
  });
});
