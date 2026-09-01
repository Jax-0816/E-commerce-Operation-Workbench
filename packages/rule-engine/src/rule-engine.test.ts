import { describe, expect, it } from 'vitest';

import { DomainError } from '@eaw/domain';

import {
  calculateRulePackChecksum,
  createRuleSnapshot,
  diffRuleSnapshots,
  loadRulePack,
  resolveRules,
  RulePackSchema,
  type JsonValue,
  type RuleDefinition,
  type RulePack,
  type UnsignedRulePack,
} from './index.js';

describe('inert rule pack loading', () => {
  it('loads a compatible checksummed JSON pack and detaches it from input', () => {
    const pack = validPack();
    const loaded = loadRulePack(JSON.stringify(pack), { appVersion: '0.1.0' });
    expect(loaded.manifest.platformId).toBe('pinduoduo');
    expect(loaded.rules[0]?.status).toBe('needs_review');
    expect(Object.isFrozen(loaded.rules[0]?.config)).toBe(true);
  });

  it('loads the same inert pack from a stored ZIP archive', () => {
    const pack = validPack();
    const archive = storedZip([
      { name: 'manifest.json', contents: JSON.stringify(pack.manifest) },
      { name: 'rules.json', contents: JSON.stringify(pack.rules) },
      { name: 'README.md', contents: '# inert data only' },
    ]);
    const loaded = loadRulePack(archive, { appVersion: '0.1.0' });
    expect(loaded.sourceFormat).toBe('zip');
    expect(loaded.manifest.checksum).toBe(pack.manifest.checksum);
  });

  it('rejects checksum mismatch, incompatible versions, and executable data keys', () => {
    const pack = validPack();
    expect(() =>
      loadRulePack(
        JSON.stringify({ ...pack, manifest: { ...pack.manifest, checksum: '0'.repeat(64) } }),
        {
          appVersion: '0.1.0',
        },
      ),
    ).toThrowError(expect.objectContaining<Partial<DomainError>>({ code: 'VALIDATION_ERROR' }));
    expect(() => loadRulePack(JSON.stringify(pack), { appVersion: '0.0.9' })).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: 'VALIDATION_ERROR' }),
    );
    expect(() =>
      RulePackSchema.parse({
        ...pack,
        rules: [{ ...pack.rules[0], config: { handler: 'function () {}' } }],
      }),
    ).toThrow();
  });

  it.each(['../manifest.json', '/manifest.json', 'rules/run.js'])(
    'rejects unsafe ZIP entry %s before parsing content',
    (entryName) => {
      const archive = storedZip([{ name: entryName, contents: '{}' }]);
      expect(() => loadRulePack(archive, { appVersion: '0.1.0' })).toThrowError(
        expect.objectContaining<Partial<DomainError>>({ code: 'VALIDATION_ERROR' }),
      );
    },
  );
});

describe('rule resolution', () => {
  it('resolves user override, most-specific category, platform, then fallback', () => {
    const rules = [
      rule('shipping', 'platform', { value: 1 }),
      rule('shipping', 'category', { value: 2 }, 'home'),
      rule('shipping', 'category', { value: 3 }, 'home/cups'),
      rule('commission', 'platform', { value: 4 }),
    ];
    const resolved = resolveRules({
      platformId: 'pinduoduo',
      categoryCode: 'home/cups/vacuum',
      rules,
      overrides: [rule('shipping', 'user', { value: 5 })],
      applicationFallbacks: [rule('fallback_only', 'fallback', { value: 6 })],
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(Object.fromEntries(resolved.rules.map((item) => [item.key, item.config]))).toEqual({
      shipping: { value: 5 },
      commission: { value: 4 },
      fallback_only: { value: 6 },
    });
  });

  it('throws RULE_CONFLICT for different same-level winners', () => {
    expect(() =>
      resolveRules({
        platformId: 'pinduoduo',
        categoryCode: null,
        rules: [
          rule('commission', 'platform', { value: 1 }),
          rule('commission', 'platform', { value: 2 }),
        ],
        now: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).toThrowError(expect.objectContaining<Partial<DomainError>>({ code: 'RULE_CONFLICT' }));
  });

  it('marks expired or needs-review financial rules incomplete', () => {
    const expired = {
      ...rule('commission', 'platform', { value: 1 }),
      expiresAt: '2026-08-31T00:00:00.000Z',
      status: 'verified' as const,
    };
    const result = resolveRules({
      platformId: 'pinduoduo',
      categoryCode: null,
      rules: [expired, rule('service_fee', 'platform', { value: null })],
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(result.status).toBe('incomplete');
    expect(result.issues.map(({ code }) => code)).toEqual(['RULE_EXPIRED', 'RULE_NEEDS_REVIEW']);
  });
});

describe('immutable snapshots and diffs', () => {
  it('creates a detached frozen snapshot and reports changes deterministically', () => {
    const resolved = resolveRules({
      platformId: 'pinduoduo',
      categoryCode: null,
      rules: [rule('commission', 'platform', { value: 1 })],
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    const before = createRuleSnapshot(resolved);
    const after = createRuleSnapshot({
      ...resolved,
      rules: [
        rule('commission', 'platform', { value: 2 }),
        rule('shipping', 'platform', { value: 3 }),
      ],
    });
    expect(() => ((before.rules[0]!.config as { value: number }).value = 9)).toThrow();
    expect(diffRuleSnapshots(before, after)).toMatchObject({
      added: [{ key: 'shipping' }],
      removed: [],
      changed: [{ key: 'commission' }],
    });
    expect(before.hash).not.toBe(after.hash);
  });
});

function validPack(): RulePack {
  const unsigned: UnsignedRulePack = {
    manifest: {
      schemaVersion: '1',
      platformId: 'pinduoduo',
      region: 'CN',
      version: '2026.9.0',
      publisher: 'Ecommerce AI Workbench',
      verifiedAt: '2026-09-01T00:00:00.000Z',
      minimumAppVersion: '0.1.0',
      description: '未核实费率仅作待审核占位，不用于确定性计算。',
    },
    rules: [rule('commission', 'platform', { rateBasisPoints: null })],
  };
  return {
    manifest: { ...unsigned.manifest, checksum: calculateRulePackChecksum(unsigned) },
    rules: [...unsigned.rules],
  };
}

function rule(
  key: string,
  level: RuleDefinition['scope']['level'],
  config: Record<string, JsonValue>,
  categoryCode?: string,
): RuleDefinition {
  const scope: RuleDefinition['scope'] =
    level === 'category'
      ? { level, categoryCode: categoryCode ?? 'missing' }
      : level === 'platform'
        ? { level }
        : level === 'user'
          ? { level }
          : { level };
  return {
    key,
    type: 'financial',
    scope,
    provenance: {
      url: 'https://example.invalid/rules',
      title: '规则来源',
      type: 'documentation',
    },
    verifiedAt: '2026-09-01T00:00:00.000Z',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    expiresAt: null,
    status: 'needs_review',
    summary: '待人工核验',
    implementationNote: '未验证前禁止确定性计算',
    config,
    impact: 'financial',
  };
}

function storedZip(
  entries: readonly { readonly name: string; readonly contents: string }[],
): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const contents = Buffer.from(entry.contents);
    const local = Buffer.alloc(30 + name.length + contents.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(contents), 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    contents.copy(local, 30 + name.length);
    localParts.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(contents), 16);
    central.writeUInt32LE(contents.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
