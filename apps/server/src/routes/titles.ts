import type { TitlesApplication } from '@eaw/application';
import {
  EditTitlesInputSchema,
  TitleAssetListResponseSchema,
  TitleAssetViewResponseSchema,
  TitleParamsSchema,
  TitleQuerySchema,
} from '@eaw/contracts';
import { DomainError, type TitleAssetView } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerTitleRoutes(
  app: FastifyInstance,
  application: TitlesApplication | undefined,
): void {
  const required = () => {
    if (!application)
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Title studio is unavailable.');
    return application;
  };
  const route = '/api/v1/products/:productId/titles';
  app.get(route, async (request) => {
    const { productId } = params(request.params);
    const { platformId } = query(request.query);
    return TitleAssetListResponseSchema.parse({
      items: (await required().list(productId, platformId)).map(response),
    });
  });
  app.post(`${route}/generate`, async (request) => {
    const { productId } = params(request.params);
    const { platformId } = query(request.query);
    return TitleAssetViewResponseSchema.parse(
      response(await required().generate(productId, platformId)),
    );
  });
  app.put(route, async (request) => {
    const { productId } = params(request.params);
    const { platformId } = query(request.query);
    const body = EditTitlesInputSchema.safeParse(request.body);
    if (!body.success) throw new DomainError('VALIDATION_ERROR', 'Title edit is invalid.');
    return TitleAssetViewResponseSchema.parse(
      response(await required().edit(productId, platformId, body.data.titles)),
    );
  });
  app.post(`${route}/lock`, async (request) => {
    const { productId } = params(request.params);
    const { platformId } = query(request.query);
    return TitleAssetViewResponseSchema.parse(
      response(await required().lock(productId, platformId)),
    );
  });
}
function params(value: unknown) {
  const result = TitleParamsSchema.safeParse(value);
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 'Title params are invalid.');
  return result.data;
}
function query(value: unknown) {
  const result = TitleQuerySchema.safeParse(value);
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 'Title query is invalid.');
  return result.data;
}
function response(view: TitleAssetView) {
  return {
    ...view,
    revision: { ...view.revision, createdAt: view.revision.createdAt.toISOString() },
  };
}
