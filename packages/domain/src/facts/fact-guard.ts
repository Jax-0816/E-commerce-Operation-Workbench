import type { ProductFact } from './product-fact.js';

export type RestrictedFactReason =
  | 'not_confirmed'
  | 'ai_inferred'
  | 'sensitive_policy_ineligible'
  | 'sensitive_evidence_required'
  | 'invalid_confirmation_provenance'
  | 'deleted';

export interface RestrictedFact {
  readonly fact: ProductFact;
  readonly reason: RestrictedFactReason;
}

export interface FactGuardResult {
  readonly allowed: readonly ProductFact[];
  readonly restricted: readonly RestrictedFact[];
  readonly missing: readonly ProductFact[];
}

export function evaluateFacts(facts: readonly ProductFact[]): FactGuardResult {
  const allowed: ProductFact[] = [];
  const restricted: RestrictedFact[] = [];
  const missing: ProductFact[] = [];

  for (const fact of facts) {
    if (fact.deletedAt !== null) {
      restricted.push({ fact, reason: 'deleted' });
      continue;
    }
    if (fact.verification === 'missing') {
      missing.push(fact);
      continue;
    }
    if (fact.verification !== 'confirmed') {
      restricted.push({
        fact,
        reason:
          fact.verification === 'inferred' || fact.sourceType === 'ai_inferred'
            ? 'ai_inferred'
            : 'not_confirmed',
      });
      continue;
    }
    if (
      fact.confirmedAt === null ||
      fact.confirmation?.actorType !== 'user' ||
      fact.confirmation.actorRef.trim().length === 0 ||
      fact.confirmation.evidenceRef.trim().length === 0
    ) {
      restricted.push({ fact, reason: 'invalid_confirmation_provenance' });
      continue;
    }
    if (fact.sensitive && !fact.policyEligible) {
      restricted.push({ fact, reason: 'sensitive_policy_ineligible' });
      continue;
    }
    if (fact.sensitive && fact.confirmation.evidenceRef.trim().length === 0) {
      restricted.push({ fact, reason: 'sensitive_evidence_required' });
      continue;
    }
    allowed.push(fact);
  }

  return { allowed, restricted, missing };
}
