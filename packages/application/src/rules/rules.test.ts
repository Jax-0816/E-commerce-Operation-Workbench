import { describe, expect, it } from 'vitest';

import {
  calculateRulePackChecksum,
  type JsonValue,
  type RuleDefinition,
  type RulePack,
  type UnsignedRulePack,
} from '@eaw/rule-engine';

import { createRulePacksApplication, type RuleRepositoryPort } from './index.js';

describe('rule packs application', () => {
  it('imports inert data, activates it, and creates an auditable snapshot', async () => {
    const repository = new FakeRuleRepository();
    const application = createRulePacksApplication({
      repository,
      appVersion: '0.1.0',
      idFactory: ids(),
      now: () => date(1),
    });

    const imported = await application.import(JSON.stringify(pack('2026.9.0', 100)));
    expect(imported).toMatchObject({ active: false, pack: { manifest: { version: '2026.9.0' } } });
    await application.activate(imported.id);
    const snapshot = await application.createSnapshot({
      platformId: 'pinduoduo',
      region: 'CN',
      categoryCode: null,
    });
    expect(snapshot.snapshot).toMatchObject({
      platformId: 'pinduoduo',
      status: 'verified',
      rules: [{ key: 'commission', config: { rateBasisPoints: 100 } }],
    });
    expect(snapshot.rulePackId).toBe(imported.id);
  });

  it('reports a deterministic diff between installed versions', async () => {
    const repository = new FakeRuleRepository();
    const application = createRulePacksApplication({
      repository,
      appVersion: '0.1.0',
      idFactory: ids(),
      now: () => date(1),
    });
    const before = await application.import(JSON.stringify(pack('2026.9.0', 100)));
    const after = await application.import(JSON.stringify(pack('2026.9.1', 125)));

    expect(await application.diff(before.id, after.id)).toMatchObject({
      changed: [{ key: 'commission' }],
      added: [],
      removed: [],
    });
  });

  it('rejects snapshot creation when no active compatible pack exists', async () => {
    const application = createRulePacksApplication({
      repository: new FakeRuleRepository(),
      appVersion: '0.1.0',
      idFactory: ids(),
      now: () => date(1),
    });
    await expect(
      application.createSnapshot({
        platformId: 'pinduoduo',
        region: 'CN',
        categoryCode: null,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

class FakeRuleRepository implements RuleRepositoryPort {
  private readonly packs = new Map<string, Awaited<ReturnType<RuleRepositoryPort['install']>>>();
  private readonly snapshots = new Map<
    string,
    Awaited<ReturnType<RuleRepositoryPort['saveSnapshot']>>
  >();

  async install(input: Parameters<RuleRepositoryPort['install']>[0]) {
    const stored = {
      ...input,
      activatedAt: null,
      active: false,
    };
    this.packs.set(input.id, stored);
    return stored;
  }

  async activate(id: string, activatedAt: Date) {
    const target = this.packs.get(id);
    if (!target) return undefined;
    for (const [key, value] of this.packs) {
      if (
        value.pack.manifest.platformId === target.pack.manifest.platformId &&
        value.pack.manifest.region === target.pack.manifest.region
      ) {
        this.packs.set(key, { ...value, active: false, activatedAt: null });
      }
    }
    const active = { ...target, active: true, activatedAt };
    this.packs.set(id, active);
    return active;
  }

  async findById(id: string) {
    return this.packs.get(id);
  }

  async findActive(platformId: RulePack['manifest']['platformId'], region: string) {
    return [...this.packs.values()].find(
      (item) =>
        item.active &&
        item.pack.manifest.platformId === platformId &&
        item.pack.manifest.region === region,
    );
  }

  async list(platformId: RulePack['manifest']['platformId'], region: string) {
    return [...this.packs.values()].filter(
      (item) =>
        item.pack.manifest.platformId === platformId && item.pack.manifest.region === region,
    );
  }

  async listOverrides() {
    return [];
  }

  async saveSnapshot(input: Parameters<RuleRepositoryPort['saveSnapshot']>[0]) {
    const stored = input;
    this.snapshots.set(input.id, stored);
    return stored;
  }

  async findSnapshot(id: string) {
    return this.snapshots.get(id);
  }
}

function pack(version: string, rateBasisPoints: number): RulePack {
  const unsigned: UnsignedRulePack = {
    manifest: {
      schemaVersion: '1',
      platformId: 'pinduoduo',
      region: 'CN',
      version,
      publisher: 'Ecommerce AI Workbench',
      verifiedAt: date(0).toISOString(),
      minimumAppVersion: '0.1.0',
      description: '测试规则包',
    },
    rules: [rule({ rateBasisPoints })],
  };
  return {
    manifest: { ...unsigned.manifest, checksum: calculateRulePackChecksum(unsigned) },
    rules: [...unsigned.rules],
  };
}

function rule(config: Record<string, JsonValue>): RuleDefinition {
  return {
    key: 'commission',
    type: 'financial',
    scope: { level: 'platform' },
    provenance: { url: 'https://example.invalid', title: '测试来源', type: 'documentation' },
    verifiedAt: date(0).toISOString(),
    effectiveFrom: date(0).toISOString(),
    expiresAt: null,
    status: 'verified',
    summary: '测试规则',
    implementationNote: '测试规则',
    config,
    impact: 'financial',
  };
}

function ids(): () => string {
  let current = 0;
  return () => `id-${(current += 1)}`;
}

function date(day: number): Date {
  return new Date(`2026-09-${String(day + 1).padStart(2, '0')}T00:00:00.000Z`);
}
