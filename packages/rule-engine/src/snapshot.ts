import { canonicalJson, sha256 } from './checksum.js';
import type { ResolvedRules } from './resolver.js';

export interface RuleSnapshot extends ResolvedRules {
  readonly hash: string;
}

export function createRuleSnapshot(input: ResolvedRules): RuleSnapshot {
  const detached = structuredClone(input);
  const hash = sha256(canonicalJson(detached));
  return deepFreeze({ ...detached, hash });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
