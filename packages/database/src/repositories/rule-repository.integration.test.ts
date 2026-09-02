import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  calculateRulePackChecksum,
  createRuleSnapshot,
  loadRulePack,
  resolveRules,
  type JsonValue,
  type RuleDefinition,
  type RulePack,
  type UnsignedRulePack,
} from '@eaw/rule-engine';

import { migrateDatabase, openDatabase } from '../index.js';
import { DrizzleRuleRepository } from './rule-repository.js';

const directories: string[] = [];
const migrationsDirectory = fileURLToPath(new URL('../../../../migrations/', import.meta.url));

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('rule repository', () => {
  it('installs versioned packs and atomically changes the active pack', async () => {
    const { database, repository } = await fixture();
    const first = pack('2026.9.0', { rateBasisPoints: null });
    const second = pack('2026.9.1', { rateBasisPoints: 125 });
    await repository.install({
      id: 'pack-one',
      pack: loadRulePack(JSON.stringify(first), { appVersion: '0.1.0' }),
      installedAt: date(1),
    });
    await repository.install({ id: 'pack-two', pack: second, installedAt: date(2) });

    expect(await repository.activate('pack-one', date(3))).toMatchObject({ id: 'pack-one' });
    expect(await repository.activate('pack-two', date(4))).toMatchObject({
      id: 'pack-two',
      active: true,
    });
    expect(
      (await repository.list('pinduoduo', 'CN')).map(({ id, active }) => [id, active]),
    ).toEqual([
      ['pack-two', true],
      ['pack-one', false],
    ]);
    expect(await repository.findActive('pinduoduo', 'CN')).toMatchObject({
      id: 'pack-two',
      pack: second,
    });
    database.close();
  });

  it('increments a user override revision without losing its creation time', async () => {
    const { database, repository } = await fixture();
    const original = rule({ rateBasisPoints: 100 });
    const updated = rule({ rateBasisPoints: 125 });

    expect(
      await repository.saveOverride({
        id: 'override-one',
        platformId: 'pinduoduo',
        region: 'CN',
        rule: original,
        now: date(1),
      }),
    ).toMatchObject({ revisionNo: 1, createdAt: date(1), updatedAt: date(1) });
    expect(
      await repository.saveOverride({
        id: 'ignored-on-update',
        platformId: 'pinduoduo',
        region: 'CN',
        rule: updated,
        now: date(2),
      }),
    ).toMatchObject({
      id: 'override-one',
      revisionNo: 2,
      createdAt: date(1),
      updatedAt: date(2),
      rule: updated,
    });
    expect(await repository.listOverrides('pinduoduo', 'CN')).toHaveLength(1);
    database.close();
  });

  it('round-trips immutable snapshots and fails closed on corrupted JSON', async () => {
    const { database, repository } = await fixture();
    const installed = pack('2026.9.0', { rateBasisPoints: 100 });
    await repository.install({ id: 'pack-one', pack: installed, installedAt: date(1) });
    const snapshot = createRuleSnapshot(
      resolveRules({
        platformId: 'pinduoduo',
        categoryCode: null,
        rules: installed.rules,
        now: date(2),
      }),
    );
    await repository.saveSnapshot({
      id: 'snapshot-one',
      rulePackId: 'pack-one',
      region: 'CN',
      snapshot,
      createdAt: date(3),
    });
    expect(await repository.findSnapshot('snapshot-one')).toEqual({
      id: 'snapshot-one',
      rulePackId: 'pack-one',
      region: 'CN',
      snapshot,
      createdAt: date(3),
    });

    database.sqlite.exec('PRAGMA recursive_triggers = OFF');
    database.sqlite.exec('DROP TRIGGER rule_snapshots_no_update');
    database.sqlite
      .prepare('UPDATE rule_snapshots SET snapshot_json = ? WHERE id = ?')
      .run('{}', 'snapshot-one');
    await expect(repository.findSnapshot('snapshot-one')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    database.close();
  });
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'eaw-rule-repository-'));
  directories.push(directory);
  const database = openDatabase(join(directory, 'database.sqlite'));
  await migrateDatabase(database, migrationsDirectory);
  return { database, repository: new DrizzleRuleRepository(database) };
}

function pack(version: string, config: Record<string, JsonValue>): RulePack {
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
    rules: [rule(config)],
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
    scope: { level: 'user' },
    provenance: {
      url: 'https://example.invalid/rules',
      title: '规则来源',
      type: 'documentation',
    },
    verifiedAt: date(0).toISOString(),
    effectiveFrom: date(0).toISOString(),
    expiresAt: null,
    status: 'verified',
    summary: '佣金规则',
    implementationNote: '测试规则',
    config,
    impact: 'financial',
  };
}

function date(day: number): Date {
  return new Date(`2026-09-${String(day + 1).padStart(2, '0')}T00:00:00.000Z`);
}
