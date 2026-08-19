import { describe, expect, it } from 'vitest';

import { parseUuidV7 } from '../ids.js';
import { generateSkuMatrix, type SpecificationDimension } from './index.js';

const productId = parseUuidV7('0198f0a0-0000-7000-8000-000000000001');
const ids = (suffix: string) => parseUuidV7(`0198f0a0-0000-7000-8000-${suffix}`);

function dimensions(): readonly SpecificationDimension[] {
  return [
    {
      id: ids('000000000101'),
      productId,
      name: '颜色',
      position: 0,
      values: [
        { id: ids('000000000201'), dimensionId: ids('000000000101'), label: '红色', position: 0 },
        { id: ids('000000000202'), dimensionId: ids('000000000101'), label: '蓝色', position: 1 },
      ],
    },
    {
      id: ids('000000000102'),
      productId,
      name: '容量',
      position: 1,
      values: [
        { id: ids('000000000203'), dimensionId: ids('000000000102'), label: '500ml', position: 0 },
        { id: ids('000000000204'), dimensionId: ids('000000000102'), label: '750ml', position: 1 },
      ],
    },
  ];
}

describe('generateSkuMatrix', () => {
  it('generates a deterministic 2x2 Cartesian matrix and preserves identity and SKU fields', () => {
    let sequence = 300;
    const first = generateSkuMatrix(dimensions(), [], () =>
      ids(String(sequence++).padStart(12, '0')),
    );
    expect(first.map(({ valueIds }) => valueIds)).toEqual([
      [ids('000000000201'), ids('000000000203')],
      [ids('000000000201'), ids('000000000204')],
      [ids('000000000202'), ids('000000000203')],
      [ids('000000000202'), ids('000000000204')],
    ]);

    const customized = first.map((sku, index) =>
      index === 1
        ? {
            ...sku,
            enabled: false,
            internalCode: 'SKU-RED-750',
            externalCode: 'EXT-1',
            barcode: '6901234567890',
            weightGrams: 812,
          }
        : sku,
    );
    const regenerated = generateSkuMatrix(dimensions(), customized, () => ids('000000000999'));
    expect(regenerated).toEqual(customized);
  });

  it('drops removed combinations, keeps surviving identities, and creates only new combinations', () => {
    let sequence = 400;
    const initial = generateSkuMatrix(dimensions(), [], () =>
      ids(String(sequence++).padStart(12, '0')),
    );
    const changed = dimensions().map((dimension, index) =>
      index === 1
        ? {
            ...dimension,
            values: [
              dimension.values[1]!,
              { id: ids('000000000205'), dimensionId: dimension.id, label: '1L', position: 2 },
            ],
          }
        : dimension,
    );
    const next = generateSkuMatrix(changed, initial, () =>
      ids(String(sequence++).padStart(12, '0')),
    );
    expect(next).toHaveLength(4);
    expect(next.filter(({ id }) => initial.some((old) => old.id === id))).toHaveLength(2);
  });

  it('always produces the Cartesian product size with unique deterministic signatures', () => {
    for (const sizes of [[1], [2, 3], [2, 2, 2]] as const) {
      let nextId = 500;
      const generatedDimensions: SpecificationDimension[] = sizes.map((size, dimensionIndex) => {
        const dimensionId = ids(String(nextId++).padStart(12, '0'));
        return {
          id: dimensionId,
          productId,
          name: `维度${dimensionIndex}`,
          position: dimensionIndex,
          values: Array.from({ length: size }, (_, valueIndex) => ({
            id: ids(String(nextId++).padStart(12, '0')),
            dimensionId,
            label: `值${dimensionIndex}-${valueIndex}`,
            position: valueIndex,
          })),
        };
      });
      const matrix = generateSkuMatrix(generatedDimensions, [], () =>
        ids(String(nextId++).padStart(12, '0')),
      );
      const expectedSize = sizes.reduce<number>((product, size) => product * size, 1);
      expect(matrix).toHaveLength(expectedSize);
      expect(new Set(matrix.map(({ signature }) => signature)).size).toBe(expectedSize);
      expect(matrix.every(({ valueIds }) => valueIds.length === sizes.length)).toBe(true);
    }
  });

  it('rejects empty dimensions, empty values, duplicate IDs, labels, and cross-product values', () => {
    expect(() => generateSkuMatrix([], [], () => ids('000000000900'))).toThrow();
    expect(() =>
      generateSkuMatrix([{ ...dimensions()[0]!, values: [] }], [], () => ids('000000000900')),
    ).toThrow();
    const duplicate = dimensions().map((dimension, index) =>
      index === 1
        ? {
            ...dimension,
            values: [{ ...dimension.values[0]!, id: dimensions()[0]!.values[0]!.id }],
          }
        : dimension,
    );
    expect(() => generateSkuMatrix(duplicate, [], () => ids('000000000900'))).toThrow();
    const wrongOwner = [{ ...dimensions()[0]!, productId: ids('000000000002') }];
    expect(() => generateSkuMatrix(wrongOwner, [], () => ids('000000000900'))).not.toThrow();
    expect(() =>
      generateSkuMatrix([...dimensions(), ...wrongOwner], [], () => ids('000000000900')),
    ).toThrow();
  });
});
