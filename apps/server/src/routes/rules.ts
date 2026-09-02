import type { RulePacksApplication } from '@eaw/application';
import {
  ImportRulePackInputSchema,
  RulePackDiffQuerySchema,
  RulePackDiffResponseSchema,
  RulePackListQuerySchema,
  RulePackListResponseSchema,
  RulePackParamsSchema,
  RulePackRecordResponseSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerRuleRoutes(
  app: FastifyInstance,
  application: RulePacksApplication | undefined,
): void {
  const required = () => {
    if (!application)
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Rule packs are not configured.');
    return application;
  };
  app.get('/api/v1/rule-packs', async (request) => {
    const query = parse(RulePackListQuerySchema.safeParse(request.query));
    const items = await required().list(query.platformId, query.region);
    return RulePackListResponseSchema.parse({ items: items.map(rulePackResponse) });
  });
  app.post('/api/v1/rule-packs/import', async (request, reply) => {
    const body = parse(ImportRulePackInputSchema.safeParse(request.body));
    const input =
      body.format === 'json' ? body.contents : new Uint8Array(Buffer.from(body.contents, 'base64'));
    const installed = await required().import(input);
    reply.code(201);
    return RulePackRecordResponseSchema.parse(rulePackResponse(installed));
  });
  app.post('/api/v1/rule-packs/:id/activate', async (request) => {
    const params = parse(RulePackParamsSchema.safeParse(request.params));
    return RulePackRecordResponseSchema.parse(
      rulePackResponse(await required().activate(params.id)),
    );
  });
  app.get('/api/v1/rule-packs/:id/diff', async (request) => {
    const params = parse(RulePackParamsSchema.safeParse(request.params));
    const query = parse(RulePackDiffQuerySchema.safeParse(request.query));
    return RulePackDiffResponseSchema.parse(await required().diff(query.against, params.id));
  });
}

function rulePackResponse(record: Awaited<ReturnType<RulePacksApplication['activate']>>) {
  return {
    id: record.id,
    manifest: record.pack.manifest,
    rules: record.pack.rules,
    installedAt: record.installedAt.toISOString(),
    activatedAt: record.activatedAt?.toISOString() ?? null,
    active: record.active,
  };
}

function parse<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 'Rule pack request is invalid.');
  return result.data;
}
