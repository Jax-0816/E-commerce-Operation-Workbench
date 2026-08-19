import { describe, expect, it } from 'vitest';

import { DomainError, parseUuidV7, type Product } from '@eaw/domain';
import type { ProductsApplication } from '@eaw/application';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

describe('product HTTP contract', () => {
  it('creates and lists public product DTOs while mapping duplicate names safely', async () => {
    const app = buildApp(
      createAppContext({
        products: new InMemoryProductsApplication(),
      }),
    );

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: '保温杯' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      id: '0198f0a0-0000-7000-8000-000000000001',
      name: '保温杯',
      createdAt: '2026-08-19T08:00:00.000Z',
      updatedAt: '2026-08-19T08:00:00.000Z',
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: '保温杯' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toMatchObject({ code: 'CONFLICT', traceId: expect.any(String) });
    expect(JSON.stringify(duplicate.json())).not.toContain('internal');

    const listed = await app.inject({ method: 'GET', url: '/api/v1/products' });
    expect(listed.json()).toEqual({ items: [created.json()] });

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/v1/products/0198f0a0-0000-7000-8000-000000000001',
    });
    expect(fetched.json()).toEqual(created.json());

    const archived = await app.inject({
      method: 'POST',
      url: '/api/v1/products/0198f0a0-0000-7000-8000-000000000001/archive',
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toEqual(created.json());
    await app.close();
  });
});

class InMemoryProductsApplication implements ProductsApplication {
  readonly items: Product[] = [];

  async create(input: { name: string }) {
    if (this.items.some((item) => item.name === input.name)) {
      throw new DomainError('CONFLICT', 'internal duplicate diagnosis');
    }
    const item = {
      id: parseUuidV7('0198f0a0-0000-7000-8000-000000000001'),
      name: input.name,
      createdAt: new Date('2026-08-19T08:00:00.000Z'),
      updatedAt: new Date('2026-08-19T08:00:00.000Z'),
      archivedAt: null,
    };
    this.items.push(item);
    return item;
  }

  async list() {
    return this.items;
  }

  async get() {
    return this.items[0];
  }

  async archive() {
    return this.items[0];
  }
}
