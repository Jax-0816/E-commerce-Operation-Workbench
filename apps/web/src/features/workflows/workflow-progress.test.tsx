// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { WorkflowApi, WorkflowPlatformId, WorkflowPreflight, WorkflowRun } from './api.js';
import { WorkflowProgress } from './workflow-progress.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('workflow progress', () => {
  it('renders six accessible nodes and never starts until the user clicks', async () => {
    const calls: string[] = [];
    const current = run('running');
    const api = fakeApi({
      preflight: async (_productId, platformId) => preflight(platformId),
      start: async (_productId, platformId) => { calls.push(`start:${platformId}`); return current; },
      cancel: async (_runId, revision) => { calls.push(`cancel:${revision}`); return { ...current, status: 'cancelled' }; },
      subscribe: (runId) => {
        calls.push(`subscribe:${runId}`);
        return () => undefined;
      },
    });
    const { container, root } = await render(api);

    expect(container.querySelectorAll('[data-testid="workflow-node"]')).toHaveLength(6);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('预检完成');
    expect(calls).toEqual([]);
    await click(container, '启动工作流');
    expect(calls).toEqual(['start:pinduoduo', 'subscribe:run-1']);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('运行中');
    await click(container, '取消工作流');
    expect(calls).toEqual([
      'start:pinduoduo',
      'subscribe:run-1',
      'cancel:5',
      'subscribe:run-1',
    ]);
    root.unmount();
  });

  it('shows safe failure details and requires explicit resume or node retry', async () => {
    const failed = run('failed', 'creative');
    const calls: string[] = [];
    const api = fakeApi({
      list: async () => [failed],
      get: async () => failed,
      resume: async (_runId, revision) => { calls.push(`resume:${revision}`); return failed; },
      retry: async (_runId, nodeKey, revision) => { calls.push(`retry:${nodeKey}:${revision}`); return failed; },
    });
    const { container, root } = await render(api);

    expect(container.textContent).toContain('AI_OUTPUT_INVALID');
    expect(calls).toEqual([]);
    await click(container, '重试创意方案');
    await click(container, '恢复工作流');
    expect(calls).toEqual(['retry:creative:5', 'resume:5']);
    root.unmount();
  });

  it('drops stale platform results and GETs state before reconnecting SSE', async () => {
    const oldPreflight = deferred<WorkflowPreflight>();
    const selectedRun = { ...run('running'), platformId: 'taobao' as const };
    const order: string[] = [];
    let disconnect: (() => void) | undefined;
    const api = fakeApi({
      async preflight(_productId, platformId) {
        if (platformId === 'pinduoduo') return oldPreflight.promise;
        return preflight(platformId);
      },
      list: async () => [selectedRun],
      get: async () => { order.push('get'); return selectedRun; },
      subscribe: (_runId, _sequence, _onEvent, onDisconnect) => {
        order.push('subscribe');
        disconnect = onDisconnect;
        return () => order.push('close');
      },
    });
    const { container, root } = await render(api, false);
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="工作流平台"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(selector, 'taobao');
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    oldPreflight.resolve(preflight('pinduoduo'));
    await act(async () => undefined);

    expect(selector.value).toBe('taobao');
    expect(container.textContent).toContain('淘宝');
    expect(order.slice(0, 2)).toEqual(['get', 'subscribe']);
    await act(async () => { disconnect?.(); await Promise.resolve(); });
    expect(order.slice(-3)).toEqual(['close', 'get', 'subscribe']);
    root.unmount();
  });
});

async function render(api: WorkflowApi, settle = true) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => root.render(<WorkflowProgress api={api} productId="product-1" />));
  if (settle) await act(async () => undefined);
  return { container, root };
}

async function click(container: HTMLElement, label: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(({ textContent }) => textContent === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

function fakeApi(overrides: Partial<WorkflowApi>): WorkflowApi {
  const empty = async () => [] as readonly WorkflowRun[];
  const unavailable = async () => { throw new Error('not configured'); };
  return {
    preflight: async (_productId, platformId) => preflight(platformId),
    start: unavailable,
    list: empty,
    get: unavailable,
    resume: unavailable,
    retry: unavailable,
    cancel: unavailable,
    subscribe: () => () => undefined,
    ...overrides,
  } as WorkflowApi;
}

function preflight(platformId: WorkflowPlatformId): WorkflowPreflight {
  return {
    definitionId: 'product_content',
    definitionVersion: '1.0.0',
    productId: 'product-1',
    platformId,
    nodes: nodeDefinitions.map(({ key, taskType }, index) => ({
      key, taskType, order: index + 1, runnable: true, missingInputs: [], dependencyHash: 'a'.repeat(64),
    })),
  };
}

function run(status: WorkflowRun['status'], failedNode?: WorkflowRun['nodes'][number]['key']): WorkflowRun {
  return {
    id: 'run-1', productId: 'product-1', platformId: 'pinduoduo', status, revision: 5,
    cancellationRequested: false,
    definition: { definitionId: 'product_content', version: '1.0.0', nodes: nodeDefinitions.map((node, index) => ({ ...node, order: index + 1 })) },
    nodes: nodeDefinitions.map(({ key, taskType }) => ({
      key, taskType, status: key === failedNode ? 'failed' : status === 'running' ? 'completed' : 'not_started',
      dependencyHash: 'a'.repeat(64), output: key === failedNode ? null : { assetType: taskType, assetId: `asset-${key}`, revisionNo: 2 },
      error: key === failedNode ? { code: 'AI_OUTPUT_INVALID', message: 'Workflow node execution failed.' } : null,
    })),
    createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:01:00.000Z',
  };
}

const nodeDefinitions = [
  { key: 'competitor_analysis', taskType: 'competitor_analysis', dependsOn: [] },
  { key: 'market_insight', taskType: 'market_insight', dependsOn: ['competitor_analysis'] },
  { key: 'selling_points', taskType: 'selling_point_set', dependsOn: ['market_insight'] },
  { key: 'titles', taskType: 'title_generation', dependsOn: ['selling_points'] },
  { key: 'creative', taskType: 'creative_plan', dependsOn: ['titles'] },
  { key: 'detail_page', taskType: 'detail_page', dependsOn: ['titles'] },
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
