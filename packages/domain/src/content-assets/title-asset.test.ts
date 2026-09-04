import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '../ids.js';
import { createTitleAssetRevision } from './title-asset.js';

describe('title asset revisions', () => {
  it('preserves a locked revision as an immutable value', () => {
    const productId = createUuidV7();
    const revision = createTitleAssetRevision({
      id: createUuidV7(),
      lineageId: createUuidV7(),
      productId,
      platformId: 'pinduoduo',
      revisionNo: 2,
      origin: 'locked',
      status: 'verified',
      locked: true,
      titles: [
        {
          variant: 'recommended',
          text: '304不锈钢保温杯',
          keywords: ['保温杯'],
          claims: [],
          reviewTerms: [],
        },
      ],
      validationIssues: [],
      dependencyHashes: { facts: 'a'.repeat(64) },
      generationId: null,
      supersedesRevisionId: createUuidV7(),
      createdAt: new Date(),
    });
    expect(Object.isFrozen(revision.titles)).toBe(true);
    expect(revision.locked).toBe(true);
  });
});
