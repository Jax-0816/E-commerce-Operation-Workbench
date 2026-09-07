import { describe, expect, it } from 'vitest';

import { transitionNode, transitionRun } from './state.js';

describe('workflow state transitions', () => {
  it('increments the run revision for each declared transition', () => {
    const running = transitionRun({ status: 'not_started', revision: 1 }, 'running');
    const failed = transitionRun(running, 'failed');

    expect(running).toEqual({ status: 'running', revision: 2 });
    expect(failed).toEqual({ status: 'failed', revision: 3 });
  });

  it('rejects terminal run resurrection and invalid node completion', () => {
    expect(() => transitionRun({ status: 'completed', revision: 4 }, 'running')).toThrow(
      /transition/u,
    );
    expect(() => transitionNode('not_started', 'completed')).toThrow(/transition/u);
  });

  it('allows interrupted and failed work to resume explicitly', () => {
    expect(transitionRun({ status: 'interrupted', revision: 5 }, 'running')).toEqual({
      status: 'running',
      revision: 6,
    });
    expect(transitionNode('failed', 'running')).toBe('running');
  });
});
