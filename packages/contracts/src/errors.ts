import { DomainError, ERROR_CODES, type ErrorCode, type SafeErrorDetail } from '@eaw/domain';
import { z } from 'zod';

const errorMessages: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: 'Some supplied values are invalid.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state.',
  FACT_VERIFICATION_REQUIRED: 'Verify the required facts before continuing.',
  RULE_INCOMPLETE: 'The rule configuration is incomplete.',
  RULE_CONFLICT: 'The applicable rules conflict.',
  CAPABILITY_UNAVAILABLE: 'This capability is currently unavailable.',
  PRICING_INPUT_INCOMPLETE: 'Complete the pricing inputs before continuing.',
  CALCULATION_INVALID: 'The calculation cannot be completed with these inputs.',
  AI_PROVIDER_UNAVAILABLE: 'The AI provider is currently unavailable.',
  AI_OUTPUT_INVALID: 'The AI response could not be validated.',
  WORKSPACE_LOCKED: 'The workspace is currently in use.',
  MIGRATION_FAILED: 'The workspace could not be migrated safely.',
};

const SafeErrorDetailSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.enum(ERROR_CODES),
        message: z.string(),
        details: z.record(z.string(), SafeErrorDetailSchema),
        traceId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function toErrorResponse(error: unknown, traceId: string): ErrorResponse {
  const domainError = error instanceof DomainError ? error : undefined;
  const code = isErrorCode(domainError?.code) ? domainError.code : 'CAPABILITY_UNAVAILABLE';

  return {
    error: {
      code,
      message: errorMessages[code],
      details: sanitizeDetails(domainError?.details),
      traceId: sanitizeTraceId(traceId),
    },
  };
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as ErrorCode);
}

function sanitizeDetails(details: unknown): Record<string, SafeErrorDetail> {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => isSafeErrorDetail(value)),
  );
}

function isSafeErrorDetail(value: unknown): value is SafeErrorDetail {
  return (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function sanitizeTraceId(traceId: string): string {
  return traceId.trim().length > 0 ? traceId : 'trace-unavailable';
}
