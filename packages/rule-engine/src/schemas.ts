import { z } from 'zod';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const RULE_KEY = /^[a-z][a-z0-9_.-]{0,119}$/u;
const CATEGORY = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/u;
const executableText = /(?:\bfunction\b|=>|\beval\s*\(|\bnew\s+Function\b)/u;
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const JsonKeySchema = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => !unsafeKeys.has(value), 'Unsafe object key is forbidden.');

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z
      .string()
      .max(10_000)
      .refine((value) => !executableText.test(value), 'Executable text is forbidden.'),
    z.array(JsonValueSchema).max(1_000),
    z.record(JsonKeySchema, JsonValueSchema),
  ]),
);

export const RuleManifestSchema = z
  .object({
    schemaVersion: z.literal('1'),
    platformId: z.enum(['pinduoduo', 'taobao_tmall', 'douyin_ecommerce']),
    region: z.string().trim().min(2).max(20),
    version: z.string().regex(SEMVER),
    publisher: z.string().trim().min(1).max(200),
    verifiedAt: z.iso.datetime(),
    minimumAppVersion: z.string().regex(SEMVER),
    checksum: z.string().regex(SHA256),
    description: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const RuleScopeSchema = z.discriminatedUnion('level', [
  z.object({ level: z.literal('platform') }).strict(),
  z.object({ level: z.literal('category'), categoryCode: z.string().regex(CATEGORY) }).strict(),
  z.object({ level: z.literal('user') }).strict(),
  z.object({ level: z.literal('fallback') }).strict(),
]);

export const RuleDefinitionSchema = z
  .object({
    key: z.string().regex(RULE_KEY),
    type: z.enum(['financial', 'promotion', 'content', 'category_mapping', 'rounding']),
    scope: RuleScopeSchema,
    provenance: z
      .object({
        url: z.url().max(2_000),
        title: z.string().trim().min(1).max(500),
        type: z.enum(['official', 'documentation', 'merchant', 'other']),
      })
      .strict(),
    verifiedAt: z.iso.datetime(),
    effectiveFrom: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    status: z.enum(['verified', 'needs_review']),
    summary: z.string().trim().min(1).max(1_000),
    implementationNote: z.string().trim().min(1).max(2_000),
    config: z.record(JsonKeySchema, JsonValueSchema),
    impact: z.enum(['financial', 'non_financial']),
  })
  .strict();

export const RulePackSchema = z
  .object({
    manifest: RuleManifestSchema,
    rules: z.array(RuleDefinitionSchema).max(5_000),
  })
  .strict();

export type RuleManifest = z.infer<typeof RuleManifestSchema>;
export type RuleScope = z.infer<typeof RuleScopeSchema>;
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;
export type RulePack = z.infer<typeof RulePackSchema>;
export type UnsignedRulePack = {
  readonly manifest: Omit<RuleManifest, 'checksum'>;
  readonly rules: readonly RuleDefinition[];
};
