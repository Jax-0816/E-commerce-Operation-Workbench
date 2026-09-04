import { DomainError } from '@eaw/domain';
import type { z } from 'zod';

import type { AIProvider, ProviderRequest, ProviderResponse } from './provider.js';

export interface ValidatedGeneration<T> {
  readonly status: 'verified' | 'needs_review';
  readonly value: T | null;
  readonly issues: readonly string[];
  readonly response: ProviderResponse;
  readonly repairAttempted: boolean;
}

export interface GenerationReview<T> {
  readonly value: T;
  readonly issues: readonly string[];
}

export async function generateValidated<T>(input: {
  readonly provider: AIProvider;
  readonly request: ProviderRequest;
  readonly schema: z.ZodType<T>;
  readonly validate?: (value: T) => readonly string[];
  readonly review?: (value: T) => GenerationReview<T>;
}): Promise<ValidatedGeneration<T>> {
  let response = await input.provider.generate({ ...input.request, responseFormat: 'json' });
  let parsed = parseStructured(response.content, input.schema);
  let repairAttempted = false;
  if (!parsed.success) {
    repairAttempted = true;
    response = await input.provider.generate(repairRequest(input.request, response.content));
    parsed = parseStructured(response.content, input.schema);
  }
  if (!parsed.success) {
    throw new DomainError('AI_OUTPUT_INVALID', 'AI output remained invalid after one repair.');
  }
  const reviewed = input.review?.(parsed.value);
  const value = reviewed?.value ?? parsed.value;
  const issues = [...(reviewed?.issues ?? input.validate?.(value) ?? [])];
  if (issues.length > 0) {
    return {
      status: 'needs_review',
      value: reviewed === undefined ? null : value,
      issues,
      response,
      repairAttempted,
    };
  }
  return { status: 'verified', value, issues: [], response, repairAttempted };
}

function parseStructured<T>(content: string, schema: z.ZodType<T>) {
  if (content.length > 1_000_000) return { success: false as const };
  try {
    const parsed: unknown = JSON.parse(content);
    const result = schema.safeParse(parsed);
    return result.success
      ? { success: true as const, value: result.data }
      : { success: false as const };
  } catch {
    return { success: false as const };
  }
}

function repairRequest(request: ProviderRequest, invalidContent: string): ProviderRequest {
  return {
    ...request,
    responseFormat: 'json',
    messages: [
      ...request.messages,
      { role: 'assistant', content: invalidContent.slice(0, 100_000) },
      {
        role: 'user',
        content: '修复上一条输出：只返回符合既定 JSON Schema 的 JSON，不要解释。',
      },
    ],
  };
}
