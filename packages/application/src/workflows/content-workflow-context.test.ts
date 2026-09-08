import {
  createUuidV7,
  type CompetitorWithLatestSnapshot,
  type CreativePlanRevision,
  type DetailPageRevision,
  type ProductFact,
  type ProductPlatformProfile,
  type StrategyAsset,
  type TitleAssetRevision,
} from '@eaw/domain';
import { canonicalJson, sha256 } from '@eaw/prompt-engine';
import { describe, expect, it } from 'vitest';

import { createRepositoryContentWorkflowContext } from './content-workflow-context.js';

describe('repository content workflow context', () => {
  it('hashes only confirmed eligible non-sensitive facts and exact node dependencies', async () => {
    const fixture = contextFixture();
    const context = createRepositoryContentWorkflowContext(fixture.dependencies);
    const inspect = (nodeKey: string) =>
      context.inspect({ productId: fixture.productId, platformId: 'taobao', nodeKey });

    const initial = await inspect('competitor_analysis');
    fixture.facts[1] = { ...fixture.facts[1]!, value: { type: 'text', value: 'ignored change' } };
    fixture.facts[2] = { ...fixture.facts[2]!, value: { type: 'text', value: 'secret change' } };
    expect(await inspect('competitor_analysis')).toEqual(initial);

    fixture.facts[0] = {
      ...fixture.facts[0]!,
      id: createUuidV7(),
      revisionNo: 2,
      value: { type: 'text', value: 'confirmed revision 2' },
    };
    expect(await inspect('competitor_analysis')).not.toEqual(initial);

    const beforeCompetitor = await inspect('competitor_analysis');
    fixture.competitors[0] = competitor(fixture.productId);
    expect(await inspect('competitor_analysis')).not.toEqual(beforeCompetitor);

    const titleBefore = await inspect('titles');
    fixture.profile = { ...fixture.profile, updatedAt: new Date('2026-09-08T02:00:00.000Z') };
    expect(await inspect('titles')).not.toEqual(titleBefore);

    const creativeBefore = await inspect('creative');
    fixture.title = { ...fixture.title, id: createUuidV7(), revisionNo: 2 };
    expect(await inspect('creative')).not.toEqual(creativeBefore);

    const detailBefore = await inspect('detail_page');
    fixture.promptHashes['detail-page'] = 'f'.repeat(64);
    expect(await inspect('detail_page')).not.toEqual(detailBefore);

    const titleRulesBefore = await inspect('titles');
    fixture.ruleChecksum = 'e'.repeat(64);
    expect(await inspect('titles')).not.toEqual(titleRulesBefore);
  });

  it('reuses only an output owned by the same product/platform with the exact workflow hash', async () => {
    const fixture = contextFixture();
    const context = createRepositoryContentWorkflowContext(fixture.dependencies);
    const input = { productId: fixture.productId, platformId: 'taobao', nodeKey: 'creative' } as const;
    const first = await context.inspect(input);
    const workflowHash = sha256(canonicalJson(first.dependencies));
    fixture.creative = {
      ...fixture.creative,
      dependencyHashes: { workflow: workflowHash },
    };

    await expect(context.inspect(input)).resolves.toMatchObject({
      reusableOutput: {
        assetType: 'creative_plan',
        assetId: fixture.creative.id,
        revisionNo: fixture.creative.revisionNo,
      },
    });

    fixture.creative = { ...fixture.creative, platformId: 'pinduoduo' };
    await expect(context.inspect(input)).resolves.not.toHaveProperty('reusableOutput');
  });
});

function contextFixture() {
  const productId = createUuidV7();
  const facts: ProductFact[] = [
    fact(productId, { verification: 'confirmed', policyEligible: true, sensitive: false }),
    fact(productId, { verification: 'unverified', policyEligible: true, sensitive: false }),
    fact(productId, { verification: 'confirmed', policyEligible: true, sensitive: true }),
  ];
  const competitors: CompetitorWithLatestSnapshot[] = [competitor(productId)];
  const strategies = {
    competitor_analysis: strategy(productId, 'competitor_analysis'),
    market_insight: strategy(productId, 'market_insight'),
    selling_point_set: strategy(productId, 'selling_point_set'),
  };
  const promptHashes: Record<string, string> = {
    'competitor-analysis': '1'.repeat(64),
    'market-insight': '2'.repeat(64),
    'selling-point-set': '3'.repeat(64),
    'title-generation': '4'.repeat(64),
    'creative-plan': '5'.repeat(64),
    'creative-item': '6'.repeat(64),
    'detail-page': '7'.repeat(64),
  };
  const fixture = {
    productId,
    facts,
    competitors,
    strategies,
    promptHashes,
    profile: profile(productId),
    title: title(productId),
    creative: creative(productId),
    detail: detail(productId),
    ruleChecksum: '8'.repeat(64),
  };
  return Object.assign(fixture, {
    dependencies: {
      facts: { listCurrent: async () => fixture.facts },
      competitors: { listByProduct: async () => fixture.competitors },
      strategies: { latest: async (_owner: string, kind: keyof typeof strategies) => fixture.strategies[kind] },
      titles: { latest: async () => fixture.title },
      creativePlans: { latest: async () => fixture.creative },
      detailPages: { latest: async () => fixture.detail },
      platformProfiles: { find: async () => fixture.profile },
      prompts: {
        findActive: async (templateId: string) => {
          const templateHash = fixture.promptHashes[templateId];
          return templateHash ? { template: { templateId } as never, templateHash } : undefined;
        },
      },
      rules: {
        findActive: async () =>
          ({
            id: 'rules-taobao-cn',
            pack: {
              manifest: { version: '1.0.0', checksum: fixture.ruleChecksum },
            },
          }) as never,
        listOverrides: async () => [{ id: 'override-1', revisionNo: 2 }] as never,
      },
    },
  });
}

function fact(
  productId: ReturnType<typeof createUuidV7>,
  values: Pick<ProductFact, 'verification' | 'policyEligible' | 'sensitive'>,
): ProductFact {
  const id = createUuidV7();
  const now = new Date('2026-09-08T00:00:00.000Z');
  return {
    id,
    lineageId: id,
    productId,
    key: `fact.${id}`,
    label: 'Fact',
    value: { type: 'text', value: 'value' },
    unit: null,
    sourceType: 'manual',
    sourceRef: null,
    ...values,
    revisionNo: 1,
    supersedesFactId: null,
    createdAt: now,
    updatedAt: now,
    confirmedAt: values.verification === 'confirmed' ? now : null,
    confirmation: values.verification === 'confirmed'
      ? { actorType: 'user', actorRef: 'tester', evidenceRef: 'test' }
      : null,
    deletedAt: null,
  };
}

function competitor(productId: ReturnType<typeof createUuidV7>): CompetitorWithLatestSnapshot {
  const competitorId = createUuidV7();
  const now = new Date();
  return {
    competitor: {
      id: competitorId,
      productId,
      name: 'Competitor',
      sourceUrl: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
    latestSnapshot: {
      id: createUuidV7(),
      competitorId,
      productId,
      importBatchId: createUuidV7(),
      source: 'manual',
      sourceUrl: null,
      displayedPriceText: '99',
      normalizedPriceMinorUnits: '9900',
      displayedSalesText: null,
      normalizedSales: null,
      displayedReviewText: null,
      normalizedReviews: null,
      skuTexts: [],
      sellingPoints: ['fast'],
      imageReferences: [],
      rawPayload: {},
      capturedAt: now,
      importedAt: now,
    },
  };
}

function strategy(productId: ReturnType<typeof createUuidV7>, kind: StrategyAsset['kind']): StrategyAsset {
  return {
    id: createUuidV7(), productId, kind, revisionNo: 1, generationId: createUuidV7(),
    status: 'verified', payload: { productId } as StrategyAsset['payload'],
    supersedesAssetId: null, createdAt: new Date(),
  };
}

function profile(productId: ReturnType<typeof createUuidV7>): ProductPlatformProfile {
  return {
    id: createUuidV7(), productId, platformId: 'taobao', categoryCode: 'c1', categoryName: 'Category',
    externalProductId: null, title: 'Title', description: null, metadata: {}, status: 'ready',
    createdAt: new Date('2026-09-08T00:00:00.000Z'), updatedAt: new Date('2026-09-08T01:00:00.000Z'),
  };
}

function title(productId: ReturnType<typeof createUuidV7>): TitleAssetRevision {
  return {
    id: createUuidV7(), lineageId: createUuidV7(), productId, platformId: 'taobao', revisionNo: 1,
    origin: 'generated', status: 'verified', locked: false, titles: [], validationIssues: [],
    dependencyHashes: {}, generationId: createUuidV7(), supersedesRevisionId: null, createdAt: new Date(),
  };
}

function creative(productId: ReturnType<typeof createUuidV7>): CreativePlanRevision {
  return {
    id: createUuidV7(), lineageId: createUuidV7(), productId, platformId: 'taobao', revisionNo: 1,
    origin: 'generated', status: 'verified', items: [], dependencyHashes: {}, validationIssues: [],
    generationId: createUuidV7(), supersedesRevisionId: null, createdAt: new Date(),
  };
}

function detail(productId: ReturnType<typeof createUuidV7>): DetailPageRevision {
  return {
    id: createUuidV7(), lineageId: createUuidV7(), productId, platformId: 'taobao', revisionNo: 1,
    origin: 'generated', status: 'verified', sections: [], dependencyHashes: {}, validationIssues: [],
    generationId: createUuidV7(), supersedesRevisionId: null, createdAt: new Date(),
  };
}
