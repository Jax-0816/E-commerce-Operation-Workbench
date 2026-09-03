import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AIProvider, ProviderRequest, ProviderResponse } from './provider.js';
import { generateValidated } from './structured.js';

const OutputSchema = z
  .object({
    tone: z.enum(['factual', 'cautious']),
    evidenceRefs: z.array(z.string()),
    productId: z.string(),
  })
  .strict();

describe('structured generation', () => {
  it('permits exactly one repair for malformed JSON and returns the repaired value', async () => {
    const provider = new SequenceProvider([
      'not-json',
      '{"tone":"factual","evidenceRefs":["fact-1"],"productId":"product-1"}',
    ]);

    const result = await generateValidated({
      provider,
      request: request(),
      schema: OutputSchema,
      validate: (value) =>
        value.productId === 'product-1' && value.evidenceRefs.every((ref) => ref === 'fact-1')
          ? []
          : ['evidence_or_product_mismatch'],
    });

    expect(result.status).toBe('verified');
    expect(result.value).toEqual({
      tone: 'factual',
      evidenceRefs: ['fact-1'],
      productId: 'product-1',
    });
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.messages.at(-1)?.content).toContain('修复');
  });

  it.each([
    ['invalid JSON twice', ['bad', 'still bad']],
    ['invalid enum twice', ['{"tone":"salesy"}', '{"tone":"loud"}']],
  ])('rejects %s after one repair', async (_name, contents) => {
    const provider = new SequenceProvider(contents);
    await expect(
      generateValidated({ provider, request: request(), schema: OutputSchema }),
    ).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
    expect(provider.requests).toHaveLength(2);
  });

  it('marks cross-product or unsupported evidence as needs_review instead of verified', async () => {
    const provider = new SequenceProvider([
      '{"tone":"factual","evidenceRefs":["unknown"],"productId":"other-product"}',
    ]);
    const result = await generateValidated({
      provider,
      request: request(),
      schema: OutputSchema,
      validate: () => ['cross_product_reference', 'unsupported_evidence'],
    });

    expect(result).toMatchObject({
      status: 'needs_review',
      issues: ['cross_product_reference', 'unsupported_evidence'],
      value: null,
    });
    expect(provider.requests).toHaveLength(1);
  });
});

class SequenceProvider implements AIProvider {
  readonly id = 'fake';
  readonly requests: ProviderRequest[] = [];

  constructor(private readonly contents: string[]) {}

  async generate(requestInput: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(structuredClone(requestInput));
    return {
      provider: this.id,
      responseId: `response-${this.requests.length}`,
      model: requestInput.model,
      content: this.contents.shift() ?? '',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  getCapabilities() {
    return { text: true, structured: true } as const;
  }
}

function request(): ProviderRequest {
  return {
    model: 'fake-model',
    messages: [
      { role: 'system', content: '只输出 JSON' },
      { role: 'user', content: '生成结果' },
    ],
    temperature: 0,
  };
}
