import type { z } from 'zod';

import type { AIProvider, ProviderRequest } from './provider.js';
import { generateValidated, type ValidatedGeneration } from './structured.js';

export type GenerationStatus = 'verified' | 'needs_review' | 'failed';

export interface AIGenerationLog {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly task: string;
  readonly promptTemplateId: string;
  readonly promptVersion: string;
  readonly inputHash: string;
  readonly requestSnapshot: unknown;
  readonly rawResponse: string | null;
  readonly parsedResponse: unknown;
  readonly status: GenerationStatus;
  readonly error: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

interface CreateGenerationLogInput extends AIGenerationLog {
  readonly secretValues: readonly string[];
}

export interface AIGenerationLogPort {
  append(log: AIGenerationLog): Promise<void>;
}

export interface GenerateAndLogInput<T> {
  readonly id: string;
  readonly provider: AIProvider;
  readonly request: ProviderRequest;
  readonly schema: z.ZodType<T>;
  readonly validate?: (value: T) => readonly string[];
  readonly task: string;
  readonly promptTemplateId: string;
  readonly promptVersion: string;
  readonly inputHash: string;
  readonly secretValues: readonly string[];
  readonly logs: AIGenerationLogPort;
  readonly now?: () => Date;
}

const sensitiveKey = /(?:authorization|api[-_]?key|secret|token|password)/iu;
const bearer = /Bearer\s+[A-Za-z0-9._~+/=-]+/giu;

export function createSanitizedGenerationLog(input: CreateGenerationLogInput): AIGenerationLog {
  const secrets = input.secretValues.filter((value) => value.length > 0);
  const redactText = (value: string): string =>
    secrets.reduce(
      (redacted, secret) => redacted.split(secret).join('[REDACTED]'),
      value.replace(bearer, '[REDACTED]'),
    );
  const sanitize = (value: unknown, key = ''): unknown => {
    if (sensitiveKey.test(key)) return '[REDACTED]';
    if (typeof value === 'string') return redactText(value);
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map((item) => sanitize(item));
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
          childKey,
          sanitize(child, childKey),
        ]),
      );
    }
    return null;
  };
  const log: AIGenerationLog = {
    id: requiredString(input.id),
    provider: requiredString(input.provider),
    model: requiredString(input.model),
    task: requiredString(input.task),
    promptTemplateId: requiredString(input.promptTemplateId),
    promptVersion: requiredString(input.promptVersion),
    inputHash: sha256String(input.inputHash),
    requestSnapshot: sanitize(input.requestSnapshot),
    rawResponse: input.rawResponse === null ? null : redactText(input.rawResponse),
    parsedResponse: sanitize(input.parsedResponse),
    status: input.status,
    error: input.error === null ? null : redactText(input.error),
    inputTokens: nonnegativeInteger(input.inputTokens),
    outputTokens: nonnegativeInteger(input.outputTokens),
    startedAt: validDate(input.startedAt),
    finishedAt: validDate(input.finishedAt),
  };
  if (log.finishedAt.getTime() < log.startedAt.getTime()) {
    throw new TypeError('Generation finish time predates its start time.');
  }
  return deepFreeze(log);
}

export async function generateAndLog<T>(
  input: GenerateAndLogInput<T>,
): Promise<ValidatedGeneration<T>> {
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  let result: ValidatedGeneration<T>;
  try {
    result = await generateValidated({
      provider: input.provider,
      request: input.request,
      schema: input.schema,
      validate: input.validate,
    });
  } catch (error) {
    await input.logs.append(
      createSanitizedGenerationLog({
        ...baseLogFields(input),
        requestSnapshot: input.request,
        rawResponse: null,
        parsedResponse: null,
        status: 'failed',
        error: error instanceof Error ? error.message : 'AI generation failed.',
        inputTokens: 0,
        outputTokens: 0,
        startedAt,
        finishedAt: now(),
        secretValues: input.secretValues,
      }),
    );
    throw error;
  }

  await input.logs.append(
    createSanitizedGenerationLog({
      ...baseLogFields(input),
      requestSnapshot: input.request,
      rawResponse: result.response.content,
      parsedResponse: result.value,
      status: result.status,
      error: null,
      inputTokens: result.response.usage.inputTokens,
      outputTokens: result.response.usage.outputTokens,
      startedAt,
      finishedAt: now(),
      secretValues: input.secretValues,
    }),
  );
  return result;
}

function baseLogFields<T>(input: GenerateAndLogInput<T>) {
  return {
    id: input.id,
    provider: input.provider.id,
    model: input.request.model,
    task: input.task,
    promptTemplateId: input.promptTemplateId,
    promptVersion: input.promptVersion,
    inputHash: input.inputHash,
  };
}

function deepFreeze<T>(input: T): T {
  if (input !== null && typeof input === 'object' && !Object.isFrozen(input)) {
    Object.freeze(input);
    for (const value of Object.values(input)) deepFreeze(value);
  }
  return input;
}

function requiredString(value: string): string {
  if (!value.trim()) throw new TypeError('Generation log string is required.');
  return value;
}

function sha256String(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new TypeError('Generation input hash is invalid.');
  return value;
}

function nonnegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Token count is invalid.');
  return value;
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) throw new TypeError('Generation time is invalid.');
  return new Date(value);
}
