import { appendFile, writeFile } from 'node:fs/promises';

import type { AIProvider, ProviderRequest } from '@eaw/ai-engine';

import { createProductionApp } from '../src/runtime.js';
import { createServerStartupOptions } from '../src/startup.js';

const callLogPath = process.env.EAW_E2E_CALL_LOG;
if (!callLogPath) throw new Error('EAW_E2E_CALL_LOG is required for the deterministic E2E server.');
await writeFile(callLogPath, '', 'utf8');

type E2eTask =
  | 'competitor_analysis'
  | 'market_insight'
  | 'selling_point_set'
  | 'title_generation'
  | 'creative_plan'
  | 'detail_page';
let callIndex = 0;
const failedCreativeProducts = new Set<string>();

const providerFactory = (): AIProvider => ({
  id: 'e2e-fake',
  async generate(request) {
    const prompt = request.messages.map(({ content }) => content).join('\n');
    const task = taskFrom(prompt);
    callIndex += 1;
    const productId = productIdFrom(request);
    await appendFile(callLogPath, `${JSON.stringify({ task, productId })}\n`, 'utf8');
    if (task === 'creative_plan' && !failedCreativeProducts.has(productId)) {
      failedCreativeProducts.add(productId);
      throw new Error('Intentional deterministic creative failure.');
    }
    return {
      provider: 'e2e-fake',
      responseId: `e2e-response-${callIndex}`,
      model: 'e2e-fake',
      content: JSON.stringify(workflowOutput(task, productId, prompt)),
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    };
  },
  async testConnection() {
    return true;
  },
  getCapabilities() {
    return { text: true, structured: true };
  },
});

const options = createServerStartupOptions({
  host: process.env.HOST,
  moduleUrl: import.meta.url,
  port: process.env.PORT,
  workspacePath: process.env.EAW_WORKSPACE_PATH,
});
const app = await createProductionApp({ ...options, providerFactory });
try {
  await app.listen({ host: options.host, port: options.port });
} catch (error) {
  await app.close();
  throw error;
}

function productIdFrom(request: ProviderRequest): string {
  const prompt = request.messages.map(({ content }) => content).join('\n');
  const match = prompt.match(/"productId"\s*:\s*"([0-9a-f-]+)"/u);
  if (!match?.[1]) throw new Error('E2E prompt omitted productId.');
  return match[1];
}

function workflowOutput(task: E2eTask, productId: string, prompt: string) {
  if (task === 'competitor_analysis') {
    const snapshotId = contextIds(prompt, 'competitor_snapshots', 1)[0]!;
    return {
      productId,
      conclusions: [
        {
          summary: '竞品快照提供了可追踪的价格与销量展示证据。',
          evidenceRefs: [{ kind: 'competitor_snapshot', id: snapshotId, productId }],
        },
      ],
      limitations: [],
    };
  }
  if (task === 'market_insight') return { productId, insights: [], limitations: [] };
  if (task === 'selling_point_set') {
    return { productId, sellingPoints: [], suggestedFacts: [], limitations: [] };
  }
  if (task === 'title_generation') {
    return {
      productId,
      titles: ['recommended', 'search', 'selling_point', 'scenario'].map((variant) => ({
        variant,
        text: `${variant} 商品标题`,
        keywords: ['商品'],
        claims: [],
        reviewTerms: [],
      })),
    };
  }
  const count = task === 'creative_plan' ? 5 : 7;
  const ids = requestedIds(prompt, task === 'creative_plan' ? 'itemIds' : 'sectionIds', count);
  const factId = idsFromContext(prompt, 'confirmed_facts')[0];
  const evidenceRefs = factId ? [{ kind: 'product_fact' as const, id: factId, productId }] : [];
  if (task === 'creative_plan') {
    return {
      productId,
      items: ids.map((id, index) => ({
        id,
        order: index + 1,
        role: index === 0 ? 'hero' : 'supporting',
        headline: `图片 ${index + 1}`,
        body: '画面说明',
        promptZh: '中文提示',
        promptEn: 'English prompt',
        negativePromptZh: '中文负面',
        negativePromptEn: 'English negative',
        evidenceRefs,
        reviewTerms: [],
        locked: false,
      })),
    };
  }
  const kinds = ['hero', 'benefit', 'specification', 'scenario', 'trust', 'faq', 'call_to_action'];
  return {
    productId,
    sections: ids.map((id, index) => ({
      id,
      order: index + 1,
      kind: kinds[index],
      headline: `模块 ${index + 1}`,
      body: '详情说明',
      evidenceRefs,
      reviewTerms: [],
      locked: false,
    })),
  };
}

function taskFrom(prompt: string): E2eTask {
  if (prompt.includes('"promptZh"')) return 'creative_plan';
  if (prompt.includes('"call_to_action"') && prompt.includes('"sections"')) return 'detail_page';
  if (prompt.includes('"variant"') && prompt.includes('"titles"')) return 'title_generation';
  if (prompt.includes('"suggestedFacts"')) return 'selling_point_set';
  if (prompt.includes('"insights"')) return 'market_insight';
  if (prompt.includes('"conclusions"')) return 'competitor_analysis';
  throw new Error('Unexpected deterministic E2E provider call.');
}

function requestedIds(prompt: string, key: string, count: number): readonly string[] {
  const start = prompt.lastIndexOf(`"${key}"`);
  const values =
    start < 0
      ? []
      : (prompt
          .slice(start)
          .match(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gu) ?? []);
  if (values.length < count) throw new Error(`E2E prompt omitted ${key}.`);
  return values.slice(0, count);
}

function contextIds(prompt: string, key: string, count: number): readonly string[] {
  const values = idsFromContext(prompt, key);
  if (values.length < count) throw new Error(`E2E prompt omitted ${key}.`);
  return values.slice(0, count);
}

function idsFromContext(prompt: string, key: string): readonly string[] {
  const start = prompt.lastIndexOf(`KEY=${key}]`);
  const end = start < 0 ? -1 : prompt.indexOf('\nEND_EXTERNAL_UNTRUSTED_DATA_', start);
  const values =
    start < 0
      ? []
      : (prompt
          .slice(start, end < 0 ? undefined : end)
          .match(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gu) ?? []);
  return values;
}
