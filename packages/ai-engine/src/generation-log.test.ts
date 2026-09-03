import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AIProvider, ProviderRequest } from './provider.js';
import { createSanitizedGenerationLog, generateAndLog } from './generation-log.js';
import { validateEvidenceReferences } from './validators.js';

describe('AI validation and generation logging', () => {
  it('rejects cross-product references, unknown evidence and unsupported claims', () => {
    expect(
      validateEvidenceReferences(
        { productId: 'other-product', evidenceRefs: ['fact-1', 'unknown'] },
        { productId: 'product-1', allowedEvidenceRefs: new Set(['fact-1']) },
      ),
    ).toEqual(['cross_product_reference', 'unsupported_evidence']);
    expect(
      validateEvidenceReferences(
        { productId: 'product-1', evidenceRefs: [] },
        { productId: 'product-1', allowedEvidenceRefs: new Set(['fact-1']) },
      ),
    ).toEqual(['unsupported_claim']);
  });

  it('deeply redacts secrets and authorization values before producing an immutable log', () => {
    const secret = 'sk-sensitive-value';
    const log = createSanitizedGenerationLog({
      id: 'generation-1',
      provider: 'deepseek',
      model: 'deepseek-chat',
      task: 'competitor_analysis',
      promptTemplateId: 'competitor-analysis',
      promptVersion: '1.0.0',
      inputHash: 'a'.repeat(64),
      requestSnapshot: {
        headers: { Authorization: `Bearer ${secret}` },
        messages: [{ content: `accidental ${secret}` }],
      },
      rawResponse: `{"echo":"${secret}"}`,
      parsedResponse: { nested: { token: secret, ok: true } },
      status: 'failed',
      error: `upstream echoed ${secret}`,
      inputTokens: 10,
      outputTokens: 0,
      startedAt: new Date('2026-09-03T00:00:00.000Z'),
      finishedAt: new Date('2026-09-03T00:00:01.000Z'),
      secretValues: [secret],
    });

    expect(JSON.stringify(log)).not.toContain(secret);
    expect(JSON.stringify(log)).not.toContain('Bearer');
    expect(log.requestSnapshot).toMatchObject({ headers: { Authorization: '[REDACTED]' } });
    expect(() => ((log.requestSnapshot as Record<string, unknown>).changed = true)).toThrow();
  });

  it('persists a sanitized immutable log for every validated generation', async () => {
    const secret = 'sk-provider-secret';
    const logs: ReturnType<typeof createSanitizedGenerationLog>[] = [];
    const provider: AIProvider = {
      id: 'fake',
      async generate(request) {
        return {
          provider: 'fake',
          responseId: 'response-1',
          model: request.model,
          content: `{"summary":"result ${secret}"}`,
          usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
        };
      },
      async testConnection() {
        return true;
      },
      getCapabilities() {
        return { text: true, structured: true };
      },
    };
    const request: ProviderRequest = {
      model: 'fake-model',
      messages: [{ role: 'user', content: `input ${secret}` }],
      temperature: 0,
    };

    const result = await generateAndLog({
      id: 'generation-2',
      provider,
      request,
      schema: z.object({ summary: z.string() }).strict(),
      task: 'competitor_analysis',
      promptTemplateId: 'competitor-analysis',
      promptVersion: '1.0.0',
      inputHash: 'b'.repeat(64),
      secretValues: [secret],
      logs: { append: async (log) => void logs.push(log) },
      now: (() => {
        const times = [new Date('2026-09-03T00:00:00.000Z'), new Date('2026-09-03T00:00:01.000Z')];
        return () => times.shift()!;
      })(),
    });

    expect(result.status).toBe('verified');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 'verified', inputTokens: 4, outputTokens: 2 });
    expect(JSON.stringify(logs[0])).not.toContain(secret);
  });

  it('persists a failed log when structured output remains invalid', async () => {
    const logs: ReturnType<typeof createSanitizedGenerationLog>[] = [];
    const provider: AIProvider = {
      id: 'fake',
      async generate(request) {
        return {
          provider: 'fake',
          responseId: 'bad',
          model: request.model,
          content: 'not-json',
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
    await expect(
      generateAndLog({
        id: 'generation-failed',
        provider,
        request: {
          model: 'fake-model',
          messages: [{ role: 'user', content: 'x' }],
          temperature: 0,
        },
        schema: z.object({ summary: z.string() }).strict(),
        task: 'competitor_analysis',
        promptTemplateId: 'competitor-analysis',
        promptVersion: '1.0.0',
        inputHash: 'c'.repeat(64),
        secretValues: [],
        logs: { append: async (log) => void logs.push(log) },
        now: () => new Date('2026-09-03T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 'failed', parsedResponse: null });
  });
});
