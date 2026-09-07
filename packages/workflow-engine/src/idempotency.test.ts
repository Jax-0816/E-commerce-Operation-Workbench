import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '@eaw/domain';

import { createIdempotencyKey } from './idempotency.js';

describe('workflow idempotency identity', () => {
  it('binds the run, node, and dependency hash without ambiguity', () => {
    const runId = createUuidV7(new Date('2026-09-07T00:00:00.000Z'));
    const hash = 'a'.repeat(64);
    const key = createIdempotencyKey(runId, 'creative', hash);

    expect(key).toBe(`${runId}:creative:${hash}`);
    expect(createIdempotencyKey(runId, 'detail_page', hash)).not.toBe(key);
    expect(createIdempotencyKey(createUuidV7(), 'creative', hash)).not.toBe(key);
    expect(createIdempotencyKey(runId, 'creative', 'b'.repeat(64))).not.toBe(key);
  });

  it('rejects invalid node keys and dependency hashes', () => {
    const runId = createUuidV7();
    expect(() => createIdempotencyKey(runId, 'Bad Key', 'a'.repeat(64))).toThrow(/invalid/u);
    expect(() => createIdempotencyKey(runId, 'creative', 'not-a-hash')).toThrow(/invalid/u);
  });
});
