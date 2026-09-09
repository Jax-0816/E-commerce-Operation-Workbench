import {
  createProduct,
  createUuidV7,
  type OperationPlanRepository,
  type OperationPlanRevision,
  type OperationPlanSources,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';
import { describe, expect, it } from 'vitest';

import { createOperationPlansApplication, type OperationPlanSourceResolver } from './index.js';

describe('operation plans application', () => {
  it('creates a deterministic product-owned draft without generation', async () => {
    const fixture = setup();
    const draft = await fixture.application.createDraft(fixture.productId, {
      workflowRunId: fixture.sources.workflowRunId,
      pricingRecordId: fixture.sources.pricing.resultId,
    });

    expect(draft).toMatchObject({
      productId: fixture.productId,
      platformId: 'pinduoduo',
      revisionNo: 1,
      status: 'draft',
      sources: fixture.sources,
      blockers: [],
    });
    expect(draft.sourceHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(fixture.resolver.resolveCalls).toBe(1);
    expect(await fixture.application.list(fixture.productId)).toEqual([draft]);
    await expect(
      fixture.application.createDraft(createUuidV7(), {
        workflowRunId: fixture.sources.workflowRunId,
        pricingRecordId: fixture.sources.pricing.resultId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('revalidates every exact source and uses expected revision before locking', async () => {
    const fixture = setup();
    const draft = await fixture.application.createDraft(fixture.productId, {
      workflowRunId: fixture.sources.workflowRunId,
      pricingRecordId: fixture.sources.pricing.resultId,
    });
    fixture.resolver.blockers = [{ code: 'SOURCE_STALE', source: 'titles' }];
    await expect(fixture.application.lock(draft.id, 1)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fixture.repository.values).toHaveLength(1);

    fixture.resolver.blockers = [];
    await expect(fixture.application.lock(draft.id, 2)).rejects.toMatchObject({ code: 'CONFLICT' });
    const locked = await fixture.application.lock(draft.id, 1);
    expect(locked).toMatchObject({
      status: 'locked',
      revisionNo: 2,
      supersedesRevisionId: draft.id,
    });
    expect(locked.sources).toEqual(draft.sources);
    expect(fixture.resolver.revalidateCalls).toBe(2);
  });

  it('refreshes draft blockers for reads without mutating persisted history', async () => {
    const fixture = setup();
    const draft = await fixture.application.createDraft(fixture.productId, {
      workflowRunId: fixture.sources.workflowRunId,
      pricingRecordId: fixture.sources.pricing.resultId,
    });
    fixture.resolver.blockers = [{ code: 'CONTENT_UNLOCKED', source: 'titles' }];

    await expect(fixture.application.get(draft.id)).resolves.toMatchObject({
      blockers: fixture.resolver.blockers,
    });
    await expect(fixture.application.list(fixture.productId)).resolves.toMatchObject([
      { blockers: fixture.resolver.blockers },
    ]);
    expect(fixture.repository.values[0]!.blockers).toEqual([]);
  });
});

function setup() {
  const product = createProduct({ id: createUuidV7(), name: '运营方案商品', now: new Date() });
  const sources = exactSources();
  const repository = new MemoryPlans();
  const resolver = new FakeResolver(sources);
  return {
    productId: product.id,
    sources,
    repository,
    resolver,
    application: createOperationPlansApplication({
      products: new MemoryProducts(product),
      repository,
      resolver,
      now: () => new Date('2026-09-09T03:00:00.000Z'),
      idFactory: createUuidV7,
    }),
  };
}

class FakeResolver implements OperationPlanSourceResolver {
  resolveCalls = 0;
  revalidateCalls = 0;
  blockers: OperationPlanRevision['blockers'] = [];
  constructor(private readonly sources: OperationPlanSources) {}
  async resolve() {
    this.resolveCalls += 1;
    return { platformId: 'pinduoduo' as const, sources: this.sources, blockers: this.blockers };
  }
  async revalidate() {
    this.revalidateCalls += 1;
    return this.blockers;
  }
}

class MemoryPlans implements OperationPlanRepository {
  values: OperationPlanRevision[] = [];
  async append(value: OperationPlanRevision, expectedRevisionNo: number | null) {
    const previous = this.values.find(({ lineageId }) => lineageId === value.lineageId);
    if ((previous?.revisionNo ?? null) !== expectedRevisionNo)
      throw new Error('unexpected revision');
    this.values.unshift(value);
    return value;
  }
  async findById(id: UuidV7) {
    return this.values.find((value) => value.id === id);
  }
  async latest(lineageId: UuidV7) {
    return this.values.find((value) => value.lineageId === lineageId);
  }
  async list(productId: UuidV7) {
    return this.values.filter((value) => value.productId === productId);
  }
}

class MemoryProducts implements ProductRepository {
  constructor(private readonly product: ReturnType<typeof createProduct>) {}
  async create() {
    return this.product;
  }
  async findById(id: UuidV7) {
    return id === this.product.id ? this.product : undefined;
  }
  async findActiveByName() {
    return undefined;
  }
  async list() {
    return [this.product];
  }
  async archive() {
    return undefined;
  }
}

function exactSources(): OperationPlanSources {
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
  return {
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
  };
}
