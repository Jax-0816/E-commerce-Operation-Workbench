import { z } from 'zod';

const PlatformId = z.enum(['pinduoduo', 'taobao_tmall', 'douyin_ecommerce']);
const Identifier = z.string().trim().min(1).max(200);
const RuleKey = z.string().regex(/^[a-z][a-z0-9_.-]{0,119}$/u);
const JsonObject = z.record(z.string().min(1).max(120), z.json());
const RuleScope = z.discriminatedUnion('level', [
  z.object({ level: z.literal('platform') }).strict(),
  z
    .object({
      level: z.literal('category'),
      categoryCode: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/u),
    })
    .strict(),
  z.object({ level: z.literal('user') }).strict(),
  z.object({ level: z.literal('fallback') }).strict(),
]);
export const RuleDefinitionResponseSchema = z
  .object({
    key: RuleKey,
    type: z.enum(['financial', 'promotion', 'content', 'category_mapping', 'rounding']),
    scope: RuleScope,
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
    config: JsonObject,
    impact: z.enum(['financial', 'non_financial']),
  })
  .strict();

const RuleManifestResponseSchema = z
  .object({
    schemaVersion: z.literal('1'),
    platformId: PlatformId,
    region: z.string().trim().min(2).max(20),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u),
    publisher: z.string().trim().min(1).max(200),
    verifiedAt: z.iso.datetime(),
    minimumAppVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u),
    checksum: z.string().regex(/^[0-9a-f]{64}$/u),
    description: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const RulePackRecordResponseSchema = z
  .object({
    id: Identifier,
    manifest: RuleManifestResponseSchema,
    rules: z.array(RuleDefinitionResponseSchema).max(5_000),
    installedAt: z.iso.datetime(),
    activatedAt: z.iso.datetime().nullable(),
    active: z.boolean(),
  })
  .strict();

export const RulePackListQuerySchema = z
  .object({ platformId: PlatformId, region: z.string().trim().min(2).max(20) })
  .strict();
export const RulePackParamsSchema = z.object({ id: Identifier }).strict();
export const RulePackDiffQuerySchema = z.object({ against: Identifier }).strict();

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
export const ImportRulePackInputSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('json'), contents: z.string().min(1).max(2_000_000) }).strict(),
  z
    .object({
      format: z.literal('zip-base64'),
      contents: z.string().min(4).max(8_000_000).regex(BASE64),
    })
    .strict(),
]);

export const RulePackListResponseSchema = z
  .object({ items: z.array(RulePackRecordResponseSchema) })
  .strict();
export const RulePackDiffResponseSchema = z
  .object({
    added: z.array(RuleDefinitionResponseSchema),
    removed: z.array(RuleDefinitionResponseSchema),
    changed: z.array(
      z
        .object({
          key: RuleKey,
          before: RuleDefinitionResponseSchema,
          after: RuleDefinitionResponseSchema,
        })
        .strict(),
    ),
  })
  .strict();

export type RulePackRecordResponse = z.infer<typeof RulePackRecordResponseSchema>;
export type RulePackDiffResponse = z.infer<typeof RulePackDiffResponseSchema>;
