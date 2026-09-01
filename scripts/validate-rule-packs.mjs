import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { loadRulePack, resolveRules } from '../packages/rule-engine/dist/index.js';

const root = resolve('default-rule-packs');
const entries = await readdir(root, { withFileTypes: true });
let validated = 0;

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const directory = join(root, entry.name);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const rules = JSON.parse(await readFile(join(directory, 'rules.json'), 'utf8'));
  const pack = loadRulePack(JSON.stringify({ manifest, rules }), { appVersion: '0.1.0' });
  const resolved = resolveRules({
    platformId: pack.manifest.platformId,
    categoryCode: null,
    rules: pack.rules,
    now: new Date(pack.manifest.verifiedAt),
  });
  if (
    resolved.status === 'verified' &&
    resolved.rules.some(({ impact }) => impact === 'financial')
  ) {
    throw new Error(
      `${entry.name}: default financial rules may not become verified without review.`,
    );
  }
  validated += 1;
  process.stdout.write(`validated ${entry.name}@${pack.manifest.version} (${resolved.status})\n`);
}

if (validated === 0) throw new Error('No default rule packs found.');
