import type {
  CreatePromotionScenarioInput as ApplicationCreatePromotionScenarioInput,
  PromotionApplication,
} from '@eaw/application';
import { moneyFromMinorUnits } from '@eaw/calculation-engine';
import {
  CalculatePromotionBatchInputSchema,
  CreatePromotionScenarioInputSchema,
  ProductPromotionParamsSchema,
  PromotionBatchResponseSchema,
  PromotionHistoryResponseSchema,
  PromotionScenarioParamsSchema,
  PromotionScenarioResponseSchema,
  type CreatePromotionScenarioInput,
} from '@eaw/contracts';
import { DomainError, parseUuidV7 } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerPromotionRoutes(
  app: FastifyInstance,
  promotions: PromotionApplication | undefined,
): void {
  const required = () => {
    if (!promotions) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Promotion application is not configured.');
    }
    return promotions;
  };

  app.post('/api/v1/products/:productId/promotion-scenarios', async (request) => {
    const params = parse(ProductPromotionParamsSchema.safeParse(request.params));
    const body = parse(CreatePromotionScenarioInputSchema.safeParse(request.body));
    const scenario = await required().createScenario(params.productId, {
      name: body.name,
      region: body.region,
      categoryCode: body.categoryCode,
      components: body.components.map(toComponent),
      search: {
        minimumMinorUnits: BigInt(body.minimumMinorUnits),
        maximumMinorUnits: BigInt(body.maximumMinorUnits),
      },
    });
    return PromotionScenarioResponseSchema.parse(jsonExact(scenario));
  });

  app.post('/api/v1/promotion-scenarios/:scenarioId/calculate', async (request) => {
    const params = parse(PromotionScenarioParamsSchema.safeParse(request.params));
    const body = parse(CalculatePromotionBatchInputSchema.safeParse(request.body));
    try {
      const result = await required().calculate(
        params.scenarioId,
        body.rows.map((row) => ({
          skuId: parseUuidV7(row.skuId),
          campaignPrice: moneyFromMinorUnits(
            BigInt(row.campaignPrice.minorUnits),
            row.campaignPrice.currency,
          ),
        })),
      );
      return PromotionBatchResponseSchema.parse(jsonExact(result));
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (
        error instanceof RangeError ||
        error instanceof TypeError ||
        error instanceof ReferenceError
      ) {
        throw new DomainError('CALCULATION_INVALID', 'Promotion calculation is invalid.');
      }
      throw error;
    }
  });

  app.get('/api/v1/products/:productId/promotion-scenarios', async (request) => {
    const params = parse(ProductPromotionParamsSchema.safeParse(request.params));
    const items = await required().list(params.productId);
    return PromotionHistoryResponseSchema.parse(jsonExact({ items }));
  });
}

function toComponent(
  input: CreatePromotionScenarioInput['components'][number],
): ApplicationCreatePromotionScenarioInput['components'][number] {
  const common = {
    key: input.key,
    funder: input.funder,
    priority: input.priority,
    threshold: moneyFromMinorUnits(BigInt(input.threshold.minorUnits), input.threshold.currency),
  };
  if (input.kind === 'fixed_reduction' || input.kind === 'coupon') {
    return {
      ...common,
      kind: input.kind,
      amount: moneyFromMinorUnits(BigInt(input.amount.minorUnits), input.amount.currency),
    };
  }
  return {
    ...common,
    kind: input.kind,
    payRateBasisPoints: BigInt(input.payRateBasisPoints),
    maximumReduction:
      input.maximumReduction === null
        ? null
        : moneyFromMinorUnits(
            BigInt(input.maximumReduction.minorUnits),
            input.maximumReduction.currency,
          ),
  };
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
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 'Promotion request is invalid.');
  return result.data;
}
