import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { RulePackRecord, RulePacksApplication } from '@eaw/application';
import { describe, expect, it } from 'vitest';

import { ensureDefaultRulePacks } from './default-rule-packs.js';

type DefaultRulePort = Pick<RulePacksApplication, 'import' | 'list'>;

describe('default rule-pack installation', () => {
  it('installs the bundled incomplete pack once without activating it', async () => {
    const rules = createMemoryRules();

    await ensureDefaultRulePacks(rules);
    await ensureDefaultRulePacks(rules);

    const installed = await rules.list('pinduoduo', 'CN');
    expect(installed).toHaveLength(1);
    expect(installed[0]).toMatchObject({
      active: false,
      activatedAt: null,
      pack: {
        manifest: {
          platformId: 'pinduoduo',
          region: 'CN',
        },
      },
    });
    expect(installed[0]?.pack.rules.every(({ status }) => status === 'needs_review')).toBe(true);
  });

  it('preserves an existing exact bundled version and its installation metadata', async () => {
    const bundled = await readBundledPack();
    const installedAt = new Date('2026-01-02T03:04:05.000Z');
    const existing: RulePackRecord = {
      id: 'existing-pack',
      pack: bundled,
      installedAt,
      activatedAt: null,
      active: false,
    };
    const rules = createMemoryRules([existing]);

    await ensureDefaultRulePacks(rules);

    expect(await rules.list('pinduoduo', 'CN')).toEqual([existing]);
  });

  it('rejects a bundled version whose persisted checksum differs', async () => {
    const bundled = await readBundledPack();
    const drifted: RulePackRecord = {
      id: 'drifted-pack',
      pack: {
        ...bundled,
        manifest: { ...bundled.manifest, checksum: '0'.repeat(64) },
      },
      installedAt: new Date('2026-01-02T03:04:05.000Z'),
      activatedAt: null,
      active: false,
    };
    const rules = createMemoryRules([drifted]);

    await expect(ensureDefaultRulePacks(rules)).rejects.toThrow(
      'Bundled rule pack checksum changed without a version change.',
    );
    expect(await rules.list('pinduoduo', 'CN')).toEqual([drifted]);
  });
});

function createMemoryRules(initial: readonly RulePackRecord[] = []): DefaultRulePort {
  const records = [...initial];
  return {
    async import(input) {
      const serialized = typeof input === 'string' ? input : new TextDecoder().decode(input);
      const record: RulePackRecord = {
        id: `installed-${records.length + 1}`,
        pack: JSON.parse(serialized) as RulePackRecord['pack'],
        installedAt: new Date('2026-01-02T03:04:05.000Z'),
        activatedAt: null,
        active: false,
      };
      records.push(record);
      return record;
    },
    async list(platformId, region) {
      return records.filter(
        ({ pack }) => pack.manifest.platformId === platformId && pack.manifest.region === region,
      );
    },
  };
}

async function readBundledPack(): Promise<RulePackRecord['pack']> {
  const directory = new URL('../../../default-rule-packs/pinduoduo-cn/', import.meta.url);
  const [manifest, rules] = await Promise.all([
    readFile(fileURLToPath(new URL('manifest.json', directory)), 'utf8'),
    readFile(fileURLToPath(new URL('rules.json', directory)), 'utf8'),
  ]);
  return {
    manifest: JSON.parse(manifest) as RulePackRecord['pack']['manifest'],
    rules: JSON.parse(rules) as RulePackRecord['pack']['rules'],
  };
}
