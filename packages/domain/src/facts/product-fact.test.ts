import { describe, expect, it } from 'vitest';

import { parseUuidV7 } from '../ids.js';
import { confirmProductFact, createProductFact } from './product-fact.js';

const base = {
  id: parseUuidV7('0198f0a0-0000-7000-8000-000000000101'),
  productId: parseUuidV7('0198f0a0-0000-7000-8000-000000000001'),
  key: 'material',
  label: '材质',
  value: { type: 'text', value: '304不锈钢' } as const,
  sourceType: 'ai_inferred' as const,
  verification: 'inferred' as const,
  now: new Date('2026-08-19T08:00:00.000Z'),
};

describe('ProductFact confirmation', () => {
  it('requires explicit user provenance even for an AI-inferred fact', () => {
    const inferred = createProductFact(base);
    expect(() =>
      confirmProductFact(
        inferred,
        { actorType: 'user', actorRef: '', evidenceRef: '' },
        new Date('2026-08-19T09:00:00.000Z'),
      ),
    ).toThrow(expect.objectContaining({ code: 'FACT_VERIFICATION_REQUIRED' }));

    const confirmed = confirmProductFact(
      inferred,
      { actorType: 'user', actorRef: 'local-user', evidenceRef: 'supplier:certificate-1' },
      new Date('2026-08-19T09:00:00.000Z'),
    );
    expect(confirmed).toMatchObject({
      verification: 'confirmed',
      confirmedAt: new Date('2026-08-19T09:00:00.000Z'),
      confirmation: { actorType: 'user', actorRef: 'local-user' },
    });
  });

  it('keeps a confirmed record immutable and refuses to confirm missing values', () => {
    const inferred = createProductFact(base);
    const confirmed = confirmProductFact(
      inferred,
      { actorType: 'user', actorRef: 'local-user', evidenceRef: 'inspection:1' },
      new Date('2026-08-19T09:00:00.000Z'),
    );
    expect(() =>
      confirmProductFact(
        confirmed,
        { actorType: 'user', actorRef: 'local-user', evidenceRef: 'inspection:2' },
        new Date('2026-08-19T10:00:00.000Z'),
      ),
    ).toThrow(expect.objectContaining({ code: 'CONFLICT' }));

    const missing = createProductFact({
      ...base,
      id: parseUuidV7('0198f0a0-0000-7000-8000-000000000102'),
      key: 'food_grade',
      value: null,
      verification: 'missing',
    });
    expect(() =>
      confirmProductFact(
        missing,
        { actorType: 'user', actorRef: 'local-user', evidenceRef: 'inspection:1' },
        new Date('2026-08-19T09:00:00.000Z'),
      ),
    ).toThrow(expect.objectContaining({ code: 'FACT_VERIFICATION_REQUIRED' }));
  });
});
