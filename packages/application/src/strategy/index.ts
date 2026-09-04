import {
  CompetitorAnalysisOutputSchema,
  MarketInsightOutputSchema,
  SellingPointSetOutputSchema,
  generateAndLog,
  reviewCompetitorAnalysis,
  reviewMarketInsight,
  reviewSellingPointSet,
  type AIGenerationLogPort,
  type AIProvider,
} from '@eaw/ai-engine';
import {
  createUuidV7,
  DomainError,
  parseUuidV7,
  type CompetitorRepository,
  type ProductFactRepository,
  type ProductRepository,
  type StrategyAsset,
  type StrategyAssetKind,
  type StrategyEvidenceReference,
  type StrategyRepository,
  type UuidV7,
} from '@eaw/domain';
import {
  canonicalJson,
  compilePrompt,
  sha256,
  type JsonValue,
  type PromptTemplate,
} from '@eaw/prompt-engine';
import type { SecretStore } from '@eaw/workspace';

const DEEPSEEK_SECRET_KEY = 'deepseek-api-key';

export interface ActivePrompt {
  readonly template: PromptTemplate;
  readonly templateHash: string;
}

export interface ActivePromptPort {
  findActive(templateId: string): Promise<ActivePrompt | undefined>;
}

export interface StrategyApplication {
  generate(productId: string, kind: StrategyAssetKind): Promise<StrategyAsset>;
  list(productId: string, kind: StrategyAssetKind): Promise<readonly StrategyAsset[]>;
}

export function createStrategyApplication(dependencies: {
  readonly products: ProductRepository;
  readonly facts: ProductFactRepository;
  readonly competitors: CompetitorRepository;
  readonly repository: StrategyRepository;
  readonly prompts: ActivePromptPort;
  readonly logs: AIGenerationLogPort;
  readonly secrets: SecretStore;
  readonly providerFactory: (apiKey: string) => AIProvider;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
}): StrategyApplication {
  const idFactory = dependencies.idFactory ?? createUuidV7;
  const now = dependencies.now ?? (() => new Date());
  return {
    async generate(productIdValue, kind) {
      const productId = await owner(productIdValue, dependencies.products);
      const templateId = templateFor(kind);
      const stored = await dependencies.prompts.findActive(templateId);
      if (!stored)
        throw new DomainError('CAPABILITY_UNAVAILABLE', 'Strategy prompt is unavailable.');
      if (stored.template.templateId !== templateId || stored.template.task !== kind) {
        throw new DomainError('VALIDATION_ERROR', 'Active strategy prompt is invalid.');
      }
      const apiKey = await dependencies.secrets.get(DEEPSEEK_SECRET_KEY);
      if (!apiKey) throw new DomainError('AI_PROVIDER_UNAVAILABLE', 'DeepSeek is not configured.');
      const evidence = await collectEvidence(productId, kind, dependencies);
      const compiled = compilePrompt({
        template: stored.template,
        contexts: evidence.contexts,
        dependencies: {
          prompt: stored.templateHash,
          evidence: sha256(canonicalJson(evidence.identity)),
        },
      });
      const generationId = idFactory();
      const common = {
        id: generationId,
        provider: dependencies.providerFactory(apiKey),
        request: {
          model: 'deepseek-chat',
          messages: compiled.messages,
          temperature: 0.2,
          maxOutputTokens: 4_000,
        },
        task: stored.template.task,
        promptTemplateId: stored.template.templateId,
        promptVersion: stored.template.version,
        inputHash: compiled.inputHash,
        secretValues: [apiKey],
        logs: dependencies.logs,
        now,
      } as const;
      const generated =
        kind === 'competitor_analysis'
          ? await generateAndLog({
              ...common,
              schema: CompetitorAnalysisOutputSchema,
              review: (value) => reviewCompetitorAnalysis(value, evidence.review),
            })
          : kind === 'market_insight'
            ? await generateAndLog({
                ...common,
                schema: MarketInsightOutputSchema,
                review: (value) => reviewMarketInsight(value, evidence.review),
              })
            : await generateAndLog({
                ...common,
                schema: SellingPointSetOutputSchema,
                review: (value) => reviewSellingPointSet(value, evidence.review),
              });
      if (generated.value === null) {
        throw new DomainError('AI_OUTPUT_INVALID', 'Strategy output is unavailable.');
      }
      return dependencies.repository.append({
        id: idFactory(),
        productId,
        kind,
        generationId,
        status: generated.status,
        payload: generated.value,
        createdAt: now(),
      });
    },
    async list(productId, kind) {
      return dependencies.repository.list(await owner(productId, dependencies.products), kind);
    },
  };
}

async function owner(value: string, products: ProductRepository): Promise<UuidV7> {
  const product = await products.findById(parseUuidV7(value));
  if (!product || product.archivedAt !== null) {
    throw new DomainError('NOT_FOUND', 'Product was not found.');
  }
  return product.id;
}

function templateFor(kind: StrategyAssetKind): string {
  return {
    competitor_analysis: 'competitor-analysis',
    market_insight: 'market-insight',
    selling_point_set: 'selling-point-set',
  }[kind];
}

async function collectEvidence(
  productId: UuidV7,
  kind: StrategyAssetKind,
  dependencies: {
    readonly facts: ProductFactRepository;
    readonly competitors: CompetitorRepository;
    readonly repository: StrategyRepository;
  },
) {
  const facts = (await dependencies.facts.listCurrent(productId)).filter(
    (fact) =>
      fact.verification === 'confirmed' &&
      fact.policyEligible &&
      !fact.sensitive &&
      fact.deletedAt === null,
  );
  const competitors = await dependencies.competitors.listByProduct(productId);
  const market = await dependencies.repository.latest(productId, 'market_insight');
  const references: StrategyEvidenceReference[] = [
    ...facts.map((fact) => ({ kind: 'product_fact' as const, id: fact.id, productId })),
    ...competitors.map(({ latestSnapshot }) => ({
      kind: 'competitor_snapshot' as const,
      id: latestSnapshot.id,
      productId,
    })),
    ...(kind === 'selling_point_set' && market?.status === 'verified'
      ? [{ kind: 'market_insight' as const, id: market.id, productId }]
      : []),
  ];
  return {
    review: {
      productId,
      allowedEvidenceRefs: new Set(
        references.map((reference) => `${reference.kind}:${reference.id}`),
      ),
    },
    identity: references,
    contexts: [
      {
        key: 'confirmed_facts',
        trust: 'CONFIRMED_FACT' as const,
        content: toJson(
          facts.map((fact) => ({
            id: fact.id,
            productId,
            key: fact.key,
            label: fact.label,
            value: fact.value,
            unit: fact.unit,
          })),
        ),
      },
      {
        key: 'competitor_snapshots',
        trust: 'EXTERNAL_UNTRUSTED' as const,
        content: toJson(
          competitors.map(({ competitor, latestSnapshot }) => ({
            id: latestSnapshot.id,
            productId,
            name: competitor.name,
            sourceUrl: latestSnapshot.sourceUrl,
            displayedPriceText: latestSnapshot.displayedPriceText,
            displayedSalesText: latestSnapshot.displayedSalesText,
            displayedReviewText: latestSnapshot.displayedReviewText,
            skuTexts: latestSnapshot.skuTexts,
            sellingPoints: latestSnapshot.sellingPoints,
            capturedAt: latestSnapshot.capturedAt.toISOString(),
          })),
        ),
      },
      ...(kind === 'selling_point_set' && market?.status === 'verified'
        ? [
            {
              key: 'approved_market_insight',
              trust: 'APPROVED_AI_ASSET' as const,
              content: toJson({ id: market.id, productId, payload: market.payload }),
            },
          ]
        : []),
    ],
  };
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}
