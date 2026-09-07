import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '../ids.js';
import { evaluateDependencyStaleness } from './creative-plan.js';
import {
  createDetailPageRevision,
  lockDetailSection,
  reorderDetailSections,
  type DetailPageRevision,
} from './detail-page.js';

describe('detail page revisions', () => {
  it('reorders complete section ids without changing section payloads', () => {
    const revision = createDetailPageRevision(validRevision());
    const [first, second] = revision.sections;

    const reordered = reorderDetailSections(revision.sections, [second!.id, first!.id]);

    expect(reordered.map(({ id }) => id)).toEqual([second!.id, first!.id]);
    expect(reordered[0]?.headline).toBe(second!.headline);
    expect(() => reorderDetailSections(revision.sections, [first!.id])).toThrow(/complete/i);
  });

  it('reports exact changed dependencies without changing the stored revision', () => {
    const revision = createDetailPageRevision(validRevision());

    const stale = evaluateDependencyStaleness(revision.dependencyHashes, {
      facts: 'a'.repeat(64),
      titles: 'c'.repeat(64),
    });

    expect(stale).toEqual({ stale: true, reasons: ['titles_changed'] });
    expect(revision.dependencyHashes.titles).toBe('b'.repeat(64));
  });

  it('locks only the requested detail section', () => {
    const revision = createDetailPageRevision(validRevision());
    const locked = lockDetailSection(revision.sections, revision.sections[1]!.id);

    expect(locked.map(({ locked }) => locked)).toEqual([false, true]);
    expect(revision.sections[1]?.locked).toBe(false);
  });
});

function validRevision(): DetailPageRevision {
  const productId = createUuidV7();
  return {
    id: createUuidV7(),
    lineageId: createUuidV7(),
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    origin: 'generated',
    status: 'verified',
    sections: [
      {
        id: createUuidV7(),
        order: 1,
        kind: 'hero',
        headline: '首屏价值主张',
        body: '展示商品和核心利益点',
        evidenceRefs: [{ kind: 'product_fact', id: createUuidV7(), productId }],
        reviewTerms: [],
        locked: false,
      },
      {
        id: createUuidV7(),
        order: 2,
        kind: 'benefit',
        headline: '核心利益说明',
        body: '用事实解释商品利益',
        evidenceRefs: [{ kind: 'product_fact', id: createUuidV7(), productId }],
        reviewTerms: [],
        locked: false,
      },
    ],
    dependencyHashes: { facts: 'a'.repeat(64), titles: 'b'.repeat(64) },
    validationIssues: [],
    generationId: createUuidV7(),
    supersedesRevisionId: null,
    createdAt: new Date('2026-09-07T00:00:00.000Z'),
  };
}
