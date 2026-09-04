import type { AIGenerationLog, AIProvider } from '@eaw/ai-engine';
import {
  createProduct,
  createStrategyAsset,
  createUuidV7,
  type CompetitorRepository,
  type ProductFactRepository,
  type ProductRepository,
  type StrategyAsset,
  type StrategyRepository,
} from '@eaw/domain';
import { calculateTemplateHash, type PromptTemplate } from '@eaw/prompt-engine';
import type { SecretStore } from '@eaw/workspace';
import { describe, expect, it } from 'vitest';

import { createStrategyApplication } from './index.js';

describe('strategy application', () => {
  it('creates immutable revisions and downgrades an unsupported selling point', async () => {
    const product = createProduct({ id: createUuidV7(), name: '保温杯', now: new Date() });
    const template = prompt();
    const logs: AIGenerationLog[] = [];
    const assets: StrategyAsset[] = [];
    const output = JSON.stringify({
      productId: product.id,
      sellingPoints: [
        {
          headline: '24 小时保温',
          description: '长效保温',
          consumerPainOrBenefit: '减少重复加热',
          differentiation: '更长保温',
          risk: '需要检测报告',
          priority: 1,
          recommendedUsage: '详情页',
          evidenceRefs: [],
        },
      ],
      suggestedFacts: [],
      limitations: [],
    });
    const application = createStrategyApplication({
      products: {
        findById: async (id) => (id === product.id ? product : undefined),
      } as ProductRepository,
      facts: { listCurrent: async () => [] } as unknown as ProductFactRepository,
      competitors: { listByProduct: async () => [] } as unknown as CompetitorRepository,
      repository: {
        async append(input) {
          const previous = assets.at(-1);
          const asset = createStrategyAsset({
            ...input,
            revisionNo: assets.length + 1,
            supersedesAssetId: previous?.id ?? null,
          });
          assets.push(asset);
          return asset;
        },
        async latest() {
          return assets.at(-1);
        },
        async list() {
          return [...assets].reverse();
        },
      } satisfies StrategyRepository,
      prompts: {
        findActive: async () => ({ template, templateHash: calculateTemplateHash(template) }),
      },
      logs: {
        append: async (log) => {
          logs.push(log);
        },
      },
      secrets: { get: async () => 'secret-value' } as unknown as SecretStore,
      providerFactory: () => fakeProvider(output),
    });

    const first = await application.generate(product.id, 'selling_point_set');
    const second = await application.generate(product.id, 'selling_point_set');

    expect(first.status).toBe('needs_review');
    expect(first.payload).toMatchObject({
      sellingPoints: [],
      suggestedFacts: [{ label: '24 小时保温' }],
    });
    expect(second).toMatchObject({ revisionNo: 2, supersedesAssetId: first.id });
    expect(logs).toHaveLength(2);
  });
});

function prompt(): PromptTemplate {
  return {
    schemaVersion: '1',
    templateId: 'selling-point-set',
    task: 'selling_point_set',
    version: '1.0.0',
    systemRole: '只使用证据。',
    taskContract: '输出结构化卖点。',
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
