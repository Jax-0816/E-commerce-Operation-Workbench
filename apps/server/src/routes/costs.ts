import type { PricingApplication } from '@eaw/application';
import {
  CostPricingParamsSchema,
  CostProfileResponseSchema,
  SaveCostProfileInputSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerCostRoutes(
  app: FastifyInstance,
  pricing: PricingApplication | undefined,
): void {
  const required = () => {
    if (!pricing)
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Pricing application is not configured.');
    return pricing;
  };
  app.get('/api/v1/products/:productId/skus/:skuId/cost-profile', async (request) => {
    const params = parse(CostPricingParamsSchema.safeParse(request.params));
    const profile = await required().getCostProfile(params.productId, params.skuId);
    if (!profile) throw new DomainError('NOT_FOUND', 'Cost profile was not found.');
    return costProfileResponse(profile);
  });
  app.put('/api/v1/products/:productId/skus/:skuId/cost-profile', async (request) => {
    const params = parse(CostPricingParamsSchema.safeParse(request.params));
    const body = parse(SaveCostProfileInputSchema.safeParse(request.body));
    return costProfileResponse(
      await required().saveCostProfile(params.productId, params.skuId, body),
    );
  });
}

function costProfileResponse(profile: Awaited<ReturnType<PricingApplication['saveCostProfile']>>) {
  return CostProfileResponseSchema.parse({
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  });
}

function parse<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success)
    throw new DomainError('VALIDATION_ERROR', 'Cost profile request is invalid.');
  return result.data;
}
