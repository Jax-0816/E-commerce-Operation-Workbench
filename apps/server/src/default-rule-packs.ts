import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { RulePacksApplication } from '@eaw/application';
import { loadRulePack } from '@eaw/rule-engine';
import { APP_VERSION } from '@eaw/shared';

type DefaultRulePort = Pick<RulePacksApplication, 'import' | 'list'>;

export async function ensureDefaultRulePacks(rules: DefaultRulePort): Promise<void> {
  const directory = new URL('../../../default-rule-packs/pinduoduo-cn/', import.meta.url);
  const [manifest, definitions] = await Promise.all([
    readFile(fileURLToPath(new URL('manifest.json', directory)), 'utf8'),
    readFile(fileURLToPath(new URL('rules.json', directory)), 'utf8'),
  ]);
  const serialized = JSON.stringify({
    manifest: JSON.parse(manifest) as unknown,
    rules: JSON.parse(definitions) as unknown,
  });
  const bundled = loadRulePack(serialized, { appVersion: APP_VERSION });
  const installed = await rules.list(bundled.manifest.platformId, bundled.manifest.region);
  const sameVersion = installed.find(
    ({ pack }) => pack.manifest.version === bundled.manifest.version,
  );

  if (
    sameVersion !== undefined &&
    sameVersion.pack.manifest.checksum !== bundled.manifest.checksum
  ) {
    throw new Error('Bundled rule pack checksum changed without a version change.');
  }
  if (sameVersion === undefined) {
    await rules.import(serialized);
  }
}
