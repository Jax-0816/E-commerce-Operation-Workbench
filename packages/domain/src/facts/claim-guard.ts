import type { UuidV7 } from '../ids.js';
import type { ProductFact } from './product-fact.js';

export interface FactEvidenceRef {
  readonly productId: UuidV7;
  readonly factId: UuidV7;
  readonly factKey: string;
}

export interface DeterministicClaim {
  readonly id: string;
  readonly text: string;
  readonly evidenceRefs: readonly FactEvidenceRef[];
  readonly sensitivity?: 'standard' | 'sensitive';
  readonly policyRef?: string | null;
}

export type UnsupportedClaimReason =
  | 'evidence_required'
  | 'cross_product_evidence'
  | 'fact_not_allowed'
  | 'fact_key_mismatch'
  | 'sensitive_policy_required'
  | 'sensitive_evidence_required';

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
  const referencedFacts: ProductFact[] = [];
  for (const evidenceRef of claim.evidenceRefs) {
    if (evidenceRef.productId !== currentProductId) {
      return { claim, reason: 'cross_product_evidence', evidenceRef };
    }
    const fact = factsById.get(evidenceRef.factId);
    if (fact === undefined || fact.productId !== currentProductId) {
      return { claim, reason: 'fact_not_allowed', evidenceRef };
    }
    if (fact.key !== evidenceRef.factKey) {
      return { claim, reason: 'fact_key_mismatch', evidenceRef };
    }
    referencedFacts.push(fact);
  }
  if (claim.sensitivity === 'sensitive') {
    if (!claim.policyRef?.trim()) return { claim, reason: 'sensitive_policy_required' };
    if (!referencedFacts.some((fact) => fact.sensitive && fact.policyEligible)) {
      return { claim, reason: 'sensitive_evidence_required' };
    }
  }
  return undefined;
}
