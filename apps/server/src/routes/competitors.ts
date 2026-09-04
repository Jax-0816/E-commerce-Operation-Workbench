import type { CompetitorsApplication } from '@eaw/application';
import {
  CompetitorImportPreviewResponseSchema,
  CompetitorListResponseSchema,
  CompetitorParamsSchema,
  CompetitorSnapshotsResponseSchema,
  ConfirmCompetitorImportInputSchema,
  ConfirmCompetitorImportResponseSchema,
  PreviewCompetitorImportInputSchema,
  ProductCompetitorParamsSchema,
} from '@eaw/contracts';
import { DomainError, type Competitor, type CompetitorSnapshot } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerCompetitorRoutes(
  app: FastifyInstance,
  application: CompetitorsApplication | undefined,
): void {
  const required = () => {
    if (!application) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Competitor imports are not configured.');
    }
    return application;
  };
  app.post(
    '/api/v1/products/:productId/competitors/import/preview',
    { bodyLimit: 7_000_000 },
    async (request) => {
      const { productId } = parse(
        ProductCompetitorParamsSchema.safeParse(request.params),
        'Competitor route is invalid.',
      );
      const body = parse(
        PreviewCompetitorImportInputSchema.safeParse(request.body),
        'Competitor preview request is invalid.',
      );
      const preview = await required().preview(
        productId,
        body.format === 'xlsx'
          ? {
              format: body.format,
              sourceName: body.sourceName,
              content: Buffer.from(body.contentsBase64, 'base64'),
            }
          : body,
      );
      return CompetitorImportPreviewResponseSchema.parse(preview);
    },
  );
  app.post('/api/v1/products/:productId/competitors/import/confirm', async (request) => {
    const { productId } = parse(
      ProductCompetitorParamsSchema.safeParse(request.params),
      'Competitor route is invalid.',
    );
    const body = parse(
      ConfirmCompetitorImportInputSchema.safeParse(request.body),
      'Competitor confirm request is invalid.',
    );
    const entries = await required().confirm(productId, body);
    return ConfirmCompetitorImportResponseSchema.parse({
      items: entries.map(({ competitor, snapshot }) => ({
        competitor: competitorResponse(competitor),
        snapshot: snapshotResponse(snapshot),
      })),
    });
  });
  app.get('/api/v1/products/:productId/competitors', async (request) => {
    const { productId } = parse(
      ProductCompetitorParamsSchema.safeParse(request.params),
      'Competitor route is invalid.',
    );
    const items = await required().list(productId);
    return CompetitorListResponseSchema.parse({
      items: items.map(({ competitor, latestSnapshot }) => ({
        competitor: competitorResponse(competitor),
        latestSnapshot: snapshotResponse(latestSnapshot),
      })),
    });
  });
  app.get('/api/v1/products/:productId/competitors/:competitorId/snapshots', async (request) => {
    const { productId, competitorId } = parse(
      CompetitorParamsSchema.safeParse(request.params),
      'Competitor route is invalid.',
    );
    return CompetitorSnapshotsResponseSchema.parse({
      items: (await required().listSnapshots(productId, competitorId)).map(snapshotResponse),
    });
  });
}

function competitorResponse(competitor: Competitor) {
  return {
    ...competitor,
    createdAt: competitor.createdAt.toISOString(),
    updatedAt: competitor.updatedAt.toISOString(),
    archivedAt: competitor.archivedAt?.toISOString() ?? null,
  };
}

function snapshotResponse(snapshot: CompetitorSnapshot) {
  return {
    ...snapshot,
    capturedAt: snapshot.capturedAt.toISOString(),
    importedAt: snapshot.importedAt.toISOString(),
  };
}

function parse<T>(result: { success: true; data: T } | { success: false }, message: string): T {
  if (!result.success) throw new DomainError('VALIDATION_ERROR', message);
  return result.data;
}
