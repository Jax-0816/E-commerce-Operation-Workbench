import { describe, expect, it } from 'vitest';

import { CreativePlanOutputSchema, type AIGenerationLog, type AIProvider } from '@eaw/ai-engine';
import { createUuidV7 } from '@eaw/domain';
import { calculateTemplateHash, type PromptTemplate } from '@eaw/prompt-engine';
import type { SecretStore } from '@eaw/workspace';

import {
  createContentGenerationPort,
  createRepositoryContentContext,
} from './content-generation.js';

describe('content generation port', () => {
  it('keeps supplied creative ids and reviews output without evidence', async () => {
    const productId = createUuidV7();
    const itemIds = Array.from({ length: 5 }, () => createUuidV7());
    const logs: AIGenerationLog[] = [];
    const template = prompt('creative-plan', 'creative_plan');
    const response = {
      productId,
      items: itemIds.map((id, index) => ({
        id,
        order: index + 1,
        role: index === 0 ? ('hero' as const) : ('supporting' as const),
        headline: `图 ${index + 1}`,
        body: '画面说明',
        promptZh: '中文提示',
        promptEn: 'English prompt',
        negativePromptZh: '中文负面',
        negativePromptEn: 'English negative',
        evidenceRefs: [],
        reviewTerms: [],
        locked: false as const,
      })),
    };
    const parsed = CreativePlanOutputSchema.safeParse(response);
    expect(parsed.success, parsed.error?.message).toBe(true);
    const port = createContentGenerationPort({
      context: {
        async collect() {
          return {
            hashes: { facts: 'a'.repeat(64) },
            allowedEvidenceRefs: new Set<string>(),
            promptContexts: [],
          };
        },
      },
      prompts: {
        async findActive() {
          return { template, templateHash: calculateTemplateHash(template) };
        },
      },
      logs: {
        async append(log) {
          logs.push(log);
        },
      },
      secrets: {
        async get() {
          return 'secret';
        },
      } as unknown as SecretStore,
      providerFactory: () => fakeProvider(JSON.stringify(response)),
      idFactory: () => itemIds.shift() ?? createUuidV7(),
    });

    const generated = await port.generateCreative(productId, 'pinduoduo');

    expect(generated.status).toBe('needs_review');
    expect(generated.validationIssues[0]?.code).toBe('unsupported_evidence');
    expect(logs).toHaveLength(1);
  });
});

it('excludes sensitive facts from creative and detail generation context', async () => {
  const productId = createUuidV7();
  const allowedId = createUuidV7();
  const sensitiveId = createUuidV7();
  const context = createRepositoryContentContext({
    facts: {
      async listCurrent() {
        return [fact(allowedId, productId, false), fact(sensitiveId, productId, true)];
      },
    },
    strategies: {
      async latest() {
        return undefined;
      },
    },
    titles: {
      async latest() {
        return undefined;
      },
    },
    platformProfiles: {
      async find() {
        return undefined;
      },
    },
  } as never);

  const collected = await context.collect(productId, 'pinduoduo');

  expect([...collected.allowedEvidenceRefs]).toEqual([`product_fact:${allowedId}`]);
  expect(JSON.stringify(collected.promptContexts)).not.toContain(sensitiveId);
});

function prompt(templateId: string, task: string): PromptTemplate {
  return {
    schemaVersion: '1',
    templateId,
    task,
    version: '1.0.0',
    systemRole: '只使用证据。',
    taskContract: '返回结构化内容。',
    outputSchema: { type: 'object' },
  };
}
function fakeProvider(content: string): AIProvider {
  return {
    id: 'fake',
    async generate() {
      return {
        provider: 'fake',
        responseId: 'response',
        model: 'fake',
        content,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    },
    async testConnection() {
      return true;
    },
    getCapabilities() {
      return { text: true, structured: true };
    },
  };
}

function fact(
  id: ReturnType<typeof createUuidV7>,
  productId: ReturnType<typeof createUuidV7>,
  sensitive: boolean,
) {
  return {
    id,
    productId,
    key: sensitive ? 'supplier_secret' : 'material',
    label: '材质',
    value: { type: 'text', value: '304 不锈钢' },
    unit: null,
    verification: 'confirmed',
    sensitive,
    policyEligible: true,
    deletedAt: null,
    revisionNo: 1,
  };
}
