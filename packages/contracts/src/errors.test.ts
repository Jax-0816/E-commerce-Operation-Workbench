import { describe, expect, it } from 'vitest';

import { DomainError, type ErrorCode } from '@eaw/domain';
import { ErrorResponseSchema, toErrorResponse } from './errors.js';

const expectedMessages: Readonly<Record<ErrorCode, string>> = {
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

describe('toErrorResponse', () => {
  it.each(Object.entries(expectedMessages) as [ErrorCode, string][])(
    'maps %s to its normal-user response',
    (code, expectedMessage) => {
      const response = toErrorResponse(new DomainError(code, 'internal diagnostic'), 'trace-123');

      expect(response).toEqual({
        error: {
          code,
          message: expectedMessage,
          details: {},
          traceId: 'trace-123',
        },
      });
      expect(ErrorResponseSchema.parse(response)).toEqual(response);
    },
  );

  it('retains deliberately safe details and the trace ID without exposing internal diagnostics', () => {
    const response = toErrorResponse(
      new DomainError('VALIDATION_ERROR', 'SQLite exception: password=do-not-expose', {
        field: 'title',
        minimumLength: 1,
      }),
      'request-9af5',
    );

    expect(response).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some supplied values are invalid.',
        details: { field: 'title', minimumLength: 1 },
        traceId: 'request-9af5',
      },
    });
    expect(JSON.stringify(response)).not.toContain('SQLite exception');
    expect(JSON.stringify(response)).not.toContain('password=do-not-expose');
  });

  it('does not leak an unexpected error message or stack trace', () => {
    const unexpectedError = new Error('connection string: secret://never-return');
    unexpectedError.stack = 'Error: connection string: secret://never-return\n at internal.ts:12:3';

    const response = toErrorResponse(unexpectedError, 'trace-fallback');

    expect(response).toEqual({
      error: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'This capability is currently unavailable.',
        details: {},
        traceId: 'trace-fallback',
      },
    });
    expect(JSON.stringify(response)).not.toContain('secret://never-return');
    expect(JSON.stringify(response)).not.toContain('internal.ts');
  });

  it('keeps only safe primitive details when a DomainError is mutated at runtime', () => {
    const domainError = new DomainError('VALIDATION_ERROR', 'internal diagnostic');
    (domainError as unknown as { details: unknown }).details = {
      field: 'title',
      minimumLength: 1,
      required: true,
      expectedValue: null,
      diagnostic: { stack: 'secret-stack-trace' },
      relatedFields: ['description'],
    };

    const response = toErrorResponse(domainError, 'trace-sanitized-details');

    expect(response.error.details).toEqual({
      field: 'title',
      minimumLength: 1,
      required: true,
      expectedValue: null,
    });
    expect(JSON.stringify(response)).not.toContain('secret-stack-trace');
    expect(ErrorResponseSchema.parse(response)).toEqual(response);
  });

  it('maps a runtime-mutated noncanonical DomainError code to the generic response', () => {
    const domainError = new DomainError('VALIDATION_ERROR', 'internal diagnostic');
    (domainError as unknown as { code: unknown }).code = 'UNRECOGNIZED_RUNTIME_CODE';

    const response = toErrorResponse(domainError, 'trace-invalid-code');

    expect(response.error).toEqual({
      code: 'CAPABILITY_UNAVAILABLE',
      message: 'This capability is currently unavailable.',
      details: {},
      traceId: 'trace-invalid-code',
    });
    expect(ErrorResponseSchema.parse(response)).toEqual(response);
  });

  it('substitutes a nonempty safe trace ID when the supplied trace ID is empty', () => {
    const response = toErrorResponse(new DomainError('NOT_FOUND', 'internal diagnostic'), '');

    expect(response.error.traceId).not.toBe('');
    expect(response.error.traceId).toBe('trace-unavailable');
    expect(ErrorResponseSchema.parse(response)).toEqual(response);
  });
});
