import type { OperationPlansApplication } from '@eaw/application';
import {
  CreateOperationPlanInputSchema,
  LockOperationPlanInputSchema,
  OperationPlanParamsSchema,
  ProductOperationPlansParamsSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerOperationPlanRoutes(
  app: FastifyInstance,
  operationPlans: OperationPlansApplication | undefined,
): void {
  const required = (): OperationPlansApplication => {
    if (!operationPlans) {
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'Operation plans are unavailable.');
    }
    return operationPlans;
  };

  app.post('/api/v1/products/:productId/operation-plans', async (request, reply) => {
    const { productId } = parse(ProductOperationPlansParamsSchema.safeParse(request.params));
    const input = parse(CreateOperationPlanInputSchema.safeParse(request.body));
    return reply.code(201).send(response(await required().createDraft(productId, input)));
  });

  app.get('/api/v1/products/:productId/operation-plans', async (request) => {
    const { productId } = parse(ProductOperationPlansParamsSchema.safeParse(request.params));
    return { items: (await required().list(productId)).map(response) };
  });

  app.get('/api/v1/operation-plans/:operationPlanId', async (request) => {
    const { operationPlanId } = parse(OperationPlanParamsSchema.safeParse(request.params));
    return response(await required().get(operationPlanId));
  });

  app.post('/api/v1/operation-plans/:operationPlanId/lock', async (request, reply) => {
    const { operationPlanId } = parse(OperationPlanParamsSchema.safeParse(request.params));
    const { expectedRevisionNo } = parse(LockOperationPlanInputSchema.safeParse(request.body));
    return reply
      .code(201)
      .send(response(await required().lock(operationPlanId, expectedRevisionNo)));
  });
}

function response(plan: Awaited<ReturnType<OperationPlansApplication['get']>>) {
  return {
    ...plan,
    lockedAt: plan.lockedAt?.toISOString() ?? null,
    createdAt: plan.createdAt.toISOString(),
  };
}

function parse<T>(
  result: { readonly success: true; readonly data: T } | { readonly success: false },
): T {
  if (!result.success) {
    throw new DomainError('VALIDATION_ERROR', 'Operation plan request is invalid.');
  }
  return result.data;
}
