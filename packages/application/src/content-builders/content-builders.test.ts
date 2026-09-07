import { describe, expect, it } from 'vitest';

import {
  createCreativePlanRevision,
  createDetailPageRevision,
  createProduct,
  createUuidV7,
  type AppendCreativePlanInput,
  type CreativePlanRepository,
  type CreativePlanRevision,
  type DetailPageRepository,
  type DetailPageRevision,
  type ProductRepository,
} from '@eaw/domain';

import { createContentBuildersApplication, type ContentGenerationPort } from './index.js';

describe('content builders application', () => {
  it('locks one creative item by appending a revision without changing history', async () => {
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    const creative = new MemoryCreativeRepository([seedCreative(product.id)]);
    const app = createContentBuildersApplication({
      products: productRepository(product),
      creative,
      detail: new MemoryDetailRepository(),
    });

    const first = (await (creative as CreativePlanRepository).list(product.id, 'pinduoduo'))[0]!;
    const locked = await app.lockCreativeItem(product.id, 'pinduoduo', first.items[1]!.id);

    expect(locked.revision).toMatchObject({ revisionNo: 2, origin: 'locked_item' });
    expect(locked.revision.items.map(({ locked }) => locked)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(
      (await (creative as CreativePlanRepository).list(product.id, 'pinduoduo'))[1]?.items[1]
        ?.locked,
    ).toBe(false);
  });

  it('preserves a locked detail section when regenerating the full architecture', async () => {
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    const seed = seedDetail(product.id);
    const detail = new MemoryDetailRepository([seed]);
    const app = createContentBuildersApplication({
      products: productRepository(product),
      creative: new MemoryCreativeRepository([]),
      detail,
      generation: generationThatRewritesDetail(seed),
    });

    const locked = await app.lockDetailSection(product.id, 'pinduoduo', seed.sections[0]!.id);
    const regenerated = await app.generateDetail(product.id, 'pinduoduo');

    expect(regenerated.revision.revisionNo).toBe(3);
    expect(regenerated.revision.sections[0]).toEqual(locked.revision.sections[0]);
    expect(regenerated.revision.sections[1]?.headline).toBe('新生成区块 2');
    expect((await detail.list())[2]?.sections[0]?.locked).toBe(false);
  });
});

class MemoryCreativeRepository implements CreativePlanRepository {
  constructor(private readonly values: CreativePlanRevision[]) {}
  async append(input: AppendCreativePlanInput) {
    const previous = this.values[0];
    const revision = createCreativePlanRevision({
      ...input,
      revisionNo: (previous?.revisionNo ?? 0) + 1,
      supersedesRevisionId: previous?.id ?? null,
    });
    this.values.unshift(revision);
    return revision;
  }
  async latest() {
    return this.values[0];
  }
  async list() {
    return [...this.values];
  }
}

class MemoryDetailRepository implements DetailPageRepository {
  constructor(private readonly values: DetailPageRevision[] = []) {}
  async append(input: Parameters<DetailPageRepository['append']>[0]): Promise<DetailPageRevision> {
    const previous = this.values[0];
    const revision = createDetailPageRevision({
      ...input,
      revisionNo: (previous?.revisionNo ?? 0) + 1,
      supersedesRevisionId: previous?.id ?? null,
    });
    this.values.unshift(revision);
    return revision;
  }
  async latest() {
    return this.values[0];
  }
  async list() {
    return [...this.values];
  }
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

function seedCreative(productId: ReturnType<typeof createUuidV7>) {
  return createCreativePlanRevision({
    id: createUuidV7(),
    lineageId: createUuidV7(),
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    origin: 'reordered',
    status: 'verified',
    items: Array.from({ length: 5 }, (_, index) => ({
      id: createUuidV7(),
      order: index + 1,
      role: index === 0 ? 'hero' : 'supporting',
      headline: `图 ${index + 1}`,
      body: '说明',
      promptZh: '中文提示',
      promptEn: 'English prompt',
      negativePromptZh: '中文负面',
      negativePromptEn: 'English negative',
      evidenceRefs: [],
      reviewTerms: [],
      locked: false,
    })),
    dependencyHashes: { facts: 'a'.repeat(64) },
    validationIssues: [],
    generationId: null,
    supersedesRevisionId: null,
    createdAt: new Date(),
  });
}

function seedDetail(productId: ReturnType<typeof createUuidV7>) {
  return createDetailPageRevision({
    id: createUuidV7(),
    lineageId: createUuidV7(),
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    origin: 'generated',
    status: 'verified',
    sections: [1, 2].map((order) => ({
      id: createUuidV7(),
      order,
      kind: order === 1 ? ('hero' as const) : ('benefit' as const),
      headline: `原区块 ${order}`,
      body: '说明',
      evidenceRefs: [],
      reviewTerms: [],
      locked: false,
    })),
    dependencyHashes: { facts: 'a'.repeat(64) },
    validationIssues: [],
    generationId: createUuidV7(),
    supersedesRevisionId: null,
    createdAt: new Date(),
  });
}

function generationThatRewritesDetail(seed: DetailPageRevision): ContentGenerationPort {
  return {
    async generateCreative() {
      throw new Error('unused');
    },
    async regenerateCreativeItem() {
      throw new Error('unused');
    },
    async generateDetail() {
      return {
        sections: seed.sections.map((section) => ({
          ...section,
          headline: `新生成区块 ${section.order}`,
          locked: false,
        })),
        status: 'verified',
        validationIssues: [],
        dependencyHashes: seed.dependencyHashes,
        generationId: createUuidV7(),
      };
    },
    async currentHashes() {
      return seed.dependencyHashes;
    },
  };
}
