import { describe, expect, it } from 'vitest';

import {
  parseUuidV7,
  type Product,
  type ProductFact,
  type ProductFactRepository,
  type ProductRepository,
} from '@eaw/domain';

import { createFactsApplication } from './index.js';

const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');
const firstFactId = parseUuidV7('0198f0a0-0000-7000-8000-000000000101');
const secondFactId = parseUuidV7('0198f0a0-0000-7000-8000-000000000102');

describe('fact use cases', () => {
  it('creates an inferred fact, explicitly confirms it, and forbids silent edits', async () => {
    const repository = new MemoryFactRepository();
    const times = [
      new Date('2026-08-19T08:00:00.000Z'),
      new Date('2026-08-19T09:00:00.000Z'),
      new Date('2026-08-19T10:00:00.000Z'),
    ];
    const application = createFactsApplication({
      repository,
      products: new ExistingProductRepository(),
      idFactory: () => firstFactId,
      now: () => times.shift()!,
    });

    const inferred = await application.create(productId, {
      key: 'material',
      label: '材质',
      value: { type: 'text', value: '304不锈钢' },
      unit: null,
      sourceType: 'ai_inferred',
      sourceRef: 'generation:1',
      verification: 'inferred',
      sensitive: false,
      policyEligible: true,
    });
    expect(inferred.verification).toBe('inferred');

    const confirmed = await application.confirm(productId, inferred.id, {
      expectedUpdatedAt: inferred.updatedAt,
      actorRef: 'local-user',
      evidenceRef: 'supplier:certificate-1',
    });
    expect(confirmed).toMatchObject({
      verification: 'confirmed',
      confirmation: { actorType: 'user' },
    });

    await expect(
      application.update(productId, inferred.id, {
        expectedUpdatedAt: confirmed.updatedAt,
        label: '更改后的材质',
        value: { type: 'text', value: '316不锈钢' },
        unit: null,
        sourceType: 'manual',
        sourceRef: null,
        verification: 'unverified',
        sensitive: false,
        policyEligible: true,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('creates an explicit revision instead of mutating a confirmed fact', async () => {
    const repository = new MemoryFactRepository();
    let nextId = firstFactId;
    let minute = 0;
    const application = createFactsApplication({
      repository,
      products: new ExistingProductRepository(),
      idFactory: () => nextId,
      now: () => new Date(`2026-08-19T08:${String(minute++).padStart(2, '0')}:00.000Z`),
    });
    const original = await application.create(productId, draftInput());
    const confirmed = await application.confirm(productId, original.id, {
      expectedUpdatedAt: original.updatedAt,
      actorRef: 'local-user',
      evidenceRef: 'supplier:1',
    });

    nextId = secondFactId;
    const revision = await application.revise(productId, confirmed.id, {
      ...draftInput(),
      value: { type: 'text', value: '316不锈钢' },
    });

    expect(revision).toMatchObject({
      id: secondFactId,
      revisionNo: 2,
      supersedesFactId: firstFactId,
      verification: 'unverified',
    });
    expect(await application.list(productId)).toEqual([revision]);
    expect(repository.rows.find(({ id }) => id === firstFactId)).toEqual(confirmed);
  });

  it('rejects stale confirmation and facts for another or archived product', async () => {
    const repository = new MemoryFactRepository();
    const application = createFactsApplication({
      repository,
      products: new ExistingProductRepository(),
      idFactory: () => firstFactId,
      now: () => new Date('2026-08-19T08:00:00.000Z'),
    });
    const fact = await application.create(productId, draftInput());
    await expect(
      application.confirm(productId, fact.id, {
        expectedUpdatedAt: new Date('2026-08-19T07:00:00.000Z'),
        actorRef: 'local-user',
        evidenceRef: 'supplier:1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      application.create(parseUuidV7('0198f0a0-0000-7000-8000-000000000099'), draftInput()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('advances the optimistic token even when the wall clock has not moved', async () => {
    const repository = new MemoryFactRepository();
    const application = createFactsApplication({
      repository,
      products: new ExistingProductRepository(),
      idFactory: () => firstFactId,
      now: () => new Date('2026-08-19T08:00:00.000Z'),
    });
    const original = await application.create(productId, draftInput());
    const updated = await application.update(productId, original.id, {
      ...draftInput(),
      label: '材质名称',
      expectedUpdatedAt: original.updatedAt,
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
    await expect(
      application.update(productId, original.id, {
        ...draftInput(),
        label: '陈旧写入',
        expectedUpdatedAt: original.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

function draftInput() {
  return {
    key: 'material',
    label: '材质',
    value: { type: 'text', value: '304不锈钢' } as const,
    unit: null,
    sourceType: 'supplier' as const,
    sourceRef: 'supplier:1',
    verification: 'unverified' as const,
    sensitive: false,
    policyEligible: true,
  };
}

class ExistingProductRepository implements ProductRepository {
  async create(product: Product) {
    return product;
  }
  async findActiveByName() {
    return undefined;
  }
  async findById(id: Product['id']) {
    if (id !== productId) return undefined;
    const now = new Date('2026-08-19T00:00:00.000Z');
    return { id, name: '保温杯', createdAt: now, updatedAt: now, archivedAt: null };
  }
  async list() {
    return [];
  }
  async archive() {
    return undefined;
  }
}

class MemoryFactRepository implements ProductFactRepository {
  readonly rows: ProductFact[] = [];
  readonly current = new Set<string>();

  async create(fact: ProductFact) {
    if (
      this.rows.some(
        (row) =>
          row.productId === fact.productId && row.key === fact.key && this.current.has(row.id),
      )
    )
      throw new Error('duplicate');
    this.rows.push(fact);
    this.current.add(fact.id);
    return fact;
  }
  async findById(owner: ProductFact['productId'], id: ProductFact['id']) {
    return this.rows.find((row) => row.productId === owner && row.id === id);
  }
  async findCurrentByKey(owner: ProductFact['productId'], key: string) {
    return this.rows.find(
      (row) => row.productId === owner && row.key === key && this.current.has(row.id),
    );
  }
  async listCurrent(owner: ProductFact['productId']) {
    return this.rows.filter((row) => row.productId === owner && this.current.has(row.id));
  }
  async updateDraft(fact: ProductFact, expected: Date) {
    const index = this.rows.findIndex(
      (row) =>
        row.id === fact.id &&
        row.updatedAt.getTime() === expected.getTime() &&
        row.verification !== 'confirmed',
    );
    if (index < 0) return undefined;
    this.rows[index] = fact;
    return fact;
  }
  async confirm(fact: ProductFact, expected: Date) {
    const index = this.rows.findIndex(
      (row) =>
        row.id === fact.id &&
        row.updatedAt.getTime() === expected.getTime() &&
        row.verification !== 'confirmed',
    );
    if (index < 0) return undefined;
    this.rows[index] = fact;
    return fact;
  }
  async replaceCurrent(previous: ProductFact, next: ProductFact) {
    this.current.delete(previous.id);
    this.rows.push(next);
    this.current.add(next.id);
    return next;
  }
  async deleteDraft(owner: ProductFact['productId'], id: ProductFact['id'], expected: Date) {
    const index = this.rows.findIndex(
      (row) =>
        row.productId === owner &&
        row.id === id &&
        row.updatedAt.getTime() === expected.getTime() &&
        row.verification !== 'confirmed',
    );
    if (index < 0) return false;
    this.rows.splice(index, 1);
    this.current.delete(id);
    return true;
  }
}
