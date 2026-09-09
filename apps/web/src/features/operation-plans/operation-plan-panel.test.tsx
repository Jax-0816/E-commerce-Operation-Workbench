// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PricingApi } from '../pricing/api.js';
import type { PromotionApi } from '../promotion/api.js';
import type { SkusApi } from '../skus/api.js';
import type { WorkflowApi, WorkflowRun } from '../workflows/api.js';
import type { CreateOperationPlanInput, OperationPlanResponse, OperationPlansApi } from './api.js';
import { OperationPlanPanel } from './operation-plan-panel.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('operation plan panel', () => {
  it('renders newest immutable history and exact source trace without automatic mutation', async () => {
    const mutations: string[] = [];
    const older = plan({ id: 'plan-old', createdAt: '2026-09-08T00:00:00.000Z' });
    const newest = plan({
      id: 'plan-new',
      createdAt: '2026-09-09T00:00:00.000Z',
      blockers: [{ code: 'CONTENT_UNLOCKED', source: 'creative' }],
    });
    const operationPlansApi = plansApi({
      list: async () => [older, newest],
      create: async () => {
        mutations.push('create');
        return newest;
      },
      lock: async () => {
        mutations.push('lock');
        return newest;
      },
    });
    const { container, root } = await render({ operationPlansApi });

    const history = container.querySelectorAll('[data-testid="operation-plan-history-item"]');
    expect(history).toHaveLength(2);
    expect(history[0]?.textContent).toContain('plan-new');
    expect(container.textContent).toContain('workflow-run');
    expect(container.textContent).toContain('工作流修订 5');
    expect(container.textContent).toContain('asset-creative');
    expect(container.textContent).toContain('资产修订 2');
    expect(container.textContent).toContain('a'.repeat(64));
    expect(container.textContent).toContain('pricing-result');
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('存在 1 项阻塞');
    expect(button(container, '锁定当前修订').disabled).toBe(true);
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="/products/product-1/creative"]'),
    ).not.toBeNull();
    expect(mutations).toEqual([]);
    root.unmount();
  });

  it('creates and locks only after explicit clicks with exact selected IDs and revision guard', async () => {
    const createInputs: CreateOperationPlanInput[] = [];
    const lockInputs: [string, number][] = [];
    const draft = plan({ id: 'created-plan', revisionNo: 3 });
    const operationPlansApi = plansApi({
      list: async () => [],
      create: async (_productId, input) => {
        createInputs.push(input);
        return draft;
      },
      lock: async (id, revisionNo) => {
        lockInputs.push([id, revisionNo]);
        return {
          ...draft,
          id: 'locked-plan',
          revisionNo: 4,
          status: 'locked',
          lockedAt: '2026-09-09T01:00:00.000Z',
        };
      },
    });
    const { container, root } = await render({ operationPlansApi });

    await select(container, '工作流来源', 'workflow-run');
    await select(container, '定价来源', 'pricing-result');
    await select(container, '活动来源', 'promotion-scenario');
    expect(createInputs).toEqual([]);
    await click(container, '创建草稿');
    expect(createInputs).toEqual([
      {
        workflowRunId: 'workflow-run',
        pricingRecordId: 'pricing-result',
        promotionScenarioId: 'promotion-scenario',
        promotionResultIds: ['promotion-result'],
      },
    ]);
    await click(container, '锁定当前修订');
    expect(lockInputs).toEqual([['created-plan', 3]]);
    root.unmount();
  });

  it('discards late product and platform loads', async () => {
    const oldPlans = deferred<readonly OperationPlanResponse[]>();
    const oldRuns = deferred<readonly WorkflowRun[]>();
    const operationPlansApi = plansApi({
      list: async (productId) =>
        productId === 'product-1' ? oldPlans.promise : [plan({ id: 'product-2-plan', productId })],
    });
    const workflowApi = workflowsApi({
      list: async (productId) =>
        productId === 'product-1' ? oldRuns.promise : [workflow('taobao')],
    });
    const { container, root } = await render(
      { operationPlansApi, workflowApi },
      'product-1',
      false,
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <OperationPlanPanel
            operationPlansApi={operationPlansApi}
            pricingApi={pricingApi()}
            productId="product-2"
            promotionApi={promotionApi()}
            skusApi={skusApi()}
            workflowApi={workflowApi}
          />
        </MemoryRouter>,
      );
    });
    await select(container, '方案平台', 'taobao');
    oldPlans.resolve([plan({ id: 'stale-product-plan' })]);
    oldRuns.resolve([workflow('pinduoduo', 'stale-platform-run')]);
    await act(async () => undefined);

    expect(container.textContent).toContain('product-2-plan');
    expect(container.textContent).not.toContain('stale-product-plan');
    expect(container.querySelector('option[value="stale-platform-run"]')).toBeNull();
    root.unmount();
  });
});

async function render(
  overrides: { operationPlansApi?: OperationPlansApi; workflowApi?: WorkflowApi },
  productId = 'product-1',
  settle = true,
) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <OperationPlanPanel
          operationPlansApi={overrides.operationPlansApi ?? plansApi({})}
          pricingApi={pricingApi()}
          productId={productId}
          promotionApi={promotionApi()}
          skusApi={skusApi()}
          workflowApi={overrides.workflowApi ?? workflowsApi({})}
        />
      </MemoryRouter>,
    );
  });
  if (settle) await act(async () => undefined);
  return { container, root };
}

async function click(container: HTMLElement, label: string): Promise<void> {
  await act(async () => button(container, label).click());
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    ({ textContent }) => textContent === label,
  );
  expect(found).toBeDefined();
  return found!;
}

async function select(container: HTMLElement, label: string, value: string): Promise<void> {
  const element = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`);
  expect(element).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
      element,
      value,
    );
    element!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function plansApi(overrides: Partial<OperationPlansApi>): OperationPlansApi {
  const unavailable = async () => {
    throw new Error('not configured');
  };
  return {
    create: unavailable,
    list: async () => [],
    get: unavailable,
    lock: unavailable,
    ...overrides,
  } as OperationPlansApi;
}

function workflowsApi(overrides: Partial<WorkflowApi>): WorkflowApi {
  return {
    list: async () => [workflow('pinduoduo')],
    preflight: vi.fn(),
    start: vi.fn(),
    get: vi.fn(),
    resume: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
    subscribe: () => () => undefined,
    ...overrides,
  } as WorkflowApi;
}

function skusApi(): SkusApi {
  return {
    get: async () => ({
      dimensions: [],
      skus: [
        {
          id: 'sku-1',
          signature: '默认',
          valueIds: [],
          enabled: true,
          internalCode: null,
          externalCode: null,
          barcode: null,
          weightGrams: null,
        },
      ],
    }),
    configure: vi.fn(),
    update: vi.fn(),
  } as SkusApi;
}

function pricingApi(): PricingApi {
  return {
    calculate: vi.fn(),
    history: async () => ({
      items: [
        {
          scenario: {
            id: 'pricing-scenario',
            skuId: 'sku-1',
            costProfileId: 'cost-profile',
            costProfileRevisionNo: 2,
            name: '目标利润',
            goalSnapshot: {},
            createdAt: '2026-09-08T00:00:00.000Z',
          },
          results: [
            {
              id: 'pricing-result',
              scenarioId: 'pricing-scenario',
              skuId: 'sku-1',
              status: 'verified',
              inputSnapshot: {},
              resultSnapshot: {},
              engineVersion: '1',
              createdAt: '2026-09-08T00:01:00.000Z',
            },
          ],
        },
      ],
    }),
  } as PricingApi;
}

function promotionApi(): PromotionApi {
  return {
    create: vi.fn(),
    calculate: vi.fn(),
    history: async () => ({
      items: [
        {
          scenario: {
            id: 'promotion-scenario',
            name: '大促',
            platformId: 'pinduoduo',
            productId: 'product-1',
            region: 'CN',
            ruleSnapshotHash: 'b'.repeat(64),
            ruleSnapshotId: 'rule-snapshot',
            configurationSnapshot: {},
            createdAt: '2026-09-08T00:00:00.000Z',
          },
          results: [
            {
              id: 'promotion-result',
              scenarioId: 'promotion-scenario',
              skuId: 'sku-1',
              status: 'verified',
              costProfileId: 'cost-profile',
              costProfileRevisionNo: 2,
              inputSnapshot: {},
              resultSnapshot: {},
              engineVersion: '1',
              createdAt: '2026-09-08T00:01:00.000Z',
            },
          ],
        },
      ],
    }),
  } as PromotionApi;
}

function workflow(platformId: 'pinduoduo' | 'taobao', id = 'workflow-run'): WorkflowRun {
  return {
    id,
    productId: 'product-1',
    platformId,
    status: 'completed',
    revision: 5,
    cancellationRequested: false,
    definition: { definitionId: 'product_content', version: '1', nodes: [] },
    nodes: [],
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:01:00.000Z',
  };
}

function plan(overrides: Partial<OperationPlanResponse> = {}): OperationPlanResponse {
  const nodes = [
    'competitor_analysis',
    'market_insight',
    'selling_points',
    'titles',
    'creative',
    'detail_page',
  ] as const;
  return {
    id: 'plan-id',
    lineageId: 'lineage-id',
    productId: 'product-1',
    platformId: 'pinduoduo',
    revisionNo: 1,
    status: 'draft',
    lockedAt: null,
    sources: {
      workflowRunId: 'workflow-run',
      workflowRunRevision: 5,
      nodes: nodes.map((nodeKey) => ({
        nodeKey,
        assetType: nodeKey,
        assetId: `asset-${nodeKey}`,
        revisionNo: 2,
        dependencyHash: 'a'.repeat(64),
      })),
      competitorSnapshotIds: ['competitor-snapshot'],
      pricing: {
        resultId: 'pricing-result',
        scenarioId: 'pricing-scenario',
        skuId: 'sku-1',
        costProfileId: 'cost-profile',
        costProfileRevisionNo: 2,
      },
      promotion: null,
    },
    sourceHash: 'c'.repeat(64),
    blockers: [],
    supersedesRevisionId: null,
    createdAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
