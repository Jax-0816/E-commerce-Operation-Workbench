import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSanitizedGenerationLog } from '@eaw/ai-engine';
import type { PromptTemplate } from '@eaw/prompt-engine';
import { afterEach, describe, expect, it } from 'vitest';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzleAIGenerationRepository } from './ai-generation-repository.js';
import { DrizzlePromptRepository } from './prompt-repository.js';

const directories: string[] = [];
const migrationsDirectory = fileURLToPath(new URL('../../../../migrations/', import.meta.url));

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('AI generation repository', () => {
  it('round-trips an immutable sanitized log without persisting its API key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eaw-ai-generation-'));
    directories.push(directory);
    const database = openDatabase(join(directory, 'database.sqlite'));
    await migrateDatabase(database, migrationsDirectory);
    const repository = new DrizzleAIGenerationRepository(database);
    await new DrizzlePromptRepository(database).install({
      id: 'prompt-1',
      template: prompt(),
      installedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    const secret = 'sk-never-in-sqlite';
    const log = createSanitizedGenerationLog({
      id: 'generation-1',
      provider: 'deepseek',
      model: 'deepseek-chat',
      task: 'competitor_analysis',
      promptTemplateId: 'competitor-analysis',
      promptVersion: '1.0.0',
      inputHash: 'a'.repeat(64),
      requestSnapshot: { authorization: `Bearer ${secret}`, prompt: '分析' },
      rawResponse: `response ${secret}`,
      parsedResponse: { summary: '结果' },
      status: 'verified',
      error: null,
      inputTokens: 8,
      outputTokens: 3,
      startedAt: new Date('2026-09-03T00:00:00.000Z'),
      finishedAt: new Date('2026-09-03T00:00:01.000Z'),
      secretValues: [secret],
    });

    await repository.append(log);

    expect(await repository.findById('generation-1')).toEqual(log);
    expect(
      JSON.stringify(database.sqlite.prepare('SELECT * FROM ai_generations').get()),
    ).not.toContain(secret);
    expect(() =>
      database.sqlite
        .prepare('UPDATE ai_generations SET status = ? WHERE id = ?')
        .run('failed', 'generation-1'),
    ).toThrow(/immutable/u);
    database.close();
  });

  it('rejects a generation that references a prompt version not installed locally', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eaw-ai-generation-orphan-'));
    directories.push(directory);
    const database = openDatabase(join(directory, 'database.sqlite'));
    await migrateDatabase(database, migrationsDirectory);
    const repository = new DrizzleAIGenerationRepository(database);

    await expect(repository.append(generation())).rejects.toThrow();
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM ai_generations').get()).toEqual({
      count: 0,
    });
    database.close();
  });
});

function generation() {
  return createSanitizedGenerationLog({
    id: 'orphan-generation',
    provider: 'deepseek',
    model: 'deepseek-chat',
    task: 'competitor_analysis',
    promptTemplateId: 'competitor-analysis',
    promptVersion: '1.0.0',
    inputHash: 'b'.repeat(64),
    requestSnapshot: {},
    rawResponse: null,
    parsedResponse: null,
    status: 'failed',
    error: 'test',
    inputTokens: 0,
    outputTokens: 0,
    startedAt: new Date('2026-09-03T00:00:00.000Z'),
    finishedAt: new Date('2026-09-03T00:00:00.000Z'),
    secretValues: [],
  });
}

function prompt(): PromptTemplate {
  return {
    schemaVersion: '1',
    templateId: 'competitor-analysis',
    task: 'competitor_analysis',
    version: '1.0.0',
    systemRole: '分析助手',
    taskContract: '只输出有证据的结论',
    outputSchema: { type: 'object' },
  };
}
