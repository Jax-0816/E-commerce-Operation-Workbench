import { appendFile, writeFile } from 'node:fs/promises';

import type { AIProvider, ProviderRequest } from '@eaw/ai-engine';

import { createProductionApp } from '../src/runtime.js';
import { createServerStartupOptions } from '../src/startup.js';

const callLogPath = process.env.EAW_E2E_CALL_LOG;
if (!callLogPath) throw new Error('EAW_E2E_CALL_LOG is required for the deterministic E2E server.');
await writeFile(callLogPath, '', 'utf8');

const taskSequence = [
  'competitor_analysis',
  'market_insight',
  'selling_point_set',
  'title_generation',
  'creative_plan',
  'creative_plan',
  'detail_page',
] as const;
let callIndex = 0;
let creativeCalls = 0;

const providerFactory = (): AIProvider => ({
  id: 'e2e-fake',
  async generate(request) {
    const task = taskSequence[callIndex++];
    if (!task) throw new Error('Unexpected deterministic E2E provider call.');
    await appendFile(callLogPath, `${JSON.stringify({ task })}\n`, 'utf8');
    if (task === 'creative_plan' && creativeCalls++ === 0) {
      throw new Error('Intentional deterministic creative failure.');
    }
    const prompt = request.messages.map(({ content }) => content).join('\n');
    const productId = productIdFrom(request);
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

function workflowOutput(task: (typeof taskSequence)[number], productId: string, prompt: string) {
  if (task === 'competitor_analysis') return { productId, conclusions: [], limitations: [] };
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
        evidenceRefs: [],
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
      evidenceRefs: [],
      reviewTerms: [],
      locked: false,
    })),
  };
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
