import type { ProductsApplication } from '@eaw/application';
import {
  CreateProductInputSchema,
  ProductIdParamsSchema,
  ProductListResponseSchema,
  ProductResponseSchema,
} from '@eaw/contracts';
import { DomainError, type Product } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';

export function registerProductRoutes(
  app: FastifyInstance,
  products: ProductsApplication | undefined,
): void {
  app.post('/api/v1/products', async (request, reply) => {
    const input = parseOrValidationError(CreateProductInputSchema.safeParse(request.body));
    const product = await requireProductsApplication(products).create(input);
    return reply.code(201).send(toProductResponse(product));
  });

  app.get('/api/v1/products', async () => {
    const items = await requireProductsApplication(products).list();
    return ProductListResponseSchema.parse({ items: items.map(toProductResponse) });
  });

  app.get('/api/v1/products/:productId', async (request) => {
    const params = parseOrValidationError(ProductIdParamsSchema.safeParse(request.params));
    return toProductResponse(await requireProductsApplication(products).get(params.productId));
  });

  app.post('/api/v1/products/:productId/archive', async (request) => {
    const params = parseOrValidationError(ProductIdParamsSchema.safeParse(request.params));
    return toProductResponse(await requireProductsApplication(products).archive(params.productId));
  });
}

function requireProductsApplication(products: ProductsApplication | undefined): ProductsApplication {
  if (products === undefined) {
    throw new DomainError('CAPABILITY_UNAVAILABLE', 'Products application is not configured.');
  }
  return products;
}

function parseOrValidationError<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success) {
    throw new DomainError('VALIDATION_ERROR', 'Product request is invalid.');
  }
  return result.data;
}

function toProductResponse(product: Product) {
  return ProductResponseSchema.parse({
    id: product.id,
    name: product.name,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  });
}
