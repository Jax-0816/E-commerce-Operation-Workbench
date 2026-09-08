import {
  createProduct,
  createUuidV7,
  type CompetitorRepository,
  type ProductRepository,
} from '@eaw/domain';
import { contentWorkflowDefinition } from '@eaw/workflow-engine';
import { describe, expect, it } from 'vitest';

import { createWorkflowsApplication, type WorkflowPreflightInspector } from './index.js';

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
});

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
