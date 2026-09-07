import type {
  ContentBuildersApplication,
  CreativePlanView,
  DetailPageView,
} from '@eaw/application';
import {
  ContentItemParamsSchema,
  ContentParamsSchema,
  ContentQuerySchema,
  ContentReorderInputSchema,
  ContentSectionParamsSchema,
  CreativePlanListResponseSchema,
  CreativePlanViewResponseSchema,
  DetailPageListResponseSchema,
  DetailPageViewResponseSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerContentBuilderRoutes(
  app: FastifyInstance,
  application: ContentBuildersApplication | undefined,
): void {
  const required = () => {
    if (!application)
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Content builders are unavailable.');
    return application;
  };
  const creative = '/api/v1/products/:productId/creative';
  app.get(creative, async (request) =>
    CreativePlanListResponseSchema.parse({
      items: (
        await required().listCreative(params(request.params).productId, query(request.query))
      ).map(creativeResponse),
    }),
  );
  app.post(`${creative}/generate`, async (request) =>
    CreativePlanViewResponseSchema.parse(
      creativeResponse(
        await required().generateCreative(params(request.params).productId, query(request.query)),
      ),
    ),
  );
  app.post(`${creative}/items/:itemId/regenerate`, async (request) => {
    const value = itemParams(request.params);
    return CreativePlanViewResponseSchema.parse(
      creativeResponse(
        await required().regenerateCreativeItem(
          value.productId,
          query(request.query),
          value.itemId,
        ),
      ),
    );
  });
  app.post(`${creative}/items/:itemId/lock`, async (request) => {
    const value = itemParams(request.params);
    return CreativePlanViewResponseSchema.parse(
      creativeResponse(
        await required().lockCreativeItem(value.productId, query(request.query), value.itemId),
      ),
    );
  });
  app.post(`${creative}/reorder`, async (request) => {
    const body = reorder(request.body);
    return CreativePlanViewResponseSchema.parse(
      creativeResponse(
        await required().reorderCreative(
          params(request.params).productId,
          query(request.query),
          body.orderedIds,
        ),
      ),
    );
  });
  const detail = '/api/v1/products/:productId/detail';
  app.get(detail, async (request) =>
    DetailPageListResponseSchema.parse({
      items: (
        await required().listDetail(params(request.params).productId, query(request.query))
      ).map(detailResponse),
    }),
  );
  app.post(`${detail}/generate`, async (request) =>
    DetailPageViewResponseSchema.parse(
      detailResponse(
        await required().generateDetail(params(request.params).productId, query(request.query)),
      ),
    ),
  );
  app.post(`${detail}/sections/:sectionId/lock`, async (request) => {
    const value = sectionParams(request.params);
    return DetailPageViewResponseSchema.parse(
      detailResponse(
        await required().lockDetailSection(value.productId, query(request.query), value.sectionId),
      ),
    );
  });
  app.post(`${detail}/reorder`, async (request) => {
    const body = reorder(request.body);
    return DetailPageViewResponseSchema.parse(
      detailResponse(
        await required().reorderDetail(
          params(request.params).productId,
          query(request.query),
          body.orderedIds,
        ),
      ),
    );
  });
}
function params(value: unknown) {
  const parsed = ContentParamsSchema.safeParse(value);
  if (!parsed.success) throw invalid();
  return parsed.data;
}
function itemParams(value: unknown) {
  const parsed = ContentItemParamsSchema.safeParse(value);
  if (!parsed.success) throw invalid();
  return parsed.data;
}
function sectionParams(value: unknown) {
  const parsed = ContentSectionParamsSchema.safeParse(value);
  if (!parsed.success) throw invalid();
  return parsed.data;
}
function query(value: unknown) {
  const parsed = ContentQuerySchema.safeParse(value);
  if (!parsed.success) throw invalid();
  return parsed.data.platformId;
}
function reorder(value: unknown) {
  const parsed = ContentReorderInputSchema.safeParse(value);
  if (!parsed.success) throw invalid();
  return parsed.data;
}
function invalid() {
  return new DomainError('VALIDATION_ERROR', 'Content builder request is invalid.');
}
function creativeResponse(view: CreativePlanView) {
  return {
    ...view,
    revision: { ...view.revision, createdAt: view.revision.createdAt.toISOString() },
  };
}
function detailResponse(view: DetailPageView) {
  return {
    ...view,
    revision: { ...view.revision, createdAt: view.revision.createdAt.toISOString() },
  };
}
