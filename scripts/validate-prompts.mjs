import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  calculateTemplateHash,
  compilePrompt,
  PromptTemplateSchema,
} from '../packages/prompt-engine/dist/index.js';

const directory = resolve('default-prompts');
const filenames = (await readdir(directory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));
const versions = new Set();
const hashes = new Set();

for (const filename of filenames) {
  const template = PromptTemplateSchema.parse(
    JSON.parse(await readFile(resolve(directory, filename), 'utf8')),
  );
  const versionKey = `${template.templateId}@${template.version}`;
  const hash = calculateTemplateHash(template);
  if (versions.has(versionKey)) throw new Error(`Duplicate prompt version: ${versionKey}`);
  if (hashes.has(hash)) throw new Error(`Duplicate prompt hash: ${hash}`);
  versions.add(versionKey);
  hashes.add(hash);
  compilePrompt({ template, contexts: [], dependencies: {} });
  process.stdout.write(`validated ${versionKey} (${hash.slice(0, 12)})\n`);
}

if (filenames.length === 0) throw new Error('No default prompts found.');
