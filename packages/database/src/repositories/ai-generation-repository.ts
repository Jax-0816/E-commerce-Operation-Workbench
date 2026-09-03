import { createSanitizedGenerationLog, type AIGenerationLog } from '@eaw/ai-engine';
import { DomainError } from '@eaw/domain';

import type { OpenDatabase } from '../client.js';

type Row = Record<string, unknown>;

export class DrizzleAIGenerationRepository {
  constructor(private readonly database: OpenDatabase) {}

  async append(log: AIGenerationLog): Promise<void> {
    const validated = createSanitizedGenerationLog({ ...log, secretValues: [] });
    this.database.sqlite
      .prepare(
        'INSERT INTO ai_generations (id, provider, model, task, prompt_template_id, prompt_version, input_hash, request_json, raw_response, parsed_response_json, status, error, input_tokens, output_tokens, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        validated.id,
        validated.provider,
        validated.model,
        validated.task,
        validated.promptTemplateId,
        validated.promptVersion,
        validated.inputHash,
        JSON.stringify(validated.requestSnapshot),
        validated.rawResponse,
        JSON.stringify(validated.parsedResponse),
        validated.status,
        validated.error,
        validated.inputTokens,
        validated.outputTokens,
        validated.startedAt.getTime(),
        validated.finishedAt.getTime(),
      );
  }

  async findById(id: string): Promise<AIGenerationLog | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM ai_generations WHERE id = ?')
      .get(requiredString(id)) as Row | undefined;
    return row === undefined ? undefined : toLog(row);
  }

  async listByTask(task: string): Promise<readonly AIGenerationLog[]> {
    const rows = this.database.sqlite
      .prepare('SELECT * FROM ai_generations WHERE task = ? ORDER BY started_at DESC, id DESC')
      .all(requiredString(task)) as Row[];
    return rows.map(toLog);
  }
}

function toLog(row: Row): AIGenerationLog {
  try {
    return createSanitizedGenerationLog({
      id: requiredString(row.id),
      provider: requiredString(row.provider),
      model: requiredString(row.model),
      task: requiredString(row.task),
      promptTemplateId: requiredString(row.prompt_template_id),
      promptVersion: requiredString(row.prompt_version),
      inputHash: requiredString(row.input_hash),
      requestSnapshot: parseJson(row.request_json),
      rawResponse: nullableString(row.raw_response),
      parsedResponse: parseJson(row.parsed_response_json),
      status: status(row.status),
      error: nullableString(row.error),
      inputTokens: integer(row.input_tokens),
      outputTokens: integer(row.output_tokens),
      startedAt: timestamp(row.started_at),
      finishedAt: timestamp(row.finished_at),
      secretValues: [],
    });
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Persisted AI generation log is invalid.');
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') throw new TypeError('Expected JSON text.');
  return JSON.parse(value);
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Expected text.');
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value;
  throw new TypeError('Expected nullable text.');
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Expected nonnegative integer.');
  }
  return value;
}

function timestamp(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError('Expected timestamp.');
  }
  return new Date(value);
}

function status(value: unknown): AIGenerationLog['status'] {
  if (value === 'verified' || value === 'needs_review' || value === 'failed') return value;
  throw new TypeError('Expected generation status.');
}
