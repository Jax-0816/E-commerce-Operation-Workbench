import {
  createProduct,
  createUuidV7,
  type CompetitorRepository,
  type ProductRepository,
} from '@eaw/domain';
import { contentWorkflowDefinition } from '@eaw/workflow-engine';
import type { WorkflowEvent, WorkflowRun, WorkflowRunner } from '@eaw/workflow-engine';
import { describe, expect, it } from 'vitest';

import {
  createWorkflowsApplication,
  type ApplicationWorkflowRepository,
  type WorkflowPreflightInspector,
} from './index.js';

describe('workflows application preflight', () => {
  it('reports stable hashes and missing competitor inputs without executing generation', async () => {
    const product = createProduct({ id: createUuidV7(), name: '预检商品', now: new Date() });
    let executeCalls = 0;
    const handlers = Object.fromEntries(
      contentWorkflowDefinition.nodes.map((node, index) => [
        node.taskType,
        {
          async inspect() {
            return { dependencyHash: (index + 1).toString(16).repeat(64) };
          },
          async execute() {
            executeCalls += 1;
            throw new Error('preflight must not execute');
          },
        } satisfies WorkflowPreflightInspector,
      ]),
    );
    const application = createWorkflowsApplication({
      products: productRepository(product),
      competitors: emptyCompetitorRepository(),
      handlers,
    });

    const result = await application.preflight(product.id, 'pinduoduo');

    expect(result.nodes.map(({ key }) => key)).toEqual(
      contentWorkflowDefinition.nodes.map(({ key }) => key),
    );
    expect(result.nodes.map(({ dependencyHash }) => dependencyHash)).toEqual(
      contentWorkflowDefinition.nodes.map((_, index) => (index + 1).toString(16).repeat(64)),
    );
    expect(result.nodes[0]).toMatchObject({
      runnable: false,
      missingInputs: ['competitor_snapshot'],
    });
    expect(executeCalls).toBe(0);
  });

  it('rejects archived product ownership before inspecting nodes', async () => {
    const product = {
      ...createProduct({ id: createUuidV7(), name: '归档商品', now: new Date() }),
      archivedAt: new Date(),
    };
    let inspections = 0;
    const handlers = Object.fromEntries(
      contentWorkflowDefinition.nodes.map((node) => [
        node.taskType,
        {
          async inspect() {
            inspections += 1;
            return { dependencyHash: 'a'.repeat(64) };
          },
          async execute() {
            throw new Error('not used');
          },
        } satisfies WorkflowPreflightInspector,
      ]),
    );
    const application = createWorkflowsApplication({
      products: productRepository(product),
      competitors: emptyCompetitorRepository(),
      handlers,
    });

    await expect(application.preflight(product.id, 'taobao')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(inspections).toBe(0);
  });

  it('persists before scheduling and contains background runner failures', async () => {
    const product = createProduct({ id: createUuidV7(), name: '启动商品', now: new Date() });
    const createdAt = new Date('2026-09-08T04:00:00.000Z');
    const run = workflowRun(product.id, createdAt);
    let persisted: WorkflowRun | undefined;
    let scheduled: (() => Promise<void>) | undefined;
    const repository = workflowRepository({
      create: async (input) => {
        persisted = { ...run, ...input };
        return persisted;
      },
      findById: async (id) => (id === run.id ? persisted : undefined),
      listByProduct: async (productId) =>
        productId === product.id && persisted ? [persisted] : [],
    });
    const runner = workflowRunner({
      run: async () => {
        throw new Error('background failure');
      },
    });
    const application = createWorkflowsApplication({
      products: productRepository(product),
      competitors: emptyCompetitorRepository(),
      handlers: preflightHandlers(),
      repository,
      runner,
      idFactory: () => run.id,
      now: () => createdAt,
      schedule: (task) => {
        expect(persisted).toBeDefined();
        scheduled = task;
      },
    });

    const started = await application.start(product.id, 'pinduoduo');

    expect(started).toEqual(persisted);
    expect(await application.list(product.id)).toEqual([started]);
    expect(await application.get(started.id)).toEqual(started);
    await expect(scheduled?.()).resolves.toBeUndefined();
  });

  it('rejects a run whose owning product is absent', async () => {
    const product = createProduct({ id: createUuidV7(), name: '当前商品', now: new Date() });
    const foreignRun = workflowRun(createUuidV7(), new Date());
    const application = createWorkflowsApplication({
      products: productRepository(product),
      competitors: emptyCompetitorRepository(),
      handlers: preflightHandlers(),
      repository: workflowRepository({ findById: async () => foreignRun }),
      runner: workflowRunner(),
    });

    await expect(application.get(foreignRun.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

function preflightHandlers(): Readonly<Record<string, WorkflowPreflightInspector>> {
  return Object.fromEntries(
    contentWorkflowDefinition.nodes.map((node) => [
      node.taskType,
      {
        async inspect() {
          return { dependencyHash: 'a'.repeat(64) };
        },
        async execute() {
          throw new Error('not used');
        },
      } satisfies WorkflowPreflightInspector,
    ]),
  );
}

function workflowRun(productId: ReturnType<typeof createUuidV7>, now: Date): WorkflowRun {
  return {
    id: createUuidV7(now),
    productId,
    platformId: 'pinduoduo',
    definition: contentWorkflowDefinition,
    status: 'not_started',
    revision: 1,
    cancellationRequested: false,
    nodes: contentWorkflowDefinition.nodes.map(({ key, taskType }) => ({
      key,
      taskType,
      status: 'not_started',
      dependencyHash: null,
      output: null,
      error: null,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

function workflowRepository(
  overrides: Partial<ApplicationWorkflowRepository> = {},
): ApplicationWorkflowRepository {
  const unchanged = async () => {
    throw new Error('not used');
  };
  return {
    create: unchanged,
    findById: async () => undefined,
    listByProduct: async () => [],
    listEvents: async (): Promise<readonly WorkflowEvent[]> => [],
    markRunning: unchanged,
    markNodeStale: unchanged,
    claimNode: unchanged,
    completeNode: unchanged,
    failNode: unchanged,
    completeRun: unchanged,
    cancelRun: unchanged,
    ...overrides,
  } as ApplicationWorkflowRepository;
}

function workflowRunner(overrides: Partial<WorkflowRunner> = {}): WorkflowRunner {
  const unused = async () => {
    throw new Error('not used');
  };
  return { run: unused, resume: unused, retryNode: unused, cancel: unused, ...overrides };
}

function productRepository(product: ReturnType<typeof createProduct>): ProductRepository {
  return {
    async create(value) {
      return value;
    },
    async findActiveByName() {
      return undefined;
    },
    async findById(id) {
      return id === product.id ? product : undefined;
    },
    async list() {
      return [product];
    },
    async archive() {
      return undefined;
    },
  };
}

function emptyCompetitorRepository(): CompetitorRepository {
  return {
    async importBatch() {
      return [];
    },
    async findCompetitor() {
      return undefined;
    },
    async listByProduct() {
      return [];
    },
    async listSnapshots() {
      return [];
    },
  };
}
