import { describe, expect, it } from 'vitest';

import type { ConfirmFactInput, FactsApplication } from '@eaw/application';
import { parseUuidV7, type ProductFact } from '@eaw/domain';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

const productId = '0198f0a0-0000-7000-8000-000000000001';
const factId = '0198f0a0-0000-7000-8000-000000000101';

describe('product fact HTTP contract', () => {
  it('parses/calls/maps fact CRUD and explicit confirmation without leaking persistence fields', async () => {
    const facts = new RecordingFactsApplication();
    const app = buildApp(createAppContext({ facts }));
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/facts`,
      payload: {
        key: 'material',
        label: '材质',
        value: { type: 'text', value: '304不锈钢' },
        unit: null,
        sourceType: 'ai_inferred',
        sourceRef: 'generation:1',
        verification: 'inferred',
        sensitive: false,
        policyEligible: true,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ id: factId, productId, verification: 'inferred' });
    expect(created.json()).not.toHaveProperty('isCurrent');

    const listed = await app.inject({ method: 'GET', url: `/api/v1/products/${productId}/facts` });
    expect(listed.json()).toEqual({ items: [created.json()] });

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/facts/${factId}/confirm`,
      payload: {
        expectedUpdatedAt: '2026-08-19T08:00:00.000Z',
        actorRef: 'local-user',
        evidenceRef: 'supplier:certificate-1',
      },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(facts.lastConfirmation).toEqual({
      expectedUpdatedAt: new Date('2026-08-19T08:00:00.000Z'),
      actorRef: 'local-user',
      evidenceRef: 'supplier:certificate-1',
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/products/${productId}/facts/${factId}`,
      payload: { expectedUpdatedAt: '2026-08-19T08:00:00.000Z' },
    });
    expect(deleted.statusCode).toBe(204);
    await app.close();
  });

  it('rejects direct confirmed creation before invoking the use case', async () => {
    const facts = new RecordingFactsApplication();
    const app = buildApp(createAppContext({ facts }));
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/facts`,
      payload: {
        key: 'material',
        label: '材质',
        value: { type: 'text', value: '304' },
        unit: null,
        sourceType: 'manual',
        sourceRef: null,
        verification: 'confirmed',
        sensitive: false,
        policyEligible: true,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(facts.createCalls).toBe(0);
    await app.close();
  });
});

class RecordingFactsApplication implements FactsApplication {
  createCalls = 0;
  lastConfirmation: ConfirmFactInput | undefined;
  private readonly fact: ProductFact = {
    id: parseUuidV7(factId),
    lineageId: parseUuidV7(factId),
    productId: parseUuidV7(productId),
    key: 'material',
    label: '材质',
    value: { type: 'text', value: '304不锈钢' },
    unit: null,
    sourceType: 'ai_inferred',
    sourceRef: 'generation:1',
    verification: 'inferred',
    sensitive: false,
    policyEligible: true,
    revisionNo: 1,
    supersedesFactId: null,
    createdAt: new Date('2026-08-19T08:00:00.000Z'),
    updatedAt: new Date('2026-08-19T08:00:00.000Z'),
    confirmedAt: null,
    confirmation: null,
    deletedAt: null,
  };
  async create() {
    this.createCalls += 1;
    return this.fact;
  }
  async list() {
    return [this.fact];
  }
  async get() {
    return this.fact;
  }
  async update() {
    return this.fact;
  }
  async confirm(_productId: string, _factId: string, input: ConfirmFactInput) {
    this.lastConfirmation = input;
    return this.fact;
  }
  async revise() {
    return this.fact;
  }
  async delete() {
    return undefined;
  }
}
