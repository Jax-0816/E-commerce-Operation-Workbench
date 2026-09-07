import { describe, expect, it } from 'vitest';

import { contentWorkflowDefinition, createWorkflowDefinition } from './definition.js';

describe('workflow definitions', () => {
  it('returns the canonical content nodes in stable execution order', () => {
    expect(contentWorkflowDefinition.nodes.map(({ key }) => key)).toEqual([
      'competitor_analysis',
      'market_insight',
      'selling_points',
      'titles',
      'creative',
      'detail_page',
    ]);
    expect(Object.isFrozen(contentWorkflowDefinition.nodes)).toBe(true);
  });

  it('rejects cycles, unknown dependencies, duplicate identities, and oversized definitions', () => {
    expect(() =>
      createWorkflowDefinition({
        definitionId: 'cycle',
        version: '1.0.0',
        nodes: [
          { key: 'a', taskType: 'a', dependsOn: ['b'], order: 1 },
          { key: 'b', taskType: 'b', dependsOn: ['a'], order: 2 },
        ],
      }),
    ).toThrow(/cycle/u);
    expect(() =>
      createWorkflowDefinition({
        definitionId: 'unknown',
        version: '1.0.0',
        nodes: [{ key: 'a', taskType: 'a', dependsOn: ['missing'], order: 1 }],
      }),
    ).toThrow(/dependency/u);
    expect(() =>
      createWorkflowDefinition({
        definitionId: 'duplicate',
        version: '1.0.0',
        nodes: [
          { key: 'same', taskType: 'a', dependsOn: [], order: 1 },
          { key: 'same', taskType: 'b', dependsOn: [], order: 2 },
        ],
      }),
    ).toThrow(/unique/u);
    expect(() =>
      createWorkflowDefinition({
        definitionId: 'large',
        version: '1.0.0',
        nodes: Array.from({ length: 51 }, (_, index) => ({
          key: `node_${index}`,
          taskType: 'task',
          dependsOn: [],
          order: index + 1,
        })),
      }),
    ).toThrow(/50/u);
  });

  it('rejects empty, self-dependent, and non-canonical node definitions', () => {
    expect(() =>
      createWorkflowDefinition({ definitionId: 'empty', version: '1.0.0', nodes: [] }),
    ).toThrow(/empty/u);
    expect(() =>
      createWorkflowDefinition({
        definitionId: 'self',
        version: '1.0.0',
        nodes: [{ key: 'a', taskType: 'a', dependsOn: ['a'], order: 1 }],
      }),
    ).toThrow(/itself/u);
    expect(() =>
      createWorkflowDefinition({
        definitionId: 'bad order',
        version: '1.0.0',
        nodes: [{ key: 'Bad Key', taskType: 'a', dependsOn: [], order: 2 }],
      }),
    ).toThrow(/invalid/u);
  });
});
