import { describe, expect, it } from 'vitest';

import { CreateProductInputSchema, ProductResponseSchema } from './products.js';

describe('product contracts', () => {
  it('accepts a public product DTO and rejects internal archive fields', () => {
    expect(CreateProductInputSchema.parse({ name: '保温杯' })).toEqual({ name: '保温杯' });
    expect(
      ProductResponseSchema.safeParse({
        id: '0198f0a0-0000-7000-8000-000000000001',
        name: '保温杯',
        createdAt: '2026-08-19T08:00:00.000Z',
        updatedAt: '2026-08-19T08:00:00.000Z',
        archivedAt: null,
      }).success,
    ).toBe(false);
  });
});
