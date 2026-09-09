import {
  DomainError,
  OPERATION_PLAN_ASSET_TYPES,
  OPERATION_PLAN_NODE_KEYS,
  parseUuidV7,
  type CompetitorRepository,
  type CreativePlanRepository,
  type DetailPageRepository,
  type OperationPlanBlocker,
  type OperationPlanNodeKey,
  type OperationPlanRevision,
  type PricingRepository,
  type PricingResultRecord,
  type PricingScenario,
  type PromotionResultRecord,
  type PromotionRepository,
  type StrategyAsset,
  type StrategyRepository,
  type TitleAssetRepository,
  type UuidV7,
} from '@eaw/domain';
import type { WorkflowRepository, WorkflowRun } from '@eaw/workflow-engine';

import type { WorkflowPreflightInspector } from '../workflows/index.js';
import type {
  CreateOperationPlanInput,
  OperationPlanSourceResolver,
  ResolvedOperationPlanSources,
} from './index.js';

type ReadCompetitors = Pick<CompetitorRepository, 'listByProduct' | 'listSnapshots'>;
type ReadStrategies = Pick<StrategyRepository, 'list'>;
type ReadTitles = Pick<TitleAssetRepository, 'list'>;
type ReadCreativePlans = Pick<CreativePlanRepository, 'list'>;
type ReadDetailPages = Pick<DetailPageRepository, 'list'>;
type ReadPricing = Pick<PricingRepository, 'listScenarios' | 'listResults'>;
type ReadPromotions = Pick<PromotionRepository, 'findScenario' | 'listResults'>;

interface SkuReadPort {
  load(productId: UuidV7): Promise<{
    readonly skus: readonly {
      readonly id: UuidV7;
      readonly productId: UuidV7;
      readonly enabled: boolean;
    }[];
  }>;
}

interface CostReadPort {
  findBySkuId(
    skuId: UuidV7,
  ): Promise<{ readonly id: UuidV7; readonly revisionNo: number } | undefined>;
}

interface RuleSnapshotReadPort {
  getSnapshot(id: string): Promise<{ readonly snapshot: { readonly hash: string } }>;
}

interface ResolvedNode {
  readonly source: ResolvedOperationPlanSources['sources']['nodes'][number];
  readonly asset: StrategyAsset | ContentAsset;
  readonly blockers: readonly OperationPlanBlocker[];
}

type ContentAsset =
  | Awaited<ReturnType<ReadTitles['list']>>[number]
  | Awaited<ReturnType<ReadCreativePlans['list']>>[number]
  | Awaited<ReturnType<ReadDetailPages['list']>>[number];

const STRATEGY_KIND_BY_NODE = {
  competitor_analysis: 'competitor_analysis',
  market_insight: 'market_insight',
  selling_points: 'selling_point_set',
} as const;

const BLOCKER_ORDER = [
  'SOURCE_STALE',
  'SOURCE_NEEDS_REVIEW',
  'CONTENT_UNLOCKED',
  'FINANCIAL_INPUT_MISMATCH',
  'RULE_SNAPSHOT_MISMATCH',
] as const;

export function createRepositoryOperationPlanSourceResolver(dependencies: {
  readonly workflows: Pick<WorkflowRepository, 'findById'>;
  readonly inspectors: Readonly<Record<string, WorkflowPreflightInspector>>;
  readonly competitors: ReadCompetitors;
  readonly strategies: ReadStrategies;
  readonly titles: ReadTitles;
  readonly creativePlans: ReadCreativePlans;
  readonly detailPages: ReadDetailPages;
  readonly skus: SkuReadPort;
  readonly pricing: ReadPricing;
  readonly costs: CostReadPort;
  readonly promotions: ReadPromotions;
  readonly rules: RuleSnapshotReadPort;
}): OperationPlanSourceResolver {
  const resolve = async (
    productId: UuidV7,
    input: CreateOperationPlanInput,
  ): Promise<ResolvedOperationPlanSources> => {
    const run = await exactWorkflow(productId, input.workflowRunId, dependencies.workflows);
    const nodes = await Promise.all(
      OPERATION_PLAN_NODE_KEYS.map((nodeKey, index) =>
        resolveNode(run, nodeKey, OPERATION_PLAN_ASSET_TYPES[index]!, dependencies),
      ),
    );
    const competitorSnapshotIds = await exactCompetitorSnapshots(
      productId,
      nodes[0]!.asset,
      dependencies.competitors,
    );
    const pricing = await exactPricing(
      productId,
      input.pricingRecordId,
      dependencies.skus,
      dependencies.pricing,
    );
    const blockers = nodes.flatMap((node) => node.blockers);
    const currentCost = await dependencies.costs.findBySkuId(pricing.scenario.skuId);
    if (
      !currentCost ||
      currentCost.id !== pricing.scenario.costProfileId ||
      currentCost.revisionNo !== pricing.scenario.costProfileRevisionNo ||
      pricing.result.status === 'incomplete' ||
      pricing.result.status === 'invalid'
    ) {
      blockers.push({ code: 'FINANCIAL_INPUT_MISMATCH', source: 'pricing' });
    } else if (pricing.result.status === 'warning') {
      blockers.push({ code: 'SOURCE_NEEDS_REVIEW', source: 'pricing' });
    }
    const promotion = await exactPromotion(productId, run, input, pricing, dependencies);
    blockers.push(...promotion.blockers);
    return {
      platformId: run.platformId,
      sources: {
        workflowRunId: run.id,
        workflowRunRevision: run.revision,
        nodes: nodes.map(({ source }) => source),
        competitorSnapshotIds,
        pricing: {
          resultId: pricing.result.id,
          scenarioId: pricing.scenario.id,
          skuId: pricing.scenario.skuId,
          costProfileId: pricing.scenario.costProfileId,
          costProfileRevisionNo: pricing.scenario.costProfileRevisionNo,
        },
        promotion: promotion.source,
      },
      blockers: orderedBlockers(blockers),
    };
  };

  return {
    resolve,
    async revalidate(plan: OperationPlanRevision) {
      try {
        const resolved = await resolve(plan.productId, {
          workflowRunId: plan.sources.workflowRunId,
          pricingRecordId: plan.sources.pricing.resultId,
          ...(plan.sources.promotion
            ? {
                promotionScenarioId: plan.sources.promotion.scenarioId,
                promotionResultIds: plan.sources.promotion.resultIds,
              }
            : {}),
        });
        const blockers = [...resolved.blockers];
        if (
          resolved.platformId !== plan.platformId ||
          JSON.stringify(resolved.sources) !== JSON.stringify(plan.sources)
        ) {
          blockers.push({ code: 'SOURCE_STALE', source: 'workflow' });
        }
        return orderedBlockers(blockers);
      } catch {
        return [{ code: 'SOURCE_STALE', source: 'sources' }];
      }
    },
  };
}

async function exactWorkflow(
  productId: UuidV7,
  workflowRunId: string,
  workflows: Pick<WorkflowRepository, 'findById'>,
): Promise<WorkflowRun> {
  const run = await workflows.findById(validId(workflowRunId));
  if (
    !run ||
    run.productId !== productId ||
    run.status !== 'completed' ||
    run.nodes.length !== OPERATION_PLAN_NODE_KEYS.length
  ) {
    throw invalidSources();
  }
  return run;
}

async function resolveNode(
  run: WorkflowRun,
  nodeKey: OperationPlanNodeKey,
  assetType: (typeof OPERATION_PLAN_ASSET_TYPES)[number],
  dependencies: Parameters<typeof createRepositoryOperationPlanSourceResolver>[0],
): Promise<ResolvedNode> {
  const node = run.nodes.find(({ key }) => key === nodeKey);
  if (
    !node ||
    !['completed', 'locked', 'needs_review'].includes(node.status) ||
    !node.output ||
    node.output.assetType !== assetType ||
    node.dependencyHash === null
  ) {
    throw invalidSources();
  }
  const output = node.output;
  const history = await assetHistory(run, nodeKey, dependencies);
  const asset = history.find(
    (candidate) => candidate.id === output.assetId && candidate.revisionNo === output.revisionNo,
  );
  if (!asset || asset.productId !== run.productId || !samePlatform(asset, run.platformId)) {
    throw invalidSources();
  }
  const blockers: OperationPlanBlocker[] = [];
  const inspector = dependencies.inspectors[node.taskType];
  if (!inspector) throw invalidSources();
  const current = await inspector.inspect({
    productId: run.productId,
    platformId: run.platformId,
    nodeKey,
  });
  if (current.dependencyHash !== node.dependencyHash || history[0]?.id !== asset.id) {
    blockers.push({ code: 'SOURCE_STALE', source: nodeKey });
  }
  if (node.status === 'needs_review' || asset.status === 'needs_review') {
    blockers.push({ code: 'SOURCE_NEEDS_REVIEW', source: nodeKey });
  }
  if (!contentLocked(nodeKey, asset)) {
    blockers.push({ code: 'CONTENT_UNLOCKED', source: nodeKey });
  }
  return {
    source: {
      nodeKey,
      assetType,
      assetId: output.assetId,
      revisionNo: output.revisionNo,
      dependencyHash: node.dependencyHash,
    },
    asset,
    blockers,
  };
}

async function assetHistory(
  run: WorkflowRun,
  nodeKey: OperationPlanNodeKey,
  dependencies: Parameters<typeof createRepositoryOperationPlanSourceResolver>[0],
): Promise<readonly (StrategyAsset | ContentAsset)[]> {
  if (nodeKey in STRATEGY_KIND_BY_NODE) {
    return dependencies.strategies.list(
      run.productId,
      STRATEGY_KIND_BY_NODE[nodeKey as keyof typeof STRATEGY_KIND_BY_NODE],
    );
  }
  if (nodeKey === 'titles') return dependencies.titles.list(run.productId, run.platformId);
  if (nodeKey === 'creative') return dependencies.creativePlans.list(run.productId, run.platformId);
  return dependencies.detailPages.list(run.productId, run.platformId);
}

function samePlatform(asset: StrategyAsset | ContentAsset, platformId: WorkflowRun['platformId']) {
  return !('platformId' in asset) || asset.platformId === platformId;
}

function contentLocked(
  nodeKey: OperationPlanNodeKey,
  asset: StrategyAsset | ContentAsset,
): boolean {
  if (nodeKey === 'titles') return 'locked' in asset && asset.locked;
  if (nodeKey === 'creative') return 'items' in asset && asset.items.every(({ locked }) => locked);
  if (nodeKey === 'detail_page')
    return 'sections' in asset && asset.sections.every(({ locked }) => locked);
  return true;
}

async function exactCompetitorSnapshots(
  productId: UuidV7,
  asset: StrategyAsset | ContentAsset,
  competitors: ReadCompetitors,
): Promise<readonly UuidV7[]> {
  if (!('kind' in asset) || asset.kind !== 'competitor_analysis') throw invalidSources();
  const payload = asset.payload as {
    readonly conclusions?: readonly {
      readonly evidenceRefs?: readonly { readonly kind: string; readonly id: UuidV7 }[];
    }[];
  };
  const ids = [
    ...new Set(
      (payload.conclusions ?? []).flatMap(({ evidenceRefs = [] }) =>
        evidenceRefs.filter(({ kind }) => kind === 'competitor_snapshot').map(({ id }) => id),
      ),
    ),
  ].sort();
  if (ids.length === 0) throw invalidSources();
  const entries = await competitors.listByProduct(productId);
  const snapshots = (
    await Promise.all(entries.map(({ competitor }) => competitors.listSnapshots(competitor.id)))
  ).flat();
  if (
    ids.some(
      (id) => !snapshots.some((snapshot) => snapshot.id === id && snapshot.productId === productId),
    )
  ) {
    throw invalidSources();
  }
  return ids;
}

async function exactPricing(
  productId: UuidV7,
  pricingRecordId: string,
  skus: SkuReadPort,
  pricing: ReadPricing,
): Promise<{ readonly scenario: PricingScenario; readonly result: PricingResultRecord }> {
  const resultId = validId(pricingRecordId);
  const matrix = await skus.load(productId);
  for (const sku of matrix.skus) {
    if (sku.productId !== productId) throw invalidSources();
    for (const scenario of await pricing.listScenarios(sku.id)) {
      const result = (await pricing.listResults(scenario.id)).find(({ id }) => id === resultId);
      if (result) {
        if (
          scenario.skuId !== sku.id ||
          result.skuId !== sku.id ||
          result.scenarioId !== scenario.id
        ) {
          throw invalidSources();
        }
        return { scenario, result };
      }
    }
  }
  throw invalidSources();
}

async function exactPromotion(
  productId: UuidV7,
  run: WorkflowRun,
  input: CreateOperationPlanInput,
  pricing: Awaited<ReturnType<typeof exactPricing>>,
  dependencies: Parameters<typeof createRepositoryOperationPlanSourceResolver>[0],
): Promise<{
  readonly source: ResolvedOperationPlanSources['sources']['promotion'];
  readonly blockers: readonly OperationPlanBlocker[];
}> {
  const hasScenario = input.promotionScenarioId !== undefined;
  const hasResults = input.promotionResultIds !== undefined;
  if (hasScenario !== hasResults) throw invalidSources();
  if (!hasScenario || !input.promotionResultIds) return { source: null, blockers: [] };
  const scenario = await dependencies.promotions.findScenario(validId(input.promotionScenarioId!));
  const resultIds = input.promotionResultIds.map(validId);
  if (
    !scenario ||
    scenario.productId !== productId ||
    scenario.platformId !== run.platformId ||
    resultIds.length === 0 ||
    new Set(resultIds).size !== resultIds.length
  ) {
    throw invalidSources();
  }
  const allResults = await dependencies.promotions.listResults(scenario.id);
  const results = resultIds.map((id) => allResults.find((result) => result.id === id));
  if (results.some((result) => !result || result.scenarioId !== scenario.id))
    throw invalidSources();
  const selected = results.filter(
    (result): result is PromotionResultRecord => result !== undefined,
  );
  const blockers: OperationPlanBlocker[] = [];
  const pricingRow = selected.find(({ skuId }) => skuId === pricing.scenario.skuId);
  if (
    !pricingRow ||
    pricingRow.costProfileId !== pricing.scenario.costProfileId ||
    pricingRow.costProfileRevisionNo !== pricing.scenario.costProfileRevisionNo ||
    selected.some(({ status }) => status === 'incomplete')
  ) {
    blockers.push({ code: 'FINANCIAL_INPUT_MISMATCH', source: 'promotion' });
  }
  if (selected.some(({ status }) => status === 'warning')) {
    blockers.push({ code: 'SOURCE_NEEDS_REVIEW', source: 'promotion' });
  }
  const snapshot = await dependencies.rules.getSnapshot(scenario.ruleSnapshotId);
  if (snapshot.snapshot.hash !== scenario.ruleSnapshotHash) {
    blockers.push({ code: 'RULE_SNAPSHOT_MISMATCH', source: 'promotion' });
  }
  return {
    source: {
      scenarioId: scenario.id,
      resultIds,
      ruleSnapshotHash: scenario.ruleSnapshotHash,
    },
    blockers,
  };
}

function orderedBlockers(
  blockers: readonly OperationPlanBlocker[],
): readonly OperationPlanBlocker[] {
  const unique = new Map(blockers.map((blocker) => [`${blocker.code}:${blocker.source}`, blocker]));
  return [...unique.values()].sort((left, right) => {
    const codeOrder = BLOCKER_ORDER.indexOf(left.code) - BLOCKER_ORDER.indexOf(right.code);
    return codeOrder === 0 ? left.source.localeCompare(right.source) : codeOrder;
  });
}

function validId(value: string): UuidV7 {
  try {
    return parseUuidV7(value);
  } catch {
    throw invalidSources();
  }
}

function invalidSources(): DomainError {
  return new DomainError('VALIDATION_ERROR', 'Operation plan sources are invalid.');
}
