import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors.js';
import { parseUuidV7 } from '../ids.js';
import { createProduct, normalizeProductName } from './product.js';

const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');

describe('Product', () => {
  it('normalizes its active name and retains aggregate timestamps', () => {
    const createdAt = new Date('2026-08-19T08:00:00.000Z');

    expect(createProduct({ id: productId, name: '  保温杯  ', now: createdAt })).toEqual({
      id: productId,
      name: '保温杯',
      createdAt,
      updatedAt: createdAt,
      archivedAt: null,
    });
    expect(normalizeProductName('  保温杯  ')).toBe('保温杯');
  });

  it('rejects a blank product name', () => {
    expect(() => createProduct({ id: productId, name: '   ', now: new Date() })).toThrow(
      new DomainError('VALIDATION_ERROR', 'Product name is required.', { field: 'name' }),
    );
  });
});
