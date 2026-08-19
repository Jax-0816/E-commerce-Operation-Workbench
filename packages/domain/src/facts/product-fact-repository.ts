import type { UuidV7 } from '../ids.js';
import type { ProductFact } from './product-fact.js';

export interface ProductFactRepository {
  create(fact: ProductFact): Promise<ProductFact>;
  findById(productId: UuidV7, factId: UuidV7): Promise<ProductFact | undefined>;
  findCurrentByKey(productId: UuidV7, key: string): Promise<ProductFact | undefined>;
  listCurrent(productId: UuidV7): Promise<readonly ProductFact[]>;
  updateDraft(fact: ProductFact, expectedUpdatedAt: Date): Promise<ProductFact | undefined>;
  confirm(fact: ProductFact, expectedUpdatedAt: Date): Promise<ProductFact | undefined>;
  replaceCurrent(previous: ProductFact, next: ProductFact): Promise<ProductFact>;
  deleteDraft(productId: UuidV7, factId: UuidV7, expectedUpdatedAt: Date): Promise<boolean>;
}
