import { DomainError } from '@eaw/domain';
import {
  calculateRulePackChecksum,
  canonicalJson,
  RuleDefinitionSchema,
  RulePackSchema,
  sha256,
  type RuleDefinition,
  type RulePack,
  type RuleSnapshot,
} from '@eaw/rule-engine';

import type { OpenDatabase } from '../client.js';

type PlatformId = RulePack['manifest']['platformId'];
type Row = Record<string, unknown>;

export interface StoredRulePack {
  readonly id: string;
  readonly pack: RulePack;
  readonly installedAt: Date;
  readonly activatedAt: Date | null;
  readonly active: boolean;
}

export interface StoredRuleOverride {
  readonly id: string;
  readonly platformId: PlatformId;
  readonly region: string;
  readonly rule: RuleDefinition;
  readonly revisionNo: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StoredRuleSnapshot {
  readonly id: string;
  readonly rulePackId: string;
  readonly region: string;
  readonly snapshot: RuleSnapshot;
  readonly createdAt: Date;
}

export class DrizzleRuleRepository {
  constructor(private readonly database: OpenDatabase) {}

  async install(input: {
    readonly id: string;
    readonly pack: RulePack;
    readonly installedAt: Date;
  }): Promise<StoredRulePack> {
    const pack = parsePack(input.pack);
    const installedAt = validDate(input.installedAt);
    this.database.sqlite
      .prepare(
        'INSERT INTO rule_packs (id, platform_id, region, version, checksum, manifest_json, rules_json, installed_at, activated_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)',
      )
      .run(
        requiredString(input.id),
        pack.manifest.platformId,
        pack.manifest.region,
        pack.manifest.version,
        pack.manifest.checksum,
        JSON.stringify(pack.manifest),
        JSON.stringify(pack.rules),
        installedAt.getTime(),
      );
    return { id: input.id, pack, installedAt, activatedAt: null, active: false };
  }

  async activate(id: string, activatedAtInput: Date): Promise<StoredRulePack | undefined> {
    const activatedAt = validDate(activatedAtInput);
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const target = this.database.sqlite
        .prepare('SELECT platform_id, region FROM rule_packs WHERE id = ?')
        .get(requiredString(id)) as Row | undefined;
      if (target === undefined) {
        this.database.sqlite.exec('ROLLBACK;');
        return undefined;
      }
      const platformId = requiredString(target.platform_id);
      const region = requiredString(target.region);
      this.database.sqlite
        .prepare(
          'UPDATE rule_packs SET active = 0, activated_at = NULL WHERE platform_id = ? AND region = ? AND active = 1',
        )
        .run(platformId, region);
      this.database.sqlite
        .prepare('UPDATE rule_packs SET active = 1, activated_at = ? WHERE id = ?')
        .run(activatedAt.getTime(), id);
      this.database.sqlite.exec('COMMIT;');
    } catch (error) {
      rollback(this.database);
      throw error;
    }
    return this.findById(id);
  }

  async findById(id: string): Promise<StoredRulePack | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM rule_packs WHERE id = ?')
      .get(requiredString(id)) as Row | undefined;
    return row === undefined ? undefined : toStoredPack(row);
  }

  async findActive(platformId: PlatformId, region: string): Promise<StoredRulePack | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM rule_packs WHERE platform_id = ? AND region = ? AND active = 1')
      .get(platformId, requiredString(region)) as Row | undefined;
    return row === undefined ? undefined : toStoredPack(row);
  }

  async list(platformId: PlatformId, region: string): Promise<readonly StoredRulePack[]> {
    const rows = this.database.sqlite
      .prepare(
        'SELECT * FROM rule_packs WHERE platform_id = ? AND region = ? ORDER BY active DESC, installed_at DESC, id DESC',
      )
      .all(platformId, requiredString(region)) as Row[];
    return rows.map(toStoredPack);
  }

  async saveOverride(input: {
    readonly id: string;
    readonly platformId: PlatformId;
    readonly region: string;
    readonly rule: RuleDefinition;
    readonly now: Date;
  }): Promise<StoredRuleOverride> {
    const rule = RuleDefinitionSchema.parse(input.rule);
    if (rule.scope.level !== 'user') invalid('Rule override must use user scope.');
    const now = validDate(input.now);
    const region = requiredString(input.region);
    this.database.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const existing = this.database.sqlite
        .prepare(
          'SELECT id, revision_no, created_at FROM rule_overrides WHERE platform_id = ? AND region = ? AND rule_key = ?',
        )
        .get(input.platformId, region, rule.key) as Row | undefined;
      if (existing === undefined) {
        this.database.sqlite
          .prepare(
            'INSERT INTO rule_overrides (id, platform_id, region, rule_key, rule_json, revision_no, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
          )
          .run(
            requiredString(input.id),
            input.platformId,
            region,
            rule.key,
            JSON.stringify(rule),
            now.getTime(),
            now.getTime(),
          );
      } else {
        const createdAt = timestamp(existing.created_at);
        if (now.getTime() < createdAt.getTime()) invalid('Override update predates creation.');
        this.database.sqlite
          .prepare(
            'UPDATE rule_overrides SET rule_json = ?, revision_no = revision_no + 1, updated_at = ? WHERE id = ?',
          )
          .run(JSON.stringify(rule), now.getTime(), requiredString(existing.id));
      }
      this.database.sqlite.exec('COMMIT;');
    } catch (error) {
      rollback(this.database);
      throw error;
    }
    return this.findOverride(input.platformId, region, rule.key).then((stored) => stored!);
  }

  async listOverrides(
    platformId: PlatformId,
    region: string,
  ): Promise<readonly StoredRuleOverride[]> {
    const rows = this.database.sqlite
      .prepare(
        'SELECT * FROM rule_overrides WHERE platform_id = ? AND region = ? ORDER BY rule_key',
      )
      .all(platformId, requiredString(region)) as Row[];
    return rows.map(toStoredOverride);
  }

  async saveSnapshot(input: {
    readonly id: string;
    readonly rulePackId: string;
    readonly region: string;
    readonly snapshot: RuleSnapshot;
    readonly createdAt: Date;
  }): Promise<StoredRuleSnapshot> {
    const snapshot = parseSnapshot(input.snapshot);
    const pack = await this.findById(input.rulePackId);
    if (
      pack === undefined ||
      pack.pack.manifest.platformId !== snapshot.platformId ||
      pack.pack.manifest.region !== input.region
    ) {
      invalid('Rule snapshot context does not match its pack.');
    }
    const createdAt = validDate(input.createdAt);
    this.database.sqlite
      .prepare(
        'INSERT INTO rule_snapshots (id, rule_pack_id, platform_id, region, category_code, snapshot_hash, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        requiredString(input.id),
        input.rulePackId,
        snapshot.platformId,
        input.region,
        snapshot.categoryCode,
        snapshot.hash,
        JSON.stringify(snapshot),
        createdAt.getTime(),
      );
    return {
      id: input.id,
      rulePackId: input.rulePackId,
      region: input.region,
      snapshot,
      createdAt,
    };
  }

  async findSnapshot(id: string): Promise<StoredRuleSnapshot | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM rule_snapshots WHERE id = ?')
      .get(requiredString(id)) as Row | undefined;
    if (row === undefined) return undefined;
    return {
      id: requiredString(row.id),
      rulePackId: requiredString(row.rule_pack_id),
      region: requiredString(row.region),
      snapshot: parseSnapshot(parseJson(row.snapshot_json)),
      createdAt: timestamp(row.created_at),
    };
  }

  private async findOverride(
    platformId: PlatformId,
    region: string,
    key: string,
  ): Promise<StoredRuleOverride | undefined> {
    const row = this.database.sqlite
      .prepare('SELECT * FROM rule_overrides WHERE platform_id = ? AND region = ? AND rule_key = ?')
      .get(platformId, region, key) as Row | undefined;
    return row === undefined ? undefined : toStoredOverride(row);
  }
}

function toStoredPack(row: Row): StoredRulePack {
  const manifest = parseJson(row.manifest_json);
  const rules = parseJson(row.rules_json);
  const pack = parsePack({ manifest, rules });
  if (
    pack.manifest.platformId !== row.platform_id ||
    pack.manifest.region !== row.region ||
    pack.manifest.version !== row.version ||
    pack.manifest.checksum !== row.checksum
  ) {
    invalid('Persisted rule pack metadata is inconsistent.');
  }
  const active = booleanInteger(row.active);
  const activatedAt = row.activated_at === null ? null : timestamp(row.activated_at);
  if (active !== (activatedAt !== null)) invalid('Persisted rule pack activation is invalid.');
  return {
    id: requiredString(row.id),
    pack,
    installedAt: timestamp(row.installed_at),
    activatedAt,
    active,
  };
}

function toStoredOverride(row: Row): StoredRuleOverride {
  const platformId = requiredString(row.platform_id) as PlatformId;
  const rule = RuleDefinitionSchema.parse(parseJson(row.rule_json));
  if (rule.scope.level !== 'user' || rule.key !== row.rule_key) {
    invalid('Persisted rule override is inconsistent.');
  }
  return {
    id: requiredString(row.id),
    platformId,
    region: requiredString(row.region),
    rule,
    revisionNo: positiveInteger(row.revision_no),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function parsePack(input: unknown): RulePack {
  if (input === null || Array.isArray(input) || typeof input !== 'object') invalid();
  const candidate = input as { readonly manifest?: unknown; readonly rules?: unknown };
  const pack = RulePackSchema.parse({ manifest: candidate.manifest, rules: candidate.rules });
  const { checksum, ...manifest } = pack.manifest;
  if (calculateRulePackChecksum({ manifest, rules: pack.rules }) !== checksum) {
    invalid('Rule pack checksum is invalid.');
  }
  return structuredClone(pack);
}

function parseSnapshot(input: unknown): RuleSnapshot {
  if (input === null || Array.isArray(input) || typeof input !== 'object') invalid();
  const candidate = input as Partial<RuleSnapshot>;
  if (
    !['pinduoduo', 'taobao_tmall', 'douyin_ecommerce'].includes(candidate.platformId ?? '') ||
    (candidate.categoryCode !== null && typeof candidate.categoryCode !== 'string') ||
    typeof candidate.resolvedAt !== 'string' ||
    !Number.isSafeInteger(new Date(candidate.resolvedAt).getTime()) ||
    !['verified', 'warning', 'incomplete'].includes(candidate.status ?? '') ||
    !Array.isArray(candidate.rules) ||
    !Array.isArray(candidate.issues) ||
    typeof candidate.hash !== 'string'
  ) {
    invalid('Persisted rule snapshot is invalid.');
  }
  const rules = candidate.rules.map((rule) => RuleDefinitionSchema.parse(rule));
  for (const issue of candidate.issues) {
    if (
      issue === null ||
      typeof issue !== 'object' ||
      !['RULE_EXPIRED', 'RULE_NEEDS_REVIEW', 'RULE_NOT_EFFECTIVE'].includes(
        (issue as { code?: string }).code ?? '',
      ) ||
      typeof (issue as { key?: unknown }).key !== 'string' ||
      typeof (issue as { message?: unknown }).message !== 'string'
    ) {
      invalid('Persisted rule snapshot issue is invalid.');
    }
  }
  const snapshot = structuredClone({ ...candidate, rules }) as RuleSnapshot;
  const { hash, ...resolved } = snapshot;
  if (!/^[0-9a-f]{64}$/u.test(hash) || sha256(canonicalJson(resolved)) !== hash) {
    invalid('Persisted rule snapshot hash is invalid.');
  }
  return snapshot;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') invalid();
  try {
    return JSON.parse(value);
  } catch {
    return invalid();
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}

function validDate(value: Date): Date {
  if (!Number.isSafeInteger(value.getTime())) invalid();
  return new Date(value);
}

function timestamp(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalid();
  return new Date(value);
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid();
  return value;
}

function booleanInteger(value: unknown): boolean {
  if (value !== 0 && value !== 1) invalid();
  return value === 1;
}

function rollback(database: OpenDatabase): void {
  try {
    database.sqlite.exec('ROLLBACK;');
  } catch {
    // Preserve the original transaction failure.
  }
}

function invalid(message = 'Persisted rule data is invalid.'): never {
  throw new DomainError('VALIDATION_ERROR', message);
}
