import { canonicalJson } from './checksum.js';
import type { RuleDefinition } from './schemas.js';
import type { RuleSnapshot } from './snapshot.js';

export interface RuleSnapshotDiff {
  readonly added: readonly RuleDefinition[];
  readonly removed: readonly RuleDefinition[];
  readonly changed: readonly {
    readonly key: string;
    readonly before: RuleDefinition;
    readonly after: RuleDefinition;
  }[];
}

export function diffRuleSnapshots(before: RuleSnapshot, after: RuleSnapshot): RuleSnapshotDiff {
  const left = new Map(before.rules.map((rule) => [rule.key, rule]));
  const right = new Map(after.rules.map((rule) => [rule.key, rule]));
  const added = after.rules.filter(({ key }) => !left.has(key));
  const removed = before.rules.filter(({ key }) => !right.has(key));
  const changed = before.rules.flatMap((rule) => {
    const next = right.get(rule.key);
    return next !== undefined && canonicalJson(rule) !== canonicalJson(next)
      ? [{ key: rule.key, before: rule, after: next }]
      : [];
  });
  return deepFreeze({ added, removed, changed });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
