import {
  DomainError,
  type CompetitorRepository,
  type CreativePlanRepository,
  type DetailPageRepository,
  type PlatformProfileRepository,
  type ProductFactRepository,
  type StrategyAsset,
  type StrategyRepository,
  type TitleAssetRepository,
  type UuidV7,
} from '@eaw/domain';
import { canonicalJson, sha256 } from '@eaw/prompt-engine';
import type { WorkflowNodeOutputReference } from '@eaw/workflow-engine';

import type { ActivePromptPort } from '../strategy/index.js';
import type { RuleRepositoryPort } from '../rules/index.js';
import type {
  ContentWorkflowContextPort,
  ContentWorkflowInspectionInput,
} from './content-workflow-handlers.js';

type ReadFacts = Pick<ProductFactRepository, 'listCurrent'>;
type ReadCompetitors = Pick<CompetitorRepository, 'listByProduct'>;
type ReadStrategies = Pick<StrategyRepository, 'latest'>;
type ReadTitles = Pick<TitleAssetRepository, 'latest'>;
type ReadCreativePlans = Pick<CreativePlanRepository, 'latest'>;
type ReadDetailPages = Pick<DetailPageRepository, 'latest'>;
type ReadPlatformProfiles = Pick<PlatformProfileRepository, 'find'>;

const PROMPT_BY_NODE = {
  competitor_analysis: ['competitor-analysis'],
  market_insight: ['market-insight'],
  selling_point_set: ['selling-point-set'],
  title_generation: ['title-generation'],
  creative_plan: ['creative-plan', 'creative-item', 'detail-page'],
  detail_page: ['creative-plan', 'creative-item', 'detail-page'],
} as const;

type ContentNodeKey = keyof typeof PROMPT_BY_NODE;

export function createRepositoryContentWorkflowContext(dependencies: {
  readonly facts: ReadFacts;
  readonly competitors: ReadCompetitors;
  readonly strategies: ReadStrategies;
  readonly titles: ReadTitles;
  readonly creativePlans: ReadCreativePlans;
  readonly detailPages: ReadDetailPages;
  readonly platformProfiles: ReadPlatformProfiles;
  readonly prompts: ActivePromptPort;
  readonly rules?: Pick<RuleRepositoryPort, 'findActive' | 'listOverrides'>;
  readonly region?: string;
}): ContentWorkflowContextPort {
  return {
    async inspect(input) {
      const nodeKey = contentNodeKey(input.nodeKey);
      const sources = await collectSources(input, dependencies);
      const dependencySnapshot = snapshot(nodeKey, input, sources);
      const dependencyHash = sha256(canonicalJson(dependencySnapshot));
      const candidate = candidateFor(nodeKey, sources);
      const reusableOutput = reusable(candidate, nodeKey, input, dependencyHash);
      return {
        dependencies: dependencySnapshot,
        ...(reusableOutput ? { reusableOutput } : {}),
      };
    },
  };
}

async function collectSources(
  input: ContentWorkflowInspectionInput,
  dependencies: Parameters<typeof createRepositoryContentWorkflowContext>[0],
) {
  const region = dependencies.region ?? 'CN';
  const rulePlatformId = {
    pinduoduo: 'pinduoduo',
    taobao: 'taobao_tmall',
    douyin: 'douyin_ecommerce',
  }[input.platformId] as Parameters<RuleRepositoryPort['findActive']>[0];
  const [allFacts, competitors, competitorAnalysis, marketInsight, sellingPoints, title, creative, detail, profile, rule, overrides, prompts] =
    await Promise.all([
      dependencies.facts.listCurrent(input.productId),
      dependencies.competitors.listByProduct(input.productId),
      dependencies.strategies.latest(input.productId, 'competitor_analysis'),
      dependencies.strategies.latest(input.productId, 'market_insight'),
      dependencies.strategies.latest(input.productId, 'selling_point_set'),
      dependencies.titles.latest(input.productId, input.platformId),
      dependencies.creativePlans.latest(input.productId, input.platformId),
      dependencies.detailPages.latest(input.productId, input.platformId),
      dependencies.platformProfiles.find(input.productId, input.platformId),
      dependencies.rules?.findActive(rulePlatformId, region),
      dependencies.rules?.listOverrides(rulePlatformId, region) ?? Promise.resolve([]),
      activePrompts(dependencies.prompts),
    ]);
  const facts = allFacts
    .filter(
      ({ verification, policyEligible, sensitive, deletedAt }) =>
        verification === 'confirmed' && policyEligible && !sensitive && deletedAt === null,
    )
    .map(({ id, lineageId, key, label, value, unit, revisionNo }) => ({
      id,
      lineageId,
      key,
      label,
      value,
      unit,
      revisionNo,
    }));
  return {
    facts,
    competitors: competitors.map(({ competitor, latestSnapshot }) => ({
      competitorId: competitor.id,
      competitorUpdatedAt: competitor.updatedAt.toISOString(),
      snapshotId: latestSnapshot.id,
      capturedAt: latestSnapshot.capturedAt.toISOString(),
    })),
    competitorAnalysis,
    marketInsight,
    sellingPoints,
    title,
    creative,
    detail,
    platform: profile
      ? {
          id: profile.id,
          updatedAt: profile.updatedAt.toISOString(),
          categoryCode: profile.categoryCode,
          categoryName: profile.categoryName,
          metadata: profile.metadata,
          status: profile.status,
        }
      : null,
    rules: {
      region,
      active: rule
        ? {
            id: rule.id,
            version: rule.pack.manifest.version,
            checksum: rule.pack.manifest.checksum,
          }
        : null,
      overrides: [...overrides]
        .map(({ id, revisionNo }) => ({ id, revisionNo }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    },
    prompts,
  };
}

async function activePrompts(prompts: ActivePromptPort): Promise<Readonly<Record<string, string | null>>> {
  const ids = [...new Set(Object.values(PROMPT_BY_NODE).flat())];
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await prompts.findActive(id))?.templateHash ?? null] as const),
  );
  return Object.fromEntries(entries);
}

function snapshot(
  nodeKey: ContentNodeKey,
  input: ContentWorkflowInspectionInput,
  sources: Awaited<ReturnType<typeof collectSources>>,
) {
  const base = {
    schemaVersion: 1,
    productId: input.productId,
    platformId: input.platformId,
    nodeKey,
    facts: sources.facts,
    prompts: Object.fromEntries(PROMPT_BY_NODE[nodeKey].map((id) => [id, sources.prompts[id]])),
  };
  if (nodeKey === 'competitor_analysis') {
    return { ...base, competitors: sources.competitors };
  }
  if (nodeKey === 'market_insight') {
    return {
      ...base,
      competitors: sources.competitors,
      competitorAnalysis: assetIdentity(sources.competitorAnalysis),
    };
  }
  if (nodeKey === 'selling_point_set') {
    return { ...base, marketInsight: assetIdentity(sources.marketInsight) };
  }
  const platformRules = { platform: sources.platform, rules: sources.rules };
  if (nodeKey === 'title_generation') {
    return { ...base, sellingPoints: assetIdentity(sources.sellingPoints), platformRules };
  }
  return {
    ...base,
    sellingPoints: assetIdentity(sources.sellingPoints),
    title: revisionIdentity(sources.title),
    platformRules,
  };
}

function assetIdentity(asset: StrategyAsset | undefined) {
  return asset
    ? { id: asset.id, revisionNo: asset.revisionNo, status: asset.status }
    : null;
}

function revisionIdentity(revision: { readonly id: UuidV7; readonly revisionNo: number; readonly status: string } | undefined) {
  return revision ? { id: revision.id, revisionNo: revision.revisionNo, status: revision.status } : null;
}

function candidateFor(nodeKey: ContentNodeKey, sources: Awaited<ReturnType<typeof collectSources>>) {
  if (nodeKey === 'title_generation') return sources.title;
  if (nodeKey === 'creative_plan') return sources.creative;
  if (nodeKey === 'detail_page') return sources.detail;
  return undefined;
}

function reusable(
  candidate: ReturnType<typeof candidateFor>,
  nodeKey: ContentNodeKey,
  input: ContentWorkflowInspectionInput,
  dependencyHash: string,
): WorkflowNodeOutputReference | undefined {
  if (
    !candidate ||
    candidate.productId !== input.productId ||
    candidate.platformId !== input.platformId ||
    candidate.dependencyHashes.workflow !== dependencyHash
  ) {
    return undefined;
  }
  return {
    assetType: nodeKey === 'title_generation' ? 'title_asset' : nodeKey,
    assetId: candidate.id,
    revisionNo: candidate.revisionNo,
  };
}

function contentNodeKey(value: string): ContentNodeKey {
  if (Object.hasOwn(PROMPT_BY_NODE, value)) return value as ContentNodeKey;
  throw new DomainError('VALIDATION_ERROR', 'Content workflow node is invalid.');
}
