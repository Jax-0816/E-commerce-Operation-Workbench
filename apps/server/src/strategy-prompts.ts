import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { DrizzlePromptRepository } from '@eaw/database';
import { createUuidV7 } from '@eaw/domain';
import { PromptTemplateSchema } from '@eaw/prompt-engine';

const promptFiles = [
  'competitor-analysis.v1.json',
  'market-insight.v1.json',
  'selling-point-set.v1.json',
] as const;

export async function ensureStrategyPrompts(repository: DrizzlePromptRepository): Promise<void> {
  for (const filename of promptFiles) {
    const path = fileURLToPath(new URL(`../../../default-prompts/${filename}`, import.meta.url));
    const template = PromptTemplateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    const installed = await repository.list(template.templateId);
    const target =
      installed.find(({ template: candidate }) => candidate.version === template.version) ??
      (await repository.install({ id: createUuidV7(), template, installedAt: new Date() }));
    if (!target.active) await repository.activate(target.id, new Date());
  }
}
