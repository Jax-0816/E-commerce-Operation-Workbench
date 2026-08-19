import { and, asc, eq, isNull, type InferSelectModel } from 'drizzle-orm';

import {
  DomainError,
  normalizeProductName,
  type Product,
  type ProductRepository,
  type UuidV7,
} from '@eaw/domain';

import type { OpenDatabase } from '../client.js';
import { products } from '../schema/products.js';

type ProductRow = InferSelectModel<typeof products>;
type DrizzleDatabase = OpenDatabase['drizzle'];

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  async create(product: Product): Promise<Product> {
    try {
      const row = await this.database
        .insert(products)
        .values({
          id: product.id,
          name: product.name,
          activeName: normalizeProductName(product.name),
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          archivedAt: product.archivedAt,
        })
        .returning()
        .get();
      return toProduct(row);
    } catch (error) {
      if (isActiveNameConstraint(error)) {
        throw new DomainError('CONFLICT', 'An active product already has this name.', {
          field: 'name',
        });
      }
      throw error;
    }
  }

  async findActiveByName(name: string): Promise<Product | undefined> {
    const row = await this.database
      .select()
      .from(products)
      .where(and(eq(products.activeName, normalizeProductName(name)), isNull(products.archivedAt)))
      .get();
    return row === undefined ? undefined : toProduct(row);
  }

  async findById(id: UuidV7): Promise<Product | undefined> {
    const row = await this.database.select().from(products).where(eq(products.id, id)).get();
    return row === undefined ? undefined : toProduct(row);
  }

  async list(): Promise<readonly Product[]> {
    const rows = await this.database
      .select()
      .from(products)
      .where(isNull(products.archivedAt))
      .orderBy(asc(products.createdAt), asc(products.id));
    return rows.map(toProduct);
  }

  async archive(id: UuidV7, archivedAt: Date): Promise<Product | undefined> {
    const row = await this.database
      .update(products)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(and(eq(products.id, id), isNull(products.archivedAt)))
      .returning()
      .get();
    return row === undefined ? undefined : toProduct(row);
  }
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id as UuidV7,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

function isActiveNameConstraint(error: unknown): boolean {
  return containsConstraint(error, new Set());
}

function containsConstraint(error: unknown, seen: Set<unknown>): boolean {
  if (error === null || typeof error !== 'object' || seen.has(error)) return false;
  seen.add(error);
  if (error instanceof Error && error.message.includes('products.active_name')) return true;
  return 'cause' in error && containsConstraint(error.cause, seen);
}
