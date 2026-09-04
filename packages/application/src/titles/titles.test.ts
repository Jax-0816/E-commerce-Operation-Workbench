import { describe, expect, it } from 'vitest';

import { createTitleAssetRevision, createUuidV7 } from '@eaw/domain';

import { evaluateTitleStaleness } from './index.js';

describe('title asset staleness', () => {
  it('explains upstream changes without modifying a locked revision', () => {
    const productId = createUuidV7();
    const revision = createTitleAssetRevision({
      id: createUuidV7(),
      lineageId: createUuidV7(),
      productId,
      platformId: 'pinduoduo',
      revisionNo: 3,
      origin: 'locked',
      status: 'verified',
      locked: true,
      titles: [
        { variant: 'recommended', text: '保温杯', keywords: [], claims: [], reviewTerms: [] },
      ],
      validationIssues: [],
      dependencyHashes: { facts: 'a'.repeat(64), platform_rules: 'b'.repeat(64) },
      generationId: null,
      supersedesRevisionId: createUuidV7(),
      createdAt: new Date(),
    });
    const view = evaluateTitleStaleness(revision, {
      facts: 'c'.repeat(64),
      platform_rules: 'b'.repeat(64),
    });
    expect(view).toMatchObject({ stale: true, staleReasons: ['facts_changed'] });
    expect(view.revision.locked).toBe(true);
  });
});
