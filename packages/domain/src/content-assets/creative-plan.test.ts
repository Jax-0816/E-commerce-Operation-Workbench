import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '../ids.js';
import {
  createCreativePlanRevision,
  lockCreativeItem,
  reorderCreativeItems,
  replaceCreativeItem,
  type CreativeItem,
  type CreativePlanRevision,
} from './creative-plan.js';

describe('creative plan revisions', () => {
  it('rejects a sequence that is not exactly five uniquely ordered items', () => {
    const input = validRevision();

    expect(() => createCreativePlanRevision({ ...input, items: input.items.slice(0, 4) })).toThrow(
      /invalid/i,
    );
    expect(() =>
      createCreativePlanRevision({
        ...input,
        items: input.items.map((item) => ({ ...item, order: 1 })),
      }),
    ).toThrow(/invalid/i);
  });

  it('preserves locked siblings when replacing one unlocked item', () => {
    const revision = createCreativePlanRevision(validRevision());
    const locked = revision.items[0]!;
    const target = revision.items[1]!;
    const replacement = { ...target, headline: '新主图文案' };

    const items = replaceCreativeItem(revision.items, target.id, replacement);

    expect(items[0]).toEqual(locked);
    expect(items[1]?.headline).toBe('新主图文案');
    expect(() => replaceCreativeItem(revision.items, locked.id, { ...locked })).toThrow(/locked/i);
  });

  it('locks one item and reorders every stable id exactly once', () => {
    const revision = createCreativePlanRevision(validRevision());
    const locked = lockCreativeItem(revision.items, revision.items[1]!.id);
    const reversedIds = [...locked].reverse().map(({ id }) => id);

    expect(locked[1]?.locked).toBe(true);
    expect(reorderCreativeItems(locked, reversedIds).map(({ id }) => id)).toEqual(reversedIds);
    expect(() => reorderCreativeItems(locked, reversedIds.slice(1))).toThrow(/complete/i);
  });
});

function validRevision(): CreativePlanRevision {
  const productId = createUuidV7();
  const lineageId = createUuidV7();
  const generationId = createUuidV7();
  return {
    id: createUuidV7(),
    lineageId,
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    origin: 'generated',
    status: 'verified',
    items: Array.from({ length: 5 }, (_, index) => item(index + 1, productId, index === 0)),
    dependencyHashes: { facts: 'a'.repeat(64), titles: 'b'.repeat(64) },
    validationIssues: [],
    generationId,
    supersedesRevisionId: null,
    createdAt: new Date('2026-09-07T00:00:00.000Z'),
  };
}

function item(
  order: number,
  productId: CreativePlanRevision['productId'],
  locked: boolean,
): CreativeItem {
  return {
    id: createUuidV7(),
    order,
    role: order === 1 ? 'hero' : 'supporting',
    headline: `第${order}张图`,
    body: '清晰说明画面与文案目标',
    promptZh: '棚拍商品图，纯色背景，真实材质',
    promptEn: 'Studio product photo, solid background, realistic material',
    negativePromptZh: '不要水印，不要虚构认证',
    negativePromptEn: 'No watermark, no fabricated certification',
    evidenceRefs: [{ kind: 'product_fact', id: createUuidV7(), productId }],
    reviewTerms: [],
    locked,
  };
}
