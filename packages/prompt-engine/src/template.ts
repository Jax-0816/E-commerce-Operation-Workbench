import { z } from 'zod';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const IDENTIFIER = /^[a-z][a-z0-9_-]{0,119}$/u;
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const JsonKeySchema = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => !unsafeKeys.has(value), 'Unsafe object key is forbidden.');

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string().max(200_000),
    z.array(JsonValueSchema).max(2_000),
    z.record(JsonKeySchema, JsonValueSchema),
  ]),
);

export const PromptTemplateSchema = z
  .object({
    schemaVersion: z.literal('1'),
    templateId: z.string().regex(IDENTIFIER),
    task: z.string().regex(IDENTIFIER),
    version: z.string().regex(SEMVER),
    systemRole: z.string().trim().min(1).max(20_000),
    taskContract: z.string().trim().min(1).max(20_000),
    outputSchema: z.record(JsonKeySchema, JsonValueSchema),
  })
  .strict();

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;
