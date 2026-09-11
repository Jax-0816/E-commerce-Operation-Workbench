import {
  TitleGenerationOutputSchema,
  generateAndLog,
  validateTitleOutput,
  type AIGenerationLogPort,
  type AIProvider,
} from '@eaw/ai-engine';
import {
  createUuidV7,
  DomainError,
  parseUuidV7,
  type PlatformId,
  type PlatformProfileRepository,
  type ProductFactRepository,
  type ProductRepository,
  type StrategyRepository,
  type TitleAssetRepository,
  type TitleAssetView,
  type TitleCandidate,
  type UuidV7,
} from '@eaw/domain';
import { canonicalJson, compilePrompt, sha256, type JsonValue } from '@eaw/prompt-engine';
import type { SecretStore } from '@eaw/workspace';
import type { ActivePromptPort } from '../strategy/index.js';

const TEMPLATE_ID = 'title-generation';

export interface TitlesApplication {
  generate(
    productId: string,
    platformId: PlatformId,
    workflowDependencyHash?: string,
  ): Promise<TitleAssetView>;
  edit(
    productId: string,
    platformId: PlatformId,
    titles: readonly TitleCandidate[],
  ): Promise<TitleAssetView>;
  lock(productId: string, platformId: PlatformId): Promise<TitleAssetView>;
  list(productId: string, platformId: PlatformId): Promise<readonly TitleAssetView[]>;
}

export function createTitlesApplication(dependencies: {
  readonly products: ProductRepository;
  readonly facts: ProductFactRepository;
  readonly strategies: StrategyRepository;
  readonly platformProfiles: PlatformProfileRepository;
  readonly repository: TitleAssetRepository;
  readonly prompts: ActivePromptPort;
  readonly logs: AIGenerationLogPort;
  readonly secrets: SecretStore;
  readonly providerFactory: (apiKey: string) => AIProvider;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
}): TitlesApplication {
  const idFactory = dependencies.idFactory ?? createUuidV7;
  const now = dependencies.now ?? (() => new Date());
  const current = async (productId: UuidV7, platformId: PlatformId) => {
    const context = await currentContext(productId, platformId, dependencies);
    const prompt = await dependencies.prompts.findActive(TEMPLATE_ID);
    return {
      ...context,
      hashes: {
        ...context.hashes,
        ...(prompt ? { prompt: prompt.templateHash } : {}),
      },
    };
  };
  const view = async (revision: TitleAssetView['revision']) =>
    evaluateTitleStaleness(
      revision,
      (await current(revision.productId, revision.platformId)).hashes,
    );
  return {
    async generate(productIdValue, platformId, workflowDependencyHash) {
      const productId = await owner(productIdValue, dependencies.products);
      const context = await current(productId, platformId);
      const stored = await dependencies.prompts.findActive(TEMPLATE_ID);
      if (!stored || stored.template.task !== 'title_generation')
        throw new DomainError('CAPABILITY_UNAVAILABLE', 'Title prompt is unavailable.');
      const apiKey = await dependencies.secrets.get('deepseek-api-key');
      if (!apiKey) throw new DomainError('AI_PROVIDER_UNAVAILABLE', 'DeepSeek is not configured.');
      const compiled = compilePrompt({
        template: stored.template,
        contexts: context.promptContexts,
        dependencies: { ...context.hashes, prompt: stored.templateHash },
      });
      const generationId = idFactory();
      const validationContext = { productId, platformId, allowedFactRefs: context.allowedFactRefs };
      const generated = await generateAndLog({
        id: generationId,
        provider: dependencies.providerFactory(apiKey),
        request: {
          model: 'deepseek-chat',
          messages: compiled.messages,
          temperature: 0.3,
          maxOutputTokens: 4_000,
        },
        schema: TitleGenerationOutputSchema,
        review: (value) => ({
          value,
          issues: validateTitleOutput(value, validationContext).map(({ code }) => code),
        }),
        task: stored.template.task,
        promptTemplateId: stored.template.templateId,
        promptVersion: stored.template.version,
        inputHash: compiled.inputHash,
        secretValues: [apiKey],
        logs: dependencies.logs,
        now,
      });
      if (!generated.value)
        throw new DomainError('AI_OUTPUT_INVALID', 'Title output is unavailable.');
      const validationIssues = validateTitleOutput(generated.value, validationContext);
      const previous = await dependencies.repository.latest(productId, platformId);
      return view(
        await dependencies.repository.append({
          id: idFactory(),
          lineageId: previous?.lineageId ?? idFactory(),
          productId,
          platformId,
          origin: 'generated',
          status: validationIssues.length === 0 ? 'verified' : 'needs_review',
          locked: false,
          titles: generated.value.titles,
          validationIssues,
          dependencyHashes: {
            ...context.hashes,
            prompt: stored.templateHash,
            ...(workflowDependencyHash ? { workflow: workflowDependencyHash } : {}),
          },
          generationId,
          createdAt: now(),
        }),
      );
    },
    async edit(productIdValue, platformId, titles) {
      const productId = await owner(productIdValue, dependencies.products);
      const parsed = TitleGenerationOutputSchema.parse({ productId, titles });
      const context = await current(productId, platformId);
      const issues = validateTitleOutput(parsed, {
        productId,
        platformId,
        allowedFactRefs: context.allowedFactRefs,
      });
      const previous = await requiredLatest(dependencies.repository, productId, platformId);
      return view(
        await dependencies.repository.append({
          id: idFactory(),
          lineageId: previous.lineageId,
          productId,
          platformId,
          origin: 'edited',
          status: issues.length === 0 ? 'verified' : 'needs_review',
          locked: false,
          titles: parsed.titles,
          validationIssues: issues,
          dependencyHashes: context.hashes,
          generationId: null,
          createdAt: now(),
        }),
      );
    },
    async lock(productIdValue, platformId) {
      const productId = await owner(productIdValue, dependencies.products);
      const previous = await requiredLatest(dependencies.repository, productId, platformId);
      return view(
        await dependencies.repository.append({
          id: idFactory(),
          lineageId: previous.lineageId,
          productId,
          platformId,
          origin: 'locked',
          status: previous.status,
          locked: true,
          titles: previous.titles,
          validationIssues: previous.validationIssues,
          dependencyHashes: previous.dependencyHashes,
          generationId: null,
          createdAt: now(),
        }),
      );
    },
    async list(productIdValue, platformId) {
      const productId = await owner(productIdValue, dependencies.products);
      const hashes = (await current(productId, platformId)).hashes;
      return (await dependencies.repository.list(productId, platformId)).map((revision) =>
        evaluateTitleStaleness(revision, hashes),
      );
    },
  };
}

async function owner(value: string, products: ProductRepository) {
  const product = await products.findById(parseUuidV7(value));
  if (!product || product.archivedAt) throw new DomainError('NOT_FOUND', 'Product was not found.');
  return product.id;
}

async function requiredLatest(
  repository: TitleAssetRepository,
  productId: UuidV7,
  platformId: PlatformId,
) {
  const revision = await repository.latest(productId, platformId);
  if (!revision) throw new DomainError('NOT_FOUND', 'Title asset was not found.');
  return revision;
}

async function currentContext(
  productId: UuidV7,
  platformId: PlatformId,
  dependencies: {
    readonly facts: ProductFactRepository;
    readonly strategies: StrategyRepository;
    readonly platformProfiles: PlatformProfileRepository;
  },
) {
  const facts = (await dependencies.facts.listCurrent(productId)).filter(
    (fact) =>
      fact.verification === 'confirmed' &&
      fact.policyEligible &&
      !fact.sensitive &&
      fact.deletedAt === null,
  );
  const sellingPoints = await dependencies.strategies.latest(productId, 'selling_point_set');
  const profile = await dependencies.platformProfiles.find(productId, platformId);
  const factsData = facts.map((fact) => ({
    id: fact.id,
    productId,
    key: fact.key,
    label: fact.label,
    value: fact.value,
    unit: fact.unit,
    revisionNo: fact.revisionNo,
  }));
  const strategyData = sellingPoints
    ? {
        id: sellingPoints.id,
        revisionNo: sellingPoints.revisionNo,
        status: sellingPoints.status,
        payload: sellingPoints.payload,
      }
    : null;
  const platformData = {
    platformId,
    categoryCode: profile?.categoryCode ?? null,
    categoryName: profile?.categoryName ?? null,
    metadata: profile?.metadata ?? {},
    localTitleRuleVersion: 'title-local-v1',
  };
  return {
    allowedFactRefs: new Set(facts.map(({ id }) => id)),
    hashes: {
      facts: sha256(canonicalJson(factsData)),
      selling_points: sha256(canonicalJson(strategyData)),
      platform_rules: sha256(canonicalJson(platformData)),
    },
    promptContexts: [
      { key: 'confirmed_facts', trust: 'CONFIRMED_FACT' as const, content: toJson(factsData) },
      {
        key: 'selling_points',
        trust:
          sellingPoints?.status === 'verified'
            ? ('APPROVED_AI_ASSET' as const)
            : ('EXTERNAL_UNTRUSTED' as const),
        content: toJson(strategyData),
      },
      { key: 'platform_title_rules', trust: 'RULE' as const, content: toJson(platformData) },
    ],
  };
}

export function evaluateTitleStaleness(
  revision: TitleAssetView['revision'],
  currentHashes: Readonly<Record<string, string>>,
): TitleAssetView {
  const staleReasons = Object.entries(revision.dependencyHashes)
    .filter(([key, hash]) => currentHashes[key] !== undefined && currentHashes[key] !== hash)
    .map(([key]) => `${key}_changed`);
  return { revision, stale: staleReasons.length > 0, staleReasons };
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}
