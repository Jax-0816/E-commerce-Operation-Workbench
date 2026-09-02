import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compilePrompt } from './compiler.js';
import { PromptTemplateSchema } from './template.js';

describe('default prompts', () => {
  it('keeps the competitor analysis template compilation snapshot stable', async () => {
    const path = fileURLToPath(
      new URL('../../../default-prompts/competitor-analysis.v1.json', import.meta.url),
    );
    const template = PromptTemplateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    const compiled = compilePrompt({ template, contexts: [], dependencies: {} });

    expect({
      templateId: compiled.templateId,
      version: compiled.version,
      templateHash: compiled.templateHash,
      dependencyHash: compiled.dependencyHash,
      inputHash: compiled.inputHash,
    }).toMatchInlineSnapshot(`
      {
        "dependencyHash": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "inputHash": "0222828263993fd28af253d1ecbea5fcb624df993dcd79f2147fed9f04784895",
        "templateHash": "7be2892fedf9be97c97ecf191cf2c76a158f100df379d4971ea5d721e2236981",
        "templateId": "competitor-analysis",
        "version": "1.0.0",
      }
    `);
  });
});
