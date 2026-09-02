import { DomainError } from '@eaw/domain';
import {
  createRuleSnapshot,
  diffRuleSnapshots,
  loadRulePack,
  resolveRules,
  type RuleDefinition,
  type RulePack,
  type RuleSnapshot,
  type RuleSnapshotDiff,
} from '@eaw/rule-engine';

type PlatformId = RulePack['manifest']['platformId'];

export interface RulePackRecord {
  readonly id: string;
  readonly pack: RulePack;
  readonly installedAt: Date;
  readonly activatedAt: Date | null;
  readonly active: boolean;
}

export interface RuleOverrideRecord {
  readonly id: string;
  readonly platformId: PlatformId;
  readonly region: string;
  readonly rule: RuleDefinition;
  readonly revisionNo: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RuleSnapshotRecord {
  readonly id: string;
  readonly rulePackId: string;
  readonly region: string;
  readonly snapshot: RuleSnapshot;
  readonly createdAt: Date;
}

export interface RuleRepositoryPort {
  install(input: {
    readonly id: string;
    readonly pack: RulePack;
    readonly installedAt: Date;
  }): Promise<RulePackRecord>;
  activate(id: string, activatedAt: Date): Promise<RulePackRecord | undefined>;
  findById(id: string): Promise<RulePackRecord | undefined>;
  findActive(platformId: PlatformId, region: string): Promise<RulePackRecord | undefined>;
  list(platformId: PlatformId, region: string): Promise<readonly RulePackRecord[]>;
  listOverrides(platformId: PlatformId, region: string): Promise<readonly RuleOverrideRecord[]>;
  saveSnapshot(input: RuleSnapshotRecord): Promise<RuleSnapshotRecord>;
  findSnapshot(id: string): Promise<RuleSnapshotRecord | undefined>;
}

export interface RulePacksApplication {
  import(input: Uint8Array | string): Promise<RulePackRecord>;
  activate(id: string): Promise<RulePackRecord>;
  list(platformId: PlatformId, region: string): Promise<readonly RulePackRecord[]>;
  createSnapshot(input: {
    readonly platformId: PlatformId;
    readonly region: string;
    readonly categoryCode: string | null;
  }): Promise<RuleSnapshotRecord>;
  getSnapshot(id: string): Promise<RuleSnapshotRecord>;
  diff(beforeId: string, afterId: string): Promise<RuleSnapshotDiff>;
}

export function createRulePacksApplication({
  repository,
  appVersion,
  idFactory,
  now = () => new Date(),
}: {
  readonly repository: RuleRepositoryPort;
  readonly appVersion: string;
  readonly idFactory: () => string;
  readonly now?: () => Date;
}): RulePacksApplication {
  return {
    async import(input) {
      const pack = loadRulePack(input, { appVersion });
      return repository.install({ id: idFactory(), pack, installedAt: now() });
    },
    async activate(id) {
      const activated = await repository.activate(required(id), now());
      if (activated === undefined) throw new DomainError('NOT_FOUND', 'Rule pack was not found.');
      return activated;
    },
    list(platformId, region) {
      return repository.list(platformId, required(region));
    },
    async createSnapshot(input) {
      const region = required(input.region);
      const active = await repository.findActive(input.platformId, region);
      if (active === undefined) {
        throw new DomainError('NOT_FOUND', 'No active rule pack exists for this context.');
      }
      const overrides = await repository.listOverrides(input.platformId, region);
      const snapshot = createRuleSnapshot(
        resolveRules({
          platformId: input.platformId,
          categoryCode: input.categoryCode,
          rules: active.pack.rules,
          overrides: overrides.map(({ rule }) => rule),
          now: now(),
        }),
      );
      return repository.saveSnapshot({
        id: idFactory(),
        rulePackId: active.id,
        region,
        snapshot,
        createdAt: now(),
      });
    },
    async getSnapshot(id) {
      const snapshot = await repository.findSnapshot(required(id));
      if (snapshot === undefined) {
        throw new DomainError('NOT_FOUND', 'Rule snapshot was not found.');
      }
      return snapshot;
    },
    async diff(beforeId, afterId) {
      const [before, after] = await Promise.all([
        repository.findById(required(beforeId)),
        repository.findById(required(afterId)),
      ]);
      if (before === undefined || after === undefined) {
        throw new DomainError('NOT_FOUND', 'Rule pack was not found.');
      }
      if (
        before.pack.manifest.platformId !== after.pack.manifest.platformId ||
        before.pack.manifest.region !== after.pack.manifest.region
      ) {
        throw new DomainError('VALIDATION_ERROR', 'Rule pack contexts do not match.');
      }
      const resolvedAt = now();
      const snapshot = (pack: RulePack) =>
        createRuleSnapshot(
          resolveRules({
            platformId: pack.manifest.platformId,
            categoryCode: null,
            rules: pack.rules,
            now: resolvedAt,
          }),
        );
      return diffRuleSnapshots(snapshot(before.pack), snapshot(after.pack));
    },
  };
}

function required(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DomainError('VALIDATION_ERROR', 'Rule request is invalid.');
  return normalized;
}
