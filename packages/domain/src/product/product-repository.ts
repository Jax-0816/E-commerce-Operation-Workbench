import type { UuidV7 } from '../ids.js';
import type { Product } from './product.js';

export interface ProductRepository {
  create(product: Product): Promise<Product>;
  findActiveByName(name: string): Promise<Product | undefined>;
  findById(id: UuidV7): Promise<Product | undefined>;
  list(): Promise<readonly Product[]>;
  archive(id: UuidV7, archivedAt: Date): Promise<Product | undefined>;
}
