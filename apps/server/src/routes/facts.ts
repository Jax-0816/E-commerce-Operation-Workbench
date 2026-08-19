import type { FactsApplication } from '@eaw/application';
import {
  ConfirmFactInputSchema,
  CreateFactInputSchema,
  DeleteFactInputSchema,
  ProductFactListResponseSchema,
  ProductFactParamsSchema,
  ProductFactResponseSchema,
  ProductFactsParamsSchema,
  ReviseFactInputSchema,
  UpdateFactInputSchema,
} from '@eaw/contracts';
import { DomainError, type ProductFact } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerFactRoutes(
  app: FastifyInstance,
  facts: FactsApplication | undefined,
): void {
  app.post('/api/v1/products/:productId/facts', async (request, reply) => {
    const { productId } = parse(ProductFactsParamsSchema.safeParse(request.params));
    const input = parse(CreateFactInputSchema.safeParse(request.body));
    const fact = await requireFacts(facts).create(productId, input);
    return reply.code(201).send(toFactResponse(fact));
  });

  app.get('/api/v1/products/:productId/facts', async (request) => {
    const { productId } = parse(ProductFactsParamsSchema.safeParse(request.params));
    const items = await requireFacts(facts).list(productId);
    return ProductFactListResponseSchema.parse({ items: items.map(toFactResponse) });
  });

  app.get('/api/v1/products/:productId/facts/:factId', async (request) => {
    const { productId, factId } = parse(ProductFactParamsSchema.safeParse(request.params));
    return toFactResponse(await requireFacts(facts).get(productId, factId));
  });

  app.patch('/api/v1/products/:productId/facts/:factId', async (request) => {
    const { productId, factId } = parse(ProductFactParamsSchema.safeParse(request.params));
    const input = parse(UpdateFactInputSchema.safeParse(request.body));
    return toFactResponse(
      await requireFacts(facts).update(productId, factId, {
        ...input,
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      }),
    );
  });

  app.post('/api/v1/products/:productId/facts/:factId/confirm', async (request) => {
    const { productId, factId } = parse(ProductFactParamsSchema.safeParse(request.params));
    const input = parse(ConfirmFactInputSchema.safeParse(request.body));
    return toFactResponse(
      await requireFacts(facts).confirm(productId, factId, {
        ...input,
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      }),
    );
  });

  app.post('/api/v1/products/:productId/facts/:factId/revisions', async (request, reply) => {
    const { productId, factId } = parse(ProductFactParamsSchema.safeParse(request.params));
    const input = parse(ReviseFactInputSchema.safeParse(request.body));
    const revision = await requireFacts(facts).revise(productId, factId, input);
    return reply.code(201).send(toFactResponse(revision));
  });

  app.delete('/api/v1/products/:productId/facts/:factId', async (request, reply) => {
    const { productId, factId } = parse(ProductFactParamsSchema.safeParse(request.params));
    const input = parse(DeleteFactInputSchema.safeParse(request.body));
    await requireFacts(facts).delete(productId, factId, {
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
    });
    return reply.code(204).send();
  });
}

function requireFacts(facts: FactsApplication | undefined): FactsApplication {
  if (facts === undefined)
    throw new DomainError('CAPABILITY_UNAVAILABLE', 'Facts application is not configured.');
  return facts;
}

function parse<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success)
    throw new DomainError('VALIDATION_ERROR', 'Product fact request is invalid.');
  return result.data;
}

function toFactResponse(fact: ProductFact) {
  return ProductFactResponseSchema.parse({
    id: fact.id,
    productId: fact.productId,
    key: fact.key,
    label: fact.label,
    value: fact.value,
    unit: fact.unit,
    sourceType: fact.sourceType,
    sourceRef: fact.sourceRef,
    verification: fact.verification,
    sensitive: fact.sensitive,
    policyEligible: fact.policyEligible,
    revisionNo: fact.revisionNo,
    supersedesFactId: fact.supersedesFactId,
    createdAt: fact.createdAt.toISOString(),
    updatedAt: fact.updatedAt.toISOString(),
    confirmedAt: fact.confirmedAt?.toISOString() ?? null,
    confirmation: fact.confirmation,
  });
}
