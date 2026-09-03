import { describe, expect, it } from 'vitest';

import { DeepSeekProvider } from './deepseek.js';

const request = {
  model: 'deepseek-chat',
  messages: [
    { role: 'system' as const, content: '只输出 JSON' },
    { role: 'user' as const, content: '分析商品' },
  ],
  temperature: 0,
};

describe('DeepSeek provider', () => {
  it('retries 429 and 5xx within the bound, then returns a sanitized response', async () => {
    const statuses = [429, 503, 200];
    const provider = new DeepSeekProvider({
      apiKey: 'secret-never-returned',
      fetch: async (_url, init) => {
        const status = statuses.shift() ?? 500;
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer secret-never-returned',
        );
        return status === 200
          ? Response.json({
              id: 'response-1',
              model: 'deepseek-chat',
              choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
            })
          : Response.json({ error: { message: `temporary ${status}` } }, { status });
      },
      sleep: async () => undefined,
      timeoutMs: 100,
      maxAttempts: 3,
    });

    const response = await provider.generate(request);

    expect(response).toEqual({
      provider: 'deepseek',
      responseId: 'response-1',
      model: 'deepseek-chat',
      content: '{"ok":true}',
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });
    expect(JSON.stringify(response)).not.toContain('secret-never-returned');
  });

  it('stops after the configured retry bound and redacts provider error bodies', async () => {
    let attempts = 0;
    const provider = new DeepSeekProvider({
      apiKey: 'sensitive-key',
      fetch: async () => {
        attempts += 1;
        return Response.json(
          { error: { message: 'upstream echoed sensitive-key' } },
          { status: 503 },
        );
      },
      sleep: async () => undefined,
      timeoutMs: 100,
      maxAttempts: 2,
    });

    await expect(provider.generate(request)).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(attempts).toBe(2);
    await expect(provider.generate(request)).rejects.not.toThrow(/sensitive-key/u);
  });

  it('aborts timed-out requests and stops at the configured retry bound', async () => {
    let attempts = 0;
    const provider = new DeepSeekProvider({
      apiKey: 'secret',
      fetch: async (_url, init) => {
        attempts += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        });
      },
      sleep: async () => undefined,
      timeoutMs: 5,
      maxAttempts: 3,
    });

    await expect(provider.generate(request)).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(attempts).toBe(3);
  });
});
