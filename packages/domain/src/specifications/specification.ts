import { DomainError } from '../errors.js';
import type { UuidV7 } from '../ids.js';

export interface SpecificationValue {
  readonly id: UuidV7;
  readonly dimensionId: UuidV7;
  readonly label: string;
  readonly position: number;
}
export interface SpecificationDimension {
  readonly id: UuidV7;
  readonly productId: UuidV7;
  readonly name: string;
  readonly position: number;
  readonly values: readonly SpecificationValue[];
}

export function validateDimensions(
  dimensions: readonly SpecificationDimension[],
): readonly SpecificationDimension[] {
  if (dimensions.length === 0) throw invalid('At least one specification dimension is required.');
  const productId = dimensions[0]!.productId;
  const dimensionIds = new Set<string>(),
    dimensionNames = new Set<string>(),
    valueIds = new Set<string>();
  for (const dimension of dimensions) {
    const name = dimension.name.trim().toLowerCase();
    if (
      dimension.productId !== productId ||
      !name ||
      dimensionIds.has(dimension.id) ||
      dimensionNames.has(name)
    )
      throw invalid('Specification dimensions must be unique and belong to one product.');
    if (
      !Number.isSafeInteger(dimension.position) ||
      dimension.position < 0 ||
      dimension.values.length === 0
    )
      throw invalid('Specification dimensions require a valid position and at least one value.');
    dimensionIds.add(dimension.id);
    dimensionNames.add(name);
    const labels = new Set<string>();
    for (const value of dimension.values) {
      const label = value.label.trim().toLowerCase();
      if (
        value.dimensionId !== dimension.id ||
        !label ||
        valueIds.has(value.id) ||
        labels.has(label) ||
        !Number.isSafeInteger(value.position) ||
        value.position < 0
      )
        throw invalid('Specification values must be unique and belong to their dimension.');
      valueIds.add(value.id);
      labels.add(label);
    }
  }
  return [...dimensions]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((dimension) => ({
      ...dimension,
      values: [...dimension.values].sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id),
      ),
    }));
}
function invalid(message: string): DomainError {
  return new DomainError('VALIDATION_ERROR', message);
}
