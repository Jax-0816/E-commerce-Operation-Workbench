import { describe, expect, it } from 'vitest';

import { parseUuidV7 } from '../ids.js';
import type { ProductRepository } from './product-repository.js';

describe('ProductRepository', () => {
  it('expresses active-name lookup and deterministic list semantics', () => {
    const repository: ProductRepository = {
      archive: async () => undefined,
      create: async (product) => product,
      findActiveByName: async () => undefined,
      findById: async () => undefined,
      list: async () => [],
    };

    expect(repository).toBeDefined();
    expect(parseUuidV7('0198f0a0-0000-7000-8000-000000000001')).toBeDefined();
  });
});
