import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export interface Product {
  readonly id: UuidV7;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export interface CreateProductProps {
  readonly id: UuidV7;
  readonly name: string;
  readonly now: Date;
}

const MAX_PRODUCT_NAME_LENGTH = 120;

export function normalizeProductName(name: string): string {
  return name.trim();
}

export function createProduct({ id, name, now }: CreateProductProps): Product {
  const normalizedName = normalizeProductName(name);
  if (normalizedName.length === 0 || normalizedName.length > MAX_PRODUCT_NAME_LENGTH) {
    throw new DomainError('VALIDATION_ERROR', 'Product name is required.', { field: 'name' });
  }

  return {
    id,
    name: normalizedName,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}
