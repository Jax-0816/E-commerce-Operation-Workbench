import {
  CreativeItemOutputSchema,
  CreativePlanOutputSchema,
  DetailPageOutputSchema,
  generateAndLog,
  reviewCreativeItem,
  reviewCreativePlan,
  reviewDetailPage,
  type AIGenerationLogPort,
  type AIProvider,
  type ContentReviewIssue,
  type CreativeItemOutput,
  type CreativePlanOutput,
  type DetailPageOutput,
} from '@eaw/ai-engine';
import {
  createUuidV7,
  DomainError,
  type ContentValidationIssue,
  type PlatformId,
  type PlatformProfileRepository,
  type ProductFactRepository,
  type StrategyRepository,
  type TitleAssetRepository,
  type UuidV7,
} from '@eaw/domain';
import {
  canonicalJson,
  compilePrompt,
  sha256,
  type JsonValue,
  type PromptContext,
} from '@eaw/prompt-engine';
import type { SecretStore } from '@eaw/workspace';
import type { ActivePromptPort } from '../strategy/index.js';
import type { ContentGenerationPort } from './index.js';

export interface ContentGenerationContextPort {
  collect(
    productId: UuidV7,
    platformId: PlatformId,
  ): Promise<{
    readonly hashes: Readonly<Record<string, string>>;
    readonly allowedEvidenceRefs: ReadonlySet<string>;
    readonly promptContexts: readonly PromptContext[];
  }>;
}

export function createRepositoryContentContext(dependencies: {
  readonly facts: ProductFactRepository;
  readonly strategies: StrategyRepository;
  readonly titles: TitleAssetRepository;
  readonly platformProfiles: PlatformProfileRepository;
}): ContentGenerationContextPort {
  return {
    async collect(productId, platformId) {
      const facts = (await dependencies.facts.listCurrent(productId)).filter(
        (fact) =>
          fact.verification === 'confirmed' &&
          fact.policyEligible &&
          !fact.sensitive &&
          fact.deletedAt === null,
      );
      const selling = await dependencies.strategies.latest(productId, 'selling_point_set');
      const title = await dependencies.titles.latest(productId, platformId);
      const profile = await dependencies.platformProfiles.find(productId, platformId);
      const factData = facts.map(({ id, key, label, value, unit, revisionNo }) => ({
        id,
        productId,
        key,
        label,
        value,
        unit,
        revisionNo,
      }));
      const sellingData = selling
        ? {
            id: selling.id,
            revisionNo: selling.revisionNo,
            status: selling.status,
            payload: selling.payload,
          }
        : null;
      const titleData = title
        ? { id: title.id, revisionNo: title.revisionNo, status: title.status, titles: title.titles }
        : null;
      const platformData = {
        platformId,
        categoryCode: profile?.categoryCode ?? null,
        categoryName: profile?.categoryName ?? null,
        metadata: profile?.metadata ?? {},
        contentRuleVersion: 'content-local-v1',
      };
      return {
        hashes: {
          facts: hash(factData),
          selling_points: hash(sellingData),
          titles: hash(titleData),
          platform_rules: hash(platformData),
        },
        allowedEvidenceRefs: new Set([
          ...facts.map(({ id }) => `product_fact:${id}`),
          ...(selling?.status === 'verified' ? [`strategy_asset:${selling.id}`] : []),
          ...(title ? [`title_revision:${title.id}`] : []),
        ]),
        promptContexts: [
          { key: 'confirmed_facts', trust: 'CONFIRMED_FACT', content: json(factData) },
          {
            key: 'selling_points',
            trust: selling?.status === 'verified' ? 'APPROVED_AI_ASSET' : 'EXTERNAL_UNTRUSTED',
            content: json(sellingData),
          },
          {
            key: 'titles',
            trust: title?.status === 'verified' ? 'APPROVED_AI_ASSET' : 'EXTERNAL_UNTRUSTED',
            content: json(titleData),
          },
          { key: 'platform_content_rules', trust: 'RULE', content: json(platformData) },
        ],
      };
    },
  };
}

export function createContentGenerationPort(dependencies: {
  readonly context: ContentGenerationContextPort;
  readonly prompts: ActivePromptPort;
  readonly logs: AIGenerationLogPort;
  readonly secrets: SecretStore;
  readonly providerFactory: (apiKey: string) => AIProvider;
  readonly idFactory?: () => UuidV7;
  readonly now?: () => Date;
}): ContentGenerationPort {
  const id = dependencies.idFactory ?? createUuidV7;
  const now = dependencies.now ?? (() => new Date());
  const context = async (productId: UuidV7, platformId: PlatformId) => {
    const base = await dependencies.context.collect(productId, platformId);
    const prompts = await promptHashes(dependencies.prompts);
    return { ...base, hashes: { ...base.hashes, ...prompts } };
  };
  return {
    async generateCreative(productId, platformId, previous) {
      const source = await context(productId, platformId);
      const itemIds = previous?.items.map(({ id }) => id) ?? Array.from({ length: 5 }, id);
      const generated = await run<CreativePlanOutput>(
        'creative-plan',
        'creative_plan',
        CreativePlanOutputSchema,
        [...source.promptContexts, requestContext({ productId, itemIds })],
        (value) =>
          reviewCreativePlan(value, {
            productId,
            requestedItemIds: itemIds,
            allowedEvidenceRefs: source.allowedEvidenceRefs,
          }),
        source.hashes,
        dependencies,
        id(),
        now,
      );
      if (generated.issues.includes('invalid_order'))
        throw new DomainError('AI_OUTPUT_INVALID', 'Creative plan identity is invalid.');
      return result(generated.value.items, generated.issues, source.hashes, generated.generationId);
    },
    async regenerateCreativeItem(productId, platformId, previous, itemId) {
      const source = await context(productId, platformId);
      const current = previous.items.find(({ id }) => id === itemId);
      if (!current) throw new DomainError('NOT_FOUND', 'Creative item was not found.');
      if (current.locked) throw new DomainError('CONFLICT', 'Creative item is locked.');
      const generated = await run<CreativeItemOutput>(
        'creative-item',
        'creative_item',
        CreativeItemOutputSchema,
        [...source.promptContexts, requestContext({ productId, item: current })],
        (value) =>
          reviewCreativeItem(value, {
            productId,
            requestedItemId: itemId,
            allowedEvidenceRefs: source.allowedEvidenceRefs,
          }),
        source.hashes,
        dependencies,
        id(),
        now,
      );
      if (
        generated.issues.includes('item_identity_mismatch') ||
        generated.issues.includes('invalid_order')
      )
        throw new DomainError('AI_OUTPUT_INVALID', 'Creative item identity is invalid.');
      return {
        ...result([], generated.issues, source.hashes, generated.generationId),
        item: generated.value.item,
      };
    },
    async generateDetail(productId, platformId, previous) {
      const source = await context(productId, platformId);
      const sectionIds = previous?.sections.map(({ id }) => id) ?? Array.from({ length: 7 }, id);
      const generated = await run<DetailPageOutput>(
        'detail-page',
        'detail_page',
        DetailPageOutputSchema,
        [...source.promptContexts, requestContext({ productId, sectionIds })],
        (value) =>
          reviewDetailPage(value, {
            productId,
            requestedSectionIds: sectionIds,
            allowedEvidenceRefs: source.allowedEvidenceRefs,
          }),
        source.hashes,
        dependencies,
        id(),
        now,
      );
      if (generated.issues.includes('invalid_order'))
        throw new DomainError('AI_OUTPUT_INVALID', 'Detail order is invalid.');
      return {
        sections: generated.value.sections,
        status: status(generated.issues),
        validationIssues: issues(generated.value.sections[0]!.id, generated.issues),
        dependencyHashes: source.hashes,
        generationId: generated.generationId,
      };
    },
    async currentHashes(productId, platformId) {
      return (await context(productId, platformId)).hashes;
    },
  };
}

type GenerationSchema<T> = Parameters<typeof generateAndLog<T>>[0]['schema'];
async function run<T>(
  templateId: string,
  task: string,
  schema: GenerationSchema<T>,
  contexts: readonly PromptContext[],
  review: (value: T) => { readonly value: T; readonly issues: readonly ContentReviewIssue[] },
  hashes: Readonly<Record<string, string>>,
  dependencies: Parameters<typeof createContentGenerationPort>[0],
  generationId: UuidV7,
  now: () => Date,
) {
  const stored = await dependencies.prompts.findActive(templateId);
  if (!stored || stored.template.task !== task)
    throw new DomainError('CAPABILITY_UNAVAILABLE', 'Content prompt is unavailable.');
  const apiKey = await dependencies.secrets.get('deepseek-api-key');
  if (!apiKey) throw new DomainError('AI_PROVIDER_UNAVAILABLE', 'DeepSeek is not configured.');
  const compiled = compilePrompt({
    template: stored.template,
    contexts,
    dependencies: { ...hashes, active_prompt: stored.templateHash },
  });
  const generated = await generateAndLog({
    id: generationId,
    provider: dependencies.providerFactory(apiKey),
    request: {
      model: 'deepseek-chat',
      messages: compiled.messages,
      temperature: 0.3,
      maxOutputTokens: 8_000,
    },
    schema,
    review,
    task,
    promptTemplateId: templateId,
    promptVersion: stored.template.version,
    inputHash: compiled.inputHash,
    secretValues: [apiKey],
    logs: dependencies.logs,
    now,
  });
  if (!generated.value)
    throw new DomainError('AI_OUTPUT_INVALID', 'Content output is unavailable.');
  return {
    value: generated.value,
    issues: generated.issues as readonly ContentReviewIssue[],
    generationId,
  };
}
function requestContext(content: Record<string, unknown>): PromptContext {
  return { key: 'content_request', trust: 'RULE', content: content as never };
}
async function promptHashes(prompts: ActivePromptPort) {
  const entries = await Promise.all(
    [
      ['creative_prompt', 'creative-plan'],
      ['creative_item_prompt', 'creative-item'],
      ['detail_prompt', 'detail-page'],
    ].map(
      async ([key, templateId]) =>
        [key!, (await prompts.findActive(templateId!))?.templateHash] as const,
    ),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
}
function result(
  items: readonly import('@eaw/domain').CreativeItem[],
  reviewIssues: readonly ContentReviewIssue[],
  hashes: Readonly<Record<string, string>>,
  generationId: UuidV7,
) {
  return {
    items,
    status: status(reviewIssues),
    validationIssues: issues(items[0]?.id ?? generationId, reviewIssues),
    dependencyHashes: hashes,
    generationId,
  } as const;
}
function status(reviewIssues: readonly ContentReviewIssue[]) {
  return reviewIssues.length === 0 ? ('verified' as const) : ('needs_review' as const);
}
function issues(
  itemId: UuidV7,
  values: readonly ContentReviewIssue[],
): readonly ContentValidationIssue[] {
  return values.map((code) => ({
    itemId,
    code: code === 'review_term' ? 'review_term' : 'unsupported_evidence',
    detail: code,
  }));
}
function json(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}
function hash(value: unknown): string {
  return sha256(canonicalJson(value));
}
