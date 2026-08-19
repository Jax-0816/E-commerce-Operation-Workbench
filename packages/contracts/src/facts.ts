import { z } from 'zod';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UuidV7Schema = z.string().regex(UUID_V7_PATTERN);
const TimestampSchema = z.iso.datetime({ offset: true });

export const FactValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: z.string().trim().min(1) }).strict(),
  z.object({ type: z.literal('number'), value: z.number().finite() }).strict(),
  z.object({ type: z.literal('boolean'), value: z.boolean() }).strict(),
]);

const FactDraftFields = {
  label: z.string().trim().min(1).max(120),
  value: FactValueSchema.nullable(),
  unit: z.string().trim().min(1).max(40).nullable(),
  sourceType: z.enum([
    'manual',
    'supplier',
    'import',
    'document',
    'ai_inferred',
    'competitor_reference',
    'other',
  ]),
  sourceRef: z.string().trim().min(1).max(500).nullable(),
  verification: z.enum(['unverified', 'inferred', 'missing']),
  sensitive: z.boolean(),
  policyEligible: z.boolean(),
} as const;

function missingValueMatches<T extends { value: unknown; verification: string }>(
  input: T,
  context: z.RefinementCtx,
): void {
  if ((input.verification === 'missing') !== (input.value === null)) {
    context.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'Missing facts must have a null value.',
    });
  }
}

export const CreateFactInputSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/u),
    ...FactDraftFields,
  })
  .strict()
  .superRefine(missingValueMatches);

export const UpdateFactInputSchema = z
  .object({
    ...FactDraftFields,
    expectedUpdatedAt: TimestampSchema,
  })
  .strict()
  .superRefine(missingValueMatches);

export const ReviseFactInputSchema = z
  .object(FactDraftFields)
  .strict()
  .superRefine(missingValueMatches);

export const ConfirmFactInputSchema = z
  .object({
    expectedUpdatedAt: TimestampSchema,
    actorRef: z.string().trim().min(1).max(120),
    evidenceRef: z.string().trim().min(1).max(500),
  })
  .strict();

export const DeleteFactInputSchema = z.object({ expectedUpdatedAt: TimestampSchema }).strict();

export const ProductFactParamsSchema = z
  .object({
    productId: UuidV7Schema,
    factId: UuidV7Schema,
  })
  .strict();

export const ProductFactsParamsSchema = z.object({ productId: UuidV7Schema }).strict();

export const ProductFactResponseSchema = z
  .object({
    id: UuidV7Schema,
    productId: UuidV7Schema,
    key: z.string(),
    label: z.string(),
    value: FactValueSchema.nullable(),
    unit: z.string().nullable(),
    sourceType: z.enum([
      'manual',
      'supplier',
      'import',
      'document',
      'ai_inferred',
      'competitor_reference',
      'other',
    ]),
    sourceRef: z.string().nullable(),
    verification: z.enum(['confirmed', 'unverified', 'inferred', 'missing']),
    sensitive: z.boolean(),
    policyEligible: z.boolean(),
    revisionNo: z.number().int().positive(),
    supersedesFactId: UuidV7Schema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    confirmedAt: TimestampSchema.nullable(),
    confirmation: z
      .object({
        actorType: z.literal('user'),
        actorRef: z.string(),
        evidenceRef: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const ProductFactListResponseSchema = z
  .object({ items: z.array(ProductFactResponseSchema) })
  .strict();

export type CreateFactInput = z.infer<typeof CreateFactInputSchema>;
export type UpdateFactInput = z.infer<typeof UpdateFactInputSchema>;
export type ReviseFactInput = z.infer<typeof ReviseFactInputSchema>;
export type ConfirmFactInput = z.infer<typeof ConfirmFactInputSchema>;
export type DeleteFactInput = z.infer<typeof DeleteFactInputSchema>;
export type ProductFactResponse = z.infer<typeof ProductFactResponseSchema>;
