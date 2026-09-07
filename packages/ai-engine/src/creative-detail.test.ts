import { describe, expect, it } from 'vitest';

import { createUuidV7 } from '@eaw/domain';

import {
  CreativeItemOutputSchema,
  CreativePlanOutputSchema,
  DetailPageOutputSchema,
  reviewCreativeItem,
  reviewCreativePlan,
  reviewDetailPage,
  type CreativePlanOutput,
} from './creative-detail.js';

describe('creative and detail structured output', () => {
  it('requires exactly five creative items with bilingual positive and negative prompts', () => {
    const output = creativeOutput();

    expect(CreativePlanOutputSchema.parse(output).items).toHaveLength(5);
    expect(() =>
      CreativePlanOutputSchema.parse({ ...output, items: output.items.slice(0, 4) }),
    ).toThrow();
    expect(() =>
      CreativePlanOutputSchema.parse({
        ...output,
        items: output.items.map((item, index) => (index === 0 ? { ...item, promptEn: '' } : item)),
      }),
    ).toThrow();
  });

  it('marks cross-product and empty evidence for review', () => {
    const output = CreativePlanOutputSchema.parse(creativeOutput());
    const reviewed = reviewCreativePlan(output, {
      productId: output.productId,
      allowedEvidenceRefs: new Set<string>(),
      requestedItemIds: output.items.map(({ id }) => id),
    });

    expect(reviewed.issues).toContain('unsupported_evidence');
  });

  it('rejects a whole-plan response that replaces stable requested item ids', () => {
    const output = CreativePlanOutputSchema.parse(creativeOutput());

    expect(
      reviewCreativePlan(output, {
        productId: output.productId,
        allowedEvidenceRefs: evidenceSet(output),
        requestedItemIds: output.items.map(({ id }, index) => (index === 2 ? createUuidV7() : id)),
      }).issues,
    ).toContain('invalid_order');
  });

  it('requires one-item regeneration to preserve the requested item id', () => {
    const output = creativeOutput();
    const requestedId = output.items[0]!.id;
    const parsed = CreativeItemOutputSchema.parse({
      productId: output.productId,
      item: output.items[0],
    });

    expect(
      reviewCreativeItem(parsed, {
        productId: output.productId,
        requestedItemId: requestedId,
        allowedEvidenceRefs: evidenceSet(output),
      }).issues,
    ).toEqual([]);
    expect(
      reviewCreativeItem(parsed, {
        productId: output.productId,
        requestedItemId: createUuidV7(),
        allowedEvidenceRefs: evidenceSet(output),
      }).issues,
    ).toContain('item_identity_mismatch');
  });

  it('reviews duplicate detail order and declared review terms', () => {
    const output = creativeOutput();
    const detail = DetailPageOutputSchema.parse({
      productId: output.productId,
      sections: [
        detailSection(1, output),
        { ...detailSection(2, output), order: 1, reviewTerms: ['销量领先'] },
        detailSection(3, output),
      ],
    });

    expect(
      reviewDetailPage(detail, {
        productId: output.productId,
        allowedEvidenceRefs: evidenceSet(output),
        requestedSectionIds: detail.sections.map(({ id }) => id),
      }).issues,
    ).toEqual(expect.arrayContaining(['invalid_order', 'review_term']));
  });
});

function creativeOutput() {
  const productId = createUuidV7();
  return {
    productId,
    items: Array.from({ length: 5 }, (_, index) => ({
      id: createUuidV7(),
      order: index + 1,
      role: index === 0 ? ('hero' as const) : ('supporting' as const),
      headline: `第${index + 1}张图`,
      body: '说明商品利益与画面结构',
      promptZh: '真实棚拍商品图，纯色背景',
      promptEn: 'Realistic studio product photo on a solid background',
      negativePromptZh: '不要水印，不要虚构认证',
      negativePromptEn: 'No watermark, no fabricated certification',
      evidenceRefs: [{ kind: 'product_fact' as const, id: createUuidV7(), productId }],
      reviewTerms: [],
      locked: false,
    })),
  };
}

function evidenceSet(output: CreativePlanOutput) {
  return new Set(
    output.items.flatMap(({ evidenceRefs }) => evidenceRefs.map(({ kind, id }) => `${kind}:${id}`)),
  );
}

function detailSection(order: number, output: ReturnType<typeof creativeOutput>) {
  return {
    id: createUuidV7(),
    order,
    kind: order === 1 ? ('hero' as const) : ('benefit' as const),
    headline: `区块 ${order}`,
    body: '基于商品事实说明利益',
    evidenceRefs: output.items[order - 1]!.evidenceRefs,
    reviewTerms: [],
    locked: false,
  };
}
