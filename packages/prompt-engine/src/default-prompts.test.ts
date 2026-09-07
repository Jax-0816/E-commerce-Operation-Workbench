import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compilePrompt } from './compiler.js';
import { PromptTemplateSchema } from './template.js';

describe('default prompts', () => {
  it('compiles all default AI templates with stable identities', async () => {
    const names = [
      'competitor-analysis',
      'market-insight',
      'selling-point-set',
      'title-generation',
      'creative-plan',
      'creative-item',
      'detail-page',
    ];
    const compiled = await Promise.all(
      names.map(async (name) => {
        const path = fileURLToPath(
          new URL(`../../../default-prompts/${name}.v1.json`, import.meta.url),
        );
        const template = PromptTemplateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
        return compilePrompt({ template, contexts: [], dependencies: {} });
      }),
    );

    expect(
      compiled.map(({ templateId, task, version }) => ({ templateId, task, version })),
    ).toEqual([
      { templateId: 'competitor-analysis', task: 'competitor_analysis', version: '1.1.0' },
      { templateId: 'market-insight', task: 'market_insight', version: '1.0.0' },
      { templateId: 'selling-point-set', task: 'selling_point_set', version: '1.0.0' },
      { templateId: 'title-generation', task: 'title_generation', version: '1.0.0' },
      { templateId: 'creative-plan', task: 'creative_plan', version: '1.0.0' },
      { templateId: 'creative-item', task: 'creative_item', version: '1.0.0' },
      { templateId: 'detail-page', task: 'detail_page', version: '1.0.0' },
    ]);
    expect(
      compiled.every(
        ({ inputHash, templateHash }) => inputHash.length === 64 && templateHash.length === 64,
      ),
    ).toBe(true);
  });
});
