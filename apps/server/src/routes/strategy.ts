import type { StrategyApplication } from '@eaw/application';
import {
  StrategyAssetListResponseSchema,
  StrategyAssetResponseSchema,
  StrategyParamsSchema,
} from '@eaw/contracts';
import { DomainError, type StrategyAsset } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerStrategyRoutes(
  app: FastifyInstance,
  application: StrategyApplication | undefined,
): void {
  const required = () => {
    if (!application) throw new DomainError('CAPABILITY_UNAVAILABLE', 'Strategy is unavailable.');
    return application;
  };
  app.post('/api/v1/products/:productId/strategy/:kind/generate', async (request) => {
    const params = parseParams(request.params);
    return StrategyAssetResponseSchema.parse(
      response(await required().generate(params.productId, params.kind)),
    );
  });
  app.get('/api/v1/products/:productId/strategy/:kind', async (request) => {
    const params = parseParams(request.params);
    return StrategyAssetListResponseSchema.parse({
      items: (await required().list(params.productId, params.kind)).map(response),
    });
  });
}

function parseParams(value: unknown) {
  const parsed = StrategyParamsSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Strategy request is invalid.');
  return parsed.data;
}

function response(asset: StrategyAsset) {
  return { ...asset, createdAt: asset.createdAt.toISOString() };
}
