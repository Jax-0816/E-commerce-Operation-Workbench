import type { UuidV7 } from '../ids.js';
import type { SkuCombination } from './sku-matrix.js';
import type { SpecificationDimension } from './specification.js';
export interface SkuMatrix {
  readonly dimensions: readonly SpecificationDimension[];
  readonly skus: readonly SkuCombination[];
}
export interface SkuMatrixRepository {
  load(productId: UuidV7): Promise<SkuMatrix>;
  replace(productId: UuidV7, matrix: SkuMatrix): Promise<SkuMatrix>;
  updateSku(productId: UuidV7, sku: SkuCombination): Promise<SkuCombination | undefined>;
}
