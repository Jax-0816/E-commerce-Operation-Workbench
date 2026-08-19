import { describe, expect, it } from 'vitest';

import { createUuidV7, parseUuidV7, type UuidV7 } from './ids.js';

describe('UUID v7 identifiers', () => {
  it('creates a canonical RFC-compatible UUID v7 string', () => {
    const identifier: UuidV7 = createUuidV7(new Date('2026-08-19T00:00:00.000Z'));

    expect(identifier).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(parseUuidV7(identifier)).toBe(identifier);
  });

  it('orders UUID v7 values lexically when their timestamps increase', () => {
    const identifiers = [
      createUuidV7(new Date('2026-08-19T00:00:00.001Z')),
      createUuidV7(new Date('2026-08-19T00:00:00.002Z')),
      createUuidV7(new Date('2026-08-19T00:00:00.003Z')),
    ];

    expect([...identifiers].sort()).toEqual(identifiers);
  });

  it.each([
    'not-a-uuid',
    '019884e7-2000-4000-8000-000000000000',
    '019884e7-2000-7000-7000-000000000000',
    '019884E7-2000-7000-8000-000000000000',
  ])('rejects a value that is not a canonical UUID v7: %s', (value) => {
    expect(() => parseUuidV7(value)).toThrow(TypeError);
  });
});
