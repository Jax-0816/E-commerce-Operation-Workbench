import {
  createUuidV7,
  DomainError,
  generateSkuMatrix,
  parseUuidV7,
  type ProductRepository,
  type SkuCombination,
  type SkuMatrix,
  type SkuMatrixRepository,
  type UuidV7,
} from '@eaw/domain';
export interface ConfigureDimensionInput {
  readonly name: string;
  readonly values: readonly string[];
}
export type UpdateSkuInput = Pick<
  SkuCombination,
  'enabled' | 'internalCode' | 'externalCode' | 'barcode' | 'weightGrams'
>;
export interface SkusApplication {
  get(productId: string): Promise<SkuMatrix>;
  configure(productId: string, dimensions: readonly ConfigureDimensionInput[]): Promise<SkuMatrix>;
  update(productId: string, skuId: string, input: UpdateSkuInput): Promise<SkuCombination>;
}
export function createSkusApplication(deps: {
  repository: SkuMatrixRepository;
  products: ProductRepository;
  idFactory?: () => UuidV7;
}): SkusApplication {
  const ids = deps.idFactory ?? createUuidV7;
  const owner = async (id: string) => {
    const p = await deps.products.findById(parseUuidV7(id));
    if (!p || p.archivedAt) throw new DomainError('NOT_FOUND', 'Product was not found.');
    return p.id;
  };
  return {
    async get(id) {
      return deps.repository.load(await owner(id));
    },
    async configure(id, input) {
      const productId = await owner(id),
        current = await deps.repository.load(productId);
      const dimensions = input.map((d, position) => {
        const old = current.dimensions.find(
            (x) => x.name.trim().toLowerCase() === d.name.trim().toLowerCase(),
          ),
          dimensionId = old?.id ?? ids();
        return {
          id: dimensionId,
          productId,
          name: d.name.trim(),
          position,
          values: d.values.map((label, valuePosition) => ({
            id:
              old?.values.find((v) => v.label.trim().toLowerCase() === label.trim().toLowerCase())
                ?.id ?? ids(),
            dimensionId,
            label: label.trim(),
            position: valuePosition,
          })),
        };
      });
      return deps.repository.replace(productId, {
        dimensions,
        skus: generateSkuMatrix(dimensions, current.skus, ids),
      });
    },
    async update(id, skuId, input) {
      const productId = await owner(id),
        matrix = await deps.repository.load(productId),
        existing = matrix.skus.find((s) => s.id === parseUuidV7(skuId));
      if (!existing) throw new DomainError('NOT_FOUND', 'SKU was not found.');
      if (
        input.weightGrams !== null &&
        (!Number.isSafeInteger(input.weightGrams) || input.weightGrams < 0)
      )
        throw new DomainError('VALIDATION_ERROR', 'SKU weight is invalid.');
      const saved = await deps.repository.updateSku(productId, { ...existing, ...input });
      if (!saved) throw new DomainError('CONFLICT', 'SKU changed; reload.');
      return saved;
    },
  };
}
