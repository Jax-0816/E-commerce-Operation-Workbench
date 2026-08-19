import { describe, expect, it } from 'vitest';

import { checkRuntimeVersions } from './check-versions.mjs';

describe('checkRuntimeVersions', () => {
  it('accepts the supported Node and pnpm releases', () => {
    const result = checkRuntimeVersions({ node: '24.19.0', pnpm: '11.22.0' });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects Node releases outside the supported engine range', () => {
    const result = checkRuntimeVersions({ node: '26.0.0', pnpm: '11.22.0' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Node.js 26.0.0 does not satisfy >=24.19.0 <25.');
  });

  it('rejects pnpm releases that do not match the pinned package manager', () => {
    const result = checkRuntimeVersions({ node: '24.19.0', pnpm: '10.0.0' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('pnpm 10.0.0 does not match 11.22.0.');
  });
});
