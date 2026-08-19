export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'FACT_VERIFICATION_REQUIRED',
  'RULE_INCOMPLETE',
  'RULE_CONFLICT',
  'CAPABILITY_UNAVAILABLE',
  'PRICING_INPUT_INCOMPLETE',
  'CALCULATION_INVALID',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_OUTPUT_INVALID',
  'WORKSPACE_LOCKED',
  'MIGRATION_FAILED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type SafeErrorDetail = boolean | null | number | string;
export type SafeErrorDetails = Readonly<Record<string, SafeErrorDetail>>;

export class DomainError extends Error {
  readonly details: SafeErrorDetails;

  constructor(
    readonly code: ErrorCode,
    message: string,
    details: SafeErrorDetails = {},
  ) {
    super(message);
    this.name = 'DomainError';
    this.details = Object.freeze({ ...details });
  }
}
