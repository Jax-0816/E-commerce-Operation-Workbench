import { DomainError } from '@eaw/domain';
import {
  calculateTemplateHash,
  PromptTemplateSchema,
  type PromptTemplate,
} from '@eaw/prompt-engine';

import type { OpenDatabase } from '../client.js';

type Row = Record<string, unknown>;

export interface StoredPromptTemplate {
  readonly id: string;
  readonly template: PromptTemplate;
  readonly templateHash: string;
  readonly installedAt: Date;
  readonly activatedAt: Date | null;
  readonly active: boolean;
}

export class DrizzlePromptRepository {
  constructor(private readonly database: OpenDatabase) {}

  async install(input: {
    readonly id: string;
    readonly template: PromptTemplate;
    readonly installedAt: Date;
  }): Promise<StoredPromptTemplate> {
    const template = PromptTemplateSchema.parse(input.template);
    const templateHash = calculateTemplateHash(template);
    const installedAt = validDate(input.installedAt);
    this.database.sqlite
      .prepare(
        'INSERT INTO prompt_templates (id, template_id, task, version, template_hash, template_json, installed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        requiredString(input.id),
        template.templateId,
        template.task,
        template.version,
        templateHash,
        JSON.stringify(template),
        installedAt.getTime(),
      );
    return {
      id: input.id,
      template: structuredClone(template),
      templateHash,
      installedAt,
      activatedAt: null,
      active: false,
    };
  }

  async activate(id: string, activatedAtInput: Date): Promise<StoredPromptTemplate | undefined> {
    const activatedAt = validDate(activatedAtInput);
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const target = this.database.sqlite
        .prepare('SELECT template_id FROM prompt_templates WHERE id = ?')
        .get(requiredString(id)) as Row | undefined;
      if (target === undefined) {
        this.database.sqlite.exec('ROLLBACK;');
        return undefined;
      }
      const templateId = requiredString(target.template_id);
      this.database.sqlite
        .prepare(
          'INSERT INTO prompt_activations (template_id, prompt_template_id, activated_at) VALUES (?, ?, ?) ON CONFLICT(template_id) DO UPDATE SET prompt_template_id = excluded.prompt_template_id, activated_at = excluded.activated_at',
        )
        .run(templateId, id, activatedAt.getTime());
      this.database.sqlite.exec('COMMIT;');
    } catch (error) {
      rollback(this.database);
      throw error;
    }
    return this.findById(id);
  }

  async findById(id: string): Promise<StoredPromptTemplate | undefined> {
    const row = this.database.sqlite
      .prepare(
        'SELECT p.*, a.activated_at FROM prompt_templates p LEFT JOIN prompt_activations a ON a.prompt_template_id = p.id WHERE p.id = ?',
      )
      .get(requiredString(id)) as Row | undefined;
    return row === undefined ? undefined : toStored(row);
  }

  async findActive(templateId: string): Promise<StoredPromptTemplate | undefined> {
    const row = this.database.sqlite
      .prepare(
        'SELECT p.*, a.activated_at FROM prompt_activations a JOIN prompt_templates p ON p.id = a.prompt_template_id WHERE a.template_id = ?',
      )
      .get(requiredString(templateId)) as Row | undefined;
    return row === undefined ? undefined : toStored(row);
  }

  async list(templateId: string): Promise<readonly StoredPromptTemplate[]> {
    const rows = this.database.sqlite
      .prepare(
        'SELECT p.*, a.activated_at FROM prompt_templates p LEFT JOIN prompt_activations a ON a.prompt_template_id = p.id WHERE p.template_id = ? ORDER BY p.installed_at DESC, p.id DESC',
      )
      .all(requiredString(templateId)) as Row[];
    return rows.map(toStored);
  }
}

function toStored(row: Row): StoredPromptTemplate {
  const template = PromptTemplateSchema.parse(parseJson(row.template_json));
  const templateHash = requiredString(row.template_hash);
  if (
    template.templateId !== row.template_id ||
    template.task !== row.task ||
    template.version !== row.version ||
    calculateTemplateHash(template) !== templateHash
  ) {
    invalid('Persisted prompt template metadata or hash is invalid.');
  }
  const activatedAt = row.activated_at === null ? null : timestamp(row.activated_at);
  return {
    id: requiredString(row.id),
    template: structuredClone(template),
    templateHash,
    installedAt: timestamp(row.installed_at),
    activatedAt,
    active: activatedAt !== null,
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') invalid();
  try {
    return JSON.parse(value);
  } catch {
    return invalid();
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) invalid();
  return new Date(value);
}

function timestamp(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalid();
  return new Date(value);
}

function invalid(message = 'Prompt persistence input is invalid.'): never {
  throw new DomainError('VALIDATION_ERROR', message);
}

function rollback(database: OpenDatabase): void {
  try {
    database.sqlite.exec('ROLLBACK;');
  } catch {
    // Preserve the original transaction failure.
  }
}
