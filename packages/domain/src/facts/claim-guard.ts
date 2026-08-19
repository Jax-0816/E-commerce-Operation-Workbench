import type { UuidV7 } from '../ids.js';
import type { FactValue, ProductFact } from './product-fact.js';

export interface FactEvidenceRef {
  readonly productId: UuidV7;
  readonly factId: UuidV7;
  readonly factKey: string;
  readonly assertedValue: FactValue;
  readonly assertedUnit: string | null;
}

export interface DeterministicClaim {
  readonly id: string;
  readonly text: string;
  readonly evidenceRefs: readonly FactEvidenceRef[];
  readonly policyRef?: string | null;
}

export type UnsupportedClaimReason =
  | 'evidence_required'
  | 'cross_product_evidence'
  | 'fact_not_allowed'
  | 'fact_key_mismatch'
  | 'assertion_mismatch'
  | 'text_not_canonical'
  | 'sensitive_policy_required';

export interface UnsupportedClaim {
  readonly claim: DeterministicClaim;
  readonly reason: UnsupportedClaimReason;
  readonly evidenceRef?: FactEvidenceRef;
}

export interface ClaimGuardResult {
  readonly supportedClaims: readonly DeterministicClaim[];
  readonly unsupportedClaims: readonly UnsupportedClaim[];
  readonly autoApprovalAllowed: boolean;
  readonly assetStatus: 'approved' | 'needs_review';
}

export function checkClaims(
  claims: readonly DeterministicClaim[],
  allowedFacts: readonly ProductFact[],
  currentProductId: UuidV7,
): ClaimGuardResult {
  const factsById = new Map(allowedFacts.map((fact) => [fact.id, fact]));
  const supportedClaims: DeterministicClaim[] = [];
  const unsupportedClaims: UnsupportedClaim[] = [];
  for (const claim of claims) {
    const problem = findProblem(claim, factsById, currentProductId);
    if (problem === undefined) supportedClaims.push(claim);
    else unsupportedClaims.push(problem);
  }
  return {
    supportedClaims,
    unsupportedClaims,
    autoApprovalAllowed: unsupportedClaims.length === 0,
    assetStatus: unsupportedClaims.length === 0 ? 'approved' : 'needs_review',
  };
}

function findProblem(
  claim: DeterministicClaim,
  factsById: ReadonlyMap<UuidV7, ProductFact>,
  currentProductId: UuidV7,
): UnsupportedClaim | undefined {
  if (claim.evidenceRefs.length === 0) return { claim, reason: 'evidence_required' };
  const facts: ProductFact[] = [];
  for (const evidenceRef of claim.evidenceRefs) {
    if (evidenceRef.productId !== currentProductId)
      return { claim, reason: 'cross_product_evidence', evidenceRef };
    const fact = factsById.get(evidenceRef.factId);
    if (fact === undefined || fact.productId !== currentProductId)
      return { claim, reason: 'fact_not_allowed', evidenceRef };
    if (fact.key !== evidenceRef.factKey)
      return { claim, reason: 'fact_key_mismatch', evidenceRef };
    if (
      !sameValue(fact.value, evidenceRef.assertedValue) ||
      normalizeUnit(fact.unit) !== normalizeUnit(evidenceRef.assertedUnit)
    ) {
      return { claim, reason: 'assertion_mismatch', evidenceRef };
    }
    facts.push(fact);
  }
  if (facts.some(({ sensitive }) => sensitive) && !claim.policyRef?.trim()) {
    return { claim, reason: 'sensitive_policy_required' };
  }
  if (!canonicalClaimTexts(facts).has(normalizeClaimText(claim.text))) {
    return { claim, reason: 'text_not_canonical' };
  }
  return undefined;
}

export function canonicalClaimTexts(facts: readonly ProductFact[]): ReadonlySet<string> {
  if (facts.length === 0 || facts.some(({ value }) => value === null)) return new Set();
  const components = facts.map((fact) => {
    const value = renderValue(fact.value!, fact.unit);
    return {
      plain: value,
      labelled: `${fact.label}${value}`,
      equals: `${fact.label}为${value}`,
      colon: `${fact.label}：${value}`,
    };
  });
  if (components.length === 1)
    return new Set(Object.values(components[0]!).map(normalizeClaimText));
  return new Set(
    [
      components.map(({ labelled }) => labelled).join('，'),
      components.map(({ equals }) => equals).join('，'),
    ].map(normalizeClaimText),
  );
}

function renderValue(value: FactValue, unit: string | null): string {
  const rendered =
    value.type === 'boolean' ? (value.value ? '是' : '否') : String(value.value).trim();
  return `${rendered}${normalizeUnit(unit) ?? ''}`;
}

function sameValue(actual: FactValue | null, asserted: unknown): boolean {
  if (actual === null || !isFactValue(asserted) || actual.type !== asserted.type) return false;
  if (actual.type === 'text' && asserted.type === 'text')
    return actual.value.trim() === asserted.value.trim();
  return actual.value === asserted.value;
}

function isFactValue(value: unknown): value is FactValue {
  if (typeof value !== 'object' || value === null || !('type' in value) || !('value' in value))
    return false;
  return (
    (value.type === 'text' && typeof value.value === 'string' && value.value.trim() !== '') ||
    (value.type === 'number' && typeof value.value === 'number' && Number.isFinite(value.value)) ||
    (value.type === 'boolean' && typeof value.value === 'boolean')
  );
}

function normalizeUnit(unit: string | null): string | null {
  const normalized = unit?.trim();
  return normalized ? normalized : null;
}

function normalizeClaimText(text: string): string {
  return text.trim().replace(/\s+/gu, ' ');
}
