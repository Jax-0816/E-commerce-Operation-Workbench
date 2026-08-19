import { DomainError } from '../errors.js';
import { createUuidV7, type UuidV7 } from '../ids.js';
import { validateDimensions, type SpecificationDimension } from './specification.js';

export interface SkuCombination {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly signature: string;
  readonly valueIds: readonly UuidV7[];
  readonly enabled: boolean;
  readonly internalCode: string | null;
  readonly externalCode: string | null;
  readonly barcode: string | null;
  readonly weightGrams: number | null;
}
export function generateSkuMatrix(
  dimensions: readonly SpecificationDimension[],
  existing: readonly SkuCombination[],
  idFactory: () => UuidV7 = createUuidV7,
): readonly SkuCombination[] {
  const ordered = validateDimensions(dimensions),
    productId = ordered[0]!.productId;
  const bySignature = new Map(existing.map((sku) => [sku.signature, sku]));
  if (existing.some((sku) => sku.productId !== productId) || bySignature.size !== existing.length)
    throw new DomainError('VALIDATION_ERROR', 'Existing SKU combinations are invalid.');
  let combinations: UuidV7[][] = [[]];
  for (const dimension of ordered)
    combinations = combinations.flatMap((prefix) =>
      dimension.values.map((value) => [...prefix, value.id]),
    );
  return combinations.map((valueIds) => {
    const signature = valueIds.join(':'),
      previous = bySignature.get(signature);
    if (previous !== undefined && sameValues(previous.valueIds, valueIds)) return previous;
    return {
      id: idFactory(),
      productId,
      signature,
      valueIds,
      enabled: true,
      internalCode: null,
      externalCode: null,
      barcode: null,
      weightGrams: null,
    };
  });
}
function sameValues(left: readonly UuidV7[], right: readonly UuidV7[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
