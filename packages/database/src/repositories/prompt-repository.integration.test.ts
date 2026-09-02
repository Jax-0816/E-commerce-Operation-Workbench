import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { calculateTemplateHash, type PromptTemplate } from '@eaw/prompt-engine';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzlePromptRepository } from './prompt-repository.js';

const directories: string[] = [];
const migrationsDirectory = fileURLToPath(new URL('../../../../migrations/', import.meta.url));

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('prompt repository', () => {
  it('installs immutable versions and changes activation without mutating templates', async () => {
    const { database, repository } = await fixture();
    const first = prompt('1.0.0', '第一版任务');
    const second = prompt('1.1.0', '第二版任务');
    await repository.install({ id: 'prompt-one', template: first, installedAt: date(1) });
    await repository.install({ id: 'prompt-two', template: second, installedAt: date(2) });

    await repository.activate('prompt-one', date(3));
    await repository.activate('prompt-two', date(4));

    expect(await repository.findActive('competitor-analysis')).toMatchObject({
      id: 'prompt-two',
      template: second,
      templateHash: calculateTemplateHash(second),
      activatedAt: date(4),
    });
    expect((await repository.list('competitor-analysis')).map(({ id }) => id)).toEqual([
      'prompt-two',
      'prompt-one',
    ]);
    expect(() =>
      database.sqlite
        .prepare('UPDATE prompt_templates SET template_json = ? WHERE id = ?')
        .run('{}', 'prompt-one'),
    ).toThrow(/immutable/u);
    database.close();
  });

  it('fails closed when persisted template data no longer matches its hash', async () => {
    const { database, repository } = await fixture();
    await repository.install({ id: 'prompt-one', template: prompt('1.0.0'), installedAt: date(1) });
    database.sqlite.exec('DROP TRIGGER prompt_templates_no_update');
    database.sqlite
      .prepare('UPDATE prompt_templates SET template_json = ? WHERE id = ?')
      .run(JSON.stringify(prompt('1.0.0', '被篡改')), 'prompt-one');

    await expect(repository.findById('prompt-one')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    database.close();
  });
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-prompt-repository-'));
  directories.push(directory);
  const database = openDatabase(join(directory, 'database.sqlite'));
  await migrateDatabase(database, migrationsDirectory);
  return { database, repository: new DrizzlePromptRepository(database) };
}

function prompt(version: string, taskContract = '分析竞品并列出证据。'): PromptTemplate {
  return {
    schemaVersion: '1',
    templateId: 'competitor-analysis',
    task: 'competitor_analysis',
    version,
    systemRole: '你是电商分析助手。',
    taskContract,
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['summary'],
      properties: { summary: { type: 'string' } },
    },
  };
}

function date(day: number): Date {
  return new Date(`2026-09-${String(day + 1).padStart(2, '0')}T00:00:00.000Z`);
}
