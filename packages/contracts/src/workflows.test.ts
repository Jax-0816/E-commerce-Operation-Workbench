import { createUuidV7 } from '@eaw/domain';
import { describe, expect, it } from 'vitest';

import {
  ProductWorkflowParamsSchema,
  StartWorkflowInputSchema,
  WorkflowEventsQuerySchema,
  WorkflowNodeParamsSchema,
  WorkflowRevisionInputSchema,
  WorkflowRunParamsSchema,
} from './workflows.js';

describe('workflow contracts', () => {
  it('accepts only UUIDv7 identities, supported platforms, and the known definition', () => {
    const productId = createUuidV7();
    expect(ProductWorkflowParamsSchema.parse({ productId })).toEqual({ productId });
    expect(() => ProductWorkflowParamsSchema.parse({ productId: crypto.randomUUID() })).toThrow();
    expect(() => ProductWorkflowParamsSchema.parse({ productId, extra: true })).toThrow();

    expect(
      StartWorkflowInputSchema.parse({ platformId: 'taobao', definitionId: 'product_content' }),
    ).toEqual({ platformId: 'taobao', definitionId: 'product_content' });
    expect(() =>
      StartWorkflowInputSchema.parse({ platformId: 'jd', definitionId: 'product_content' }),
    ).toThrow();
    expect(() =>
      StartWorkflowInputSchema.parse({ platformId: 'taobao', definitionId: 'unknown' }),
    ).toThrow();
  });

  it('strictly validates run, node, revision, and event cursors', () => {
    const workflowRunId = createUuidV7();
    expect(WorkflowRunParamsSchema.parse({ workflowRunId })).toEqual({ workflowRunId });
    expect(WorkflowNodeParamsSchema.parse({ workflowRunId, nodeKey: 'selling_points' })).toEqual({
      workflowRunId,
      nodeKey: 'selling_points',
    });
    expect(() => WorkflowNodeParamsSchema.parse({ workflowRunId, nodeKey: 'unknown' })).toThrow();
    expect(WorkflowRevisionInputSchema.parse({ expectedRevision: 1 })).toEqual({
      expectedRevision: 1,
    });
    expect(() => WorkflowRevisionInputSchema.parse({ expectedRevision: 0 })).toThrow();
    expect(() => WorkflowRevisionInputSchema.parse({ expectedRevision: 1, force: true })).toThrow();
    expect(WorkflowEventsQuerySchema.parse({ afterSequence: '0' })).toEqual({ afterSequence: 0 });
    expect(() => WorkflowEventsQuerySchema.parse({ afterSequence: '-1' })).toThrow();
  });
});
