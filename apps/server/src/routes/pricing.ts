import type { PricingApplication } from '@eaw/application';
import { moneyFromMinorUnits } from '@eaw/calculation-engine';
import {
  CalculatePricingInputSchema,
  CostPricingParamsSchema,
  PricingCalculationResponseSchema,
  PricingHistoryResponseSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerPricingRoutes(
  app: FastifyInstance,
  pricing: PricingApplication | undefined,
): void {
  const required = () => {
    if (!pricing)
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Pricing application is not configured.');
    return pricing;
  };
  app.post('/api/v1/products/:productId/skus/:skuId/pricing-calculations', async (request) => {
    const params = parse(CostPricingParamsSchema.safeParse(request.params));
    const body = parse(CalculatePricingInputSchema.safeParse(request.body));
    const profile = await required().getCostProfile(params.productId, params.skuId);
    if (!profile) throw new DomainError('VALIDATION_ERROR', 'SKU cost profile is missing.');
    const goal =
      body.goal.type === 'target_unit_profit'
        ? ({
            type: body.goal.type,
            amount: moneyFromMinorUnits(BigInt(body.goal.amountMinorUnits), profile.currency),
          } as const)
        : body.goal.type === 'break_even'
          ? ({ type: body.goal.type } as const)
          : ({ type: body.goal.type, basisPoints: BigInt(body.goal.basisPoints) } as const);
    let result: Awaited<ReturnType<PricingApplication['calculate']>>;
    try {
      result = await required().calculate(params.productId, params.skuId, {
        name: body.name,
        goal,
        search: {
          minimumMinorUnits: BigInt(body.minimumMinorUnits),
          maximumMinorUnits: BigInt(body.maximumMinorUnits),
        },
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (
        error instanceof RangeError ||
        error instanceof TypeError ||
        error instanceof ReferenceError
      ) {
        throw new DomainError('CALCULATION_INVALID', 'Pricing calculation is invalid.');
      }
      throw error;
    }
    return PricingCalculationResponseSchema.parse(jsonExact(result));
  });
  app.get('/api/v1/products/:productId/skus/:skuId/pricing-history', async (request) => {
    const params = parse(CostPricingParamsSchema.safeParse(request.params));
    const items = await required().listHistory(params.productId, params.skuId);
    return PricingHistoryResponseSchema.parse(jsonExact({ items }));
  });
}

function jsonExact(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonExact);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonExact(child)]));
  }
  return value;
}

function parse<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 'Pricing request is invalid.');
  return result.data;
}
