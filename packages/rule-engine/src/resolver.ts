import { DomainError } from '@eaw/domain';

import { canonicalJson } from './checksum.js';
import { RuleDefinitionSchema, type RuleDefinition } from './schemas.js';

export type RuleResolutionStatus = 'verified' | 'warning' | 'incomplete';
export type RuleIssueCode = 'RULE_EXPIRED' | 'RULE_NEEDS_REVIEW' | 'RULE_NOT_EFFECTIVE';

export interface RuleIssue {
  readonly code: RuleIssueCode;
  readonly key: string;
  readonly message: string;
}

export interface RuleResolutionInput {
  readonly platformId: 'pinduoduo' | 'taobao_tmall' | 'douyin_ecommerce';
  readonly categoryCode: string | null;
  readonly rules: readonly RuleDefinition[];
  readonly overrides?: readonly RuleDefinition[];
  readonly applicationFallbacks?: readonly RuleDefinition[];
  readonly now: Date;
}

export interface ResolvedRules {
  readonly platformId: RuleResolutionInput['platformId'];
  readonly categoryCode: string | null;
  readonly resolvedAt: string;
  readonly status: RuleResolutionStatus;
  readonly rules: readonly RuleDefinition[];
  readonly issues: readonly RuleIssue[];
}

export function resolveRules(input: RuleResolutionInput): ResolvedRules {
  if (!Number.isSafeInteger(input.now.getTime())) invalid();
  const sources = [
    ...parseRules(input.applicationFallbacks ?? [], 'fallback'),
    ...parseRules(input.rules, undefined),
    ...parseRules(input.overrides ?? [], 'user'),
  ].filter((rule) => matchesCategory(rule, input.categoryCode));
  const keys = [...new Set(sources.map(({ key }) => key))];
  const resolved = keys.map((key) => resolveKey(key, sources));
  const issues: RuleIssue[] = [];
  for (const rule of resolved) {
    if (new Date(rule.effectiveFrom).getTime() > input.now.getTime())
      issues.push(issue('RULE_NOT_EFFECTIVE', rule.key, 'Rule is not effective yet.'));
    if (rule.expiresAt !== null && new Date(rule.expiresAt).getTime() < input.now.getTime())
      issues.push(issue('RULE_EXPIRED', rule.key, 'Rule has expired.'));
    if (rule.status === 'needs_review')
      issues.push(issue('RULE_NEEDS_REVIEW', rule.key, 'Rule needs human review.'));
  }
  const financialKeys = new Set(
    resolved.filter(({ impact }) => impact === 'financial').map(({ key }) => key),
  );
  const financialIssue = issues.some(({ key }) => financialKeys.has(key));
  return deepFreeze({
    platformId: input.platformId,
    categoryCode: input.categoryCode,
    resolvedAt: input.now.toISOString(),
    status: financialIssue ? 'incomplete' : issues.length > 0 ? 'warning' : 'verified',
    rules: resolved,
    issues,
  });
}

function parseRules(
  rules: readonly RuleDefinition[],
  requiredLevel: 'fallback' | 'user' | undefined,
): RuleDefinition[] {
  return rules.map((input) => {
    const rule = RuleDefinitionSchema.parse(input);
    if (requiredLevel !== undefined && rule.scope.level !== requiredLevel) invalid();
    return rule;
  });
}

function matchesCategory(rule: RuleDefinition, categoryCode: string | null): boolean {
  if (rule.scope.level !== 'category') return true;
  return (
    categoryCode !== null &&
    (categoryCode === rule.scope.categoryCode ||
      categoryCode.startsWith(`${rule.scope.categoryCode}/`))
  );
}

function resolveKey(key: string, rules: readonly RuleDefinition[]): RuleDefinition {
  const candidates = rules.filter((rule) => rule.key === key);
  const bestRank = Math.max(...candidates.map(rank));
  const ranked = candidates.filter((rule) => rank(rule) === bestRank);
  const bestSpecificity = Math.max(...ranked.map(specificity));
  const winners = ranked.filter((rule) => specificity(rule) === bestSpecificity);
  const configs = new Set(winners.map(({ config }) => canonicalJson(config)));
  if (configs.size > 1) {
    throw new DomainError('RULE_CONFLICT', 'Rules at the same precedence level disagree.', { key });
  }
  return winners[0]!;
}

function rank(rule: RuleDefinition): number {
  return { fallback: 0, platform: 1, category: 2, user: 3 }[rule.scope.level];
}

function specificity(rule: RuleDefinition): number {
  return rule.scope.level === 'category' ? rule.scope.categoryCode.split('/').length : 0;
}

function issue(code: RuleIssueCode, key: string, message: string): RuleIssue {
  return { code, key, message };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function invalid(): never {
  throw new DomainError('VALIDATION_ERROR', 'Rule resolution input is invalid.');
}
