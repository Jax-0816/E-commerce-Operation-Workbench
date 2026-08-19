export { checkClaims } from './claim-guard.js';
export type {
  ClaimGuardResult,
  DeterministicClaim,
  FactEvidenceRef,
  UnsupportedClaim,
  UnsupportedClaimReason,
} from './claim-guard.js';
export { evaluateFacts } from './fact-guard.js';
export type { FactGuardResult, RestrictedFact, RestrictedFactReason } from './fact-guard.js';
export {
  confirmProductFact,
  createProductFact,
  FACT_SOURCE_TYPES,
  FACT_VERIFICATIONS,
  normalizeFactKey,
  nextTimestamp,
} from './product-fact.js';
export type {
  CreateProductFactProps,
  FactConfirmation,
  FactSourceType,
  FactValue,
  FactVerification,
  ProductFact,
} from './product-fact.js';
export type { ProductFactRepository } from './product-fact-repository.js';
