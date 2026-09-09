import {
  createUuidV7,
  type Competitor,
  type CompetitorSnapshot,
  type CreativePlanRevision,
  type DetailPageRevision,
  type PricingResultRecord,
  type PricingScenario,
  type PromotionResultRecord,
  type PromotionScenario,
  type StrategyAsset,
  type TitleAssetRevision,
  type UuidV7,
} from '@eaw/domain';
import type { WorkflowRun } from '@eaw/workflow-engine';
import { describe, expect, it } from 'vitest';

import { createRepositoryOperationPlanSourceResolver } from '../index.js';

describe('repository operation plan source resolver', () => {
  it('resolves exact workflow, evidence, pricing, promotion, and rule references', async () => {
    const fixture = setup();

    const resolved = await fixture.resolver.resolve(fixture.productId, fixture.input);

    expect(resolved).toEqual({
      platformId: 'pinduoduo',
      sources: {
        workflowRunId: fixture.run.id,
        workflowRunRevision: fixture.run.revision,
        nodes: fixture.run.nodes.map(({ key, output, dependencyHash }) => ({
          nodeKey: key,
          assetType: output!.assetType,
          assetId: output!.assetId,
          revisionNo: output!.revisionNo,
          dependencyHash,
        })),
        competitorSnapshotIds: [fixture.snapshot.id],
        pricing: {
          resultId: fixture.pricingResult.id,
          scenarioId: fixture.pricingScenario.id,
          skuId: fixture.skuId,
          costProfileId: fixture.costProfileId,
          costProfileRevisionNo: 1,
        },
        promotion: {
          scenarioId: fixture.promotionScenario.id,
          resultIds: [fixture.promotionResult.id],
          ruleSnapshotHash: fixture.promotionScenario.ruleSnapshotHash,
        },
      },
      blockers: [],
    });
  });

  it('rejects a workflow or exact source owned by another product', async () => {
    const fixture = setup();
    fixture.run.productId = createUuidV7();

    await expect(fixture.resolver.resolve(fixture.productId, fixture.input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('reports every deterministic lock blocker without advancing a source', async () => {
    const fixture = setup();
    fixture.currentHashes.competitor_analysis = 'b'.repeat(64);
    fixture.strategyAssets[1] = { ...fixture.strategyAssets[1]!, status: 'needs_review' };
    fixture.title.locked = false;
    fixture.costRevision = 2;
    fixture.ruleHash = 'c'.repeat(64);

    const resolved = await fixture.resolver.resolve(fixture.productId, fixture.input);

    expect(resolved.blockers.map(({ code }) => code)).toEqual([
      'SOURCE_STALE',
      'SOURCE_NEEDS_REVIEW',
      'CONTENT_UNLOCKED',
      'FINANCIAL_INPUT_MISMATCH',
      'RULE_SNAPSHOT_MISMATCH',
    ]);
    expect(resolved.sources.nodes[1]!.assetId).toBe(fixture.run.nodes[1]!.output!.assetId);
    expect(resolved.sources.pricing.costProfileRevisionNo).toBe(1);
  });

  it('revalidates stored identities and marks replaced exact revisions stale', async () => {
    const fixture = setup();
    const resolved = await fixture.resolver.resolve(fixture.productId, fixture.input);
    const plan = {
      id: createUuidV7(),
      lineageId: createUuidV7(),
      productId: fixture.productId,
      platformId: resolved.platformId,
      revisionNo: 1,
      status: 'draft' as const,
      lockedAt: null,
      sources: resolved.sources,
      sourceHash: 'd'.repeat(64),
      blockers: resolved.blockers,
      supersedesRevisionId: null,
      createdAt: new Date(),
    };
    plan.lineageId = plan.id;
    fixture.strategyAssets.unshift({
      ...fixture.strategyAssets[0]!,
      id: createUuidV7(),
      revisionNo: 2,
    });

    await expect(fixture.resolver.revalidate(plan)).resolves.toContainEqual({
      code: 'SOURCE_STALE',
      source: 'competitor_analysis',
    });
  });
});

function setup() {
  const productId = createUuidV7();
  const skuId = createUuidV7();
  const costProfileId = createUuidV7();
  const snapshot = competitorSnapshot(productId);
  const strategyAssets = strategyRevisions(productId, snapshot.id);
  const title = titleRevision(productId);
  const creative = creativeRevision(productId);
  const detail = detailRevision(productId);
  const pricingScenario: PricingScenario = {
    id: createUuidV7(),
    skuId,
    costProfileId,
    costProfileRevisionNo: 1,
    name: '主推价格',
    goalSnapshot: {},
    createdAt: new Date(),
  };
  const pricingResult: PricingResultRecord = {
    id: createUuidV7(),
    scenarioId: pricingScenario.id,
    skuId,
    status: 'verified',
    inputSnapshot: {},
    resultSnapshot: {},
    engineVersion: '0.1.0',
    createdAt: new Date(),
  };
  const promotionScenario: PromotionScenario = {
    id: createUuidV7(),
    productId,
    name: '大促',
    platformId: 'pinduoduo',
    region: 'CN',
    ruleSnapshotId: createUuidV7(),
    ruleSnapshotHash: 'a'.repeat(64),
    configurationSnapshot: {},
    createdAt: new Date(),
  };
  const promotionResult: PromotionResultRecord = {
    id: createUuidV7(),
    scenarioId: promotionScenario.id,
    skuId,
    costProfileId,
    costProfileRevisionNo: 1,
    status: 'verified',
    inputSnapshot: {},
    resultSnapshot: {},
    engineVersion: '0.1.0',
    createdAt: new Date(),
  };
  const run = workflow(productId, strategyAssets, title, creative, detail);
  const currentHashes = Object.fromEntries(run.nodes.map(({ key }) => [key, 'a'.repeat(64)]));
  const competitor: Competitor = {
    id: snapshot.competitorId,
    productId,
    name: '竞品',
    sourceUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
  const state = {
    costRevision: 1,
    ruleHash: promotionScenario.ruleSnapshotHash,
  };
  const resolver = createRepositoryOperationPlanSourceResolver({
    workflows: { findById: async (id) => (id === run.id ? run : undefined) },
    inspectors: Object.fromEntries(
      run.nodes.map(({ key, taskType }) => [
        taskType,
        { inspect: async () => ({ dependencyHash: currentHashes[key]! }) },
      ]),
    ),
    competitors: {
      listByProduct: async () => [{ competitor, latestSnapshot: snapshot }],
      listSnapshots: async () => [snapshot],
    },
    strategies: {
      list: async (_owner, kind) => strategyAssets.filter((asset) => asset.kind === kind),
    },
    titles: { list: async () => [title] },
    creativePlans: { list: async () => [creative] },
    detailPages: { list: async () => [detail] },
    skus: {
      load: async () => ({ dimensions: [], skus: [{ id: skuId, productId, enabled: true }] }),
    },
    pricing: {
      listScenarios: async (id) => (id === skuId ? [pricingScenario] : []),
      listResults: async (id) => (id === pricingScenario.id ? [pricingResult] : []),
    },
    costs: {
      findBySkuId: async () => ({ id: costProfileId, revisionNo: state.costRevision }),
    },
    promotions: {
      findScenario: async (id) => (id === promotionScenario.id ? promotionScenario : undefined),
      listResults: async (id) => (id === promotionScenario.id ? [promotionResult] : []),
    },
    rules: {
      getSnapshot: async () => ({ snapshot: { hash: state.ruleHash } }),
    },
  });
  return {
    productId,
    skuId,
    costProfileId,
    snapshot,
    strategyAssets,
    title,
    pricingScenario,
    pricingResult,
    promotionScenario,
    promotionResult,
    run,
    currentHashes,
    input: {
      workflowRunId: run.id,
      pricingRecordId: pricingResult.id,
      promotionScenarioId: promotionScenario.id,
      promotionResultIds: [promotionResult.id],
    },
    resolver,
    get costRevision() {
      return state.costRevision;
    },
    set costRevision(value: number) {
      state.costRevision = value;
    },
    get ruleHash() {
      return state.ruleHash;
    },
    set ruleHash(value: string) {
      state.ruleHash = value;
    },
  };
}

function workflow(
  productId: UuidV7,
  strategies: readonly StrategyAsset[],
  title: TitleAssetRevision,
  creative: CreativePlanRevision,
  detail: DetailPageRevision,
): WorkflowRun & { productId: UuidV7 } {
  const assets = [...strategies, title, creative, detail];
  const keys = [
    'competitor_analysis',
    'market_insight',
    'selling_points',
    'titles',
    'creative',
    'detail_page',
  ];
  const types = [
    'competitor_analysis',
    'market_insight',
    'selling_point_set',
    'title_asset',
    'creative_plan',
    'detail_page',
  ];
  return {
    id: createUuidV7(),
    productId,
    platformId: 'pinduoduo',
    definition: {
      definitionId: 'content-workflow',
      version: '1',
      nodes: keys.map((key, index) => ({ key, taskType: key, dependsOn: [], order: index + 1 })),
    },
    status: 'completed',
    revision: 9,
    cancellationRequested: false,
    nodes: keys.map((key, index) => ({
      key,
      taskType: key,
      status: 'locked',
      dependencyHash: 'a'.repeat(64),
      output: { assetType: types[index]!, assetId: assets[index]!.id, revisionNo: 1 },
      error: null,
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function strategyRevisions(productId: UuidV7, snapshotId: UuidV7): StrategyAsset[] {
  return ['competitor_analysis', 'market_insight', 'selling_point_set'].map((kind, index) => ({
    id: createUuidV7(),
    productId,
    kind: kind as StrategyAsset['kind'],
    revisionNo: 1,
    generationId: createUuidV7(),
    status: 'verified',
    payload: {
      productId,
      conclusions:
        index === 0
          ? [
              {
                summary: '结论',
                evidenceRefs: [{ kind: 'competitor_snapshot', id: snapshotId, productId }],
              },
            ]
          : [],
      limitations: [],
    },
    supersedesAssetId: null,
    createdAt: new Date(),
  }));
}

function titleRevision(productId: UuidV7): TitleAssetRevision & { locked: boolean } {
  return {
    id: createUuidV7(),
    lineageId: createUuidV7(),
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    origin: 'locked',
    status: 'verified',
    locked: true,
    titles: [],
    validationIssues: [],
    dependencyHashes: { workflow: 'a'.repeat(64) },
    generationId: null,
    supersedesRevisionId: null,
    createdAt: new Date(),
  };
}

function creativeRevision(productId: UuidV7): CreativePlanRevision {
  return {
    id: createUuidV7(),
    lineageId: createUuidV7(),
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    origin: 'locked_item',
    status: 'verified',
    items: [{ locked: true } as CreativePlanRevision['items'][number]],
    dependencyHashes: { workflow: 'a'.repeat(64) },
    validationIssues: [],
    generationId: null,
    supersedesRevisionId: null,
    createdAt: new Date(),
  };
}

function detailRevision(productId: UuidV7): DetailPageRevision {
  return {
    id: createUuidV7(),
    lineageId: createUuidV7(),
    productId,
    platformId: 'pinduoduo',
    revisionNo: 1,
    origin: 'locked_section',
    status: 'verified',
    sections: [{ locked: true } as DetailPageRevision['sections'][number]],
    dependencyHashes: { workflow: 'a'.repeat(64) },
    validationIssues: [],
    generationId: null,
    supersedesRevisionId: null,
    createdAt: new Date(),
  };
}

function competitorSnapshot(productId: UuidV7): CompetitorSnapshot {
  return {
    id: createUuidV7(),
    competitorId: createUuidV7(),
    productId,
    importBatchId: createUuidV7(),
    source: 'manual',
    sourceUrl: null,
    displayedPriceText: null,
    normalizedPriceMinorUnits: null,
    displayedSalesText: null,
    normalizedSales: null,
    displayedReviewText: null,
    normalizedReviews: null,
    skuTexts: [],
    sellingPoints: [],
    imageReferences: [],
    rawPayload: {},
    capturedAt: new Date(),
    importedAt: new Date(),
  };
}
