import type { SkusApplication } from '@eaw/application';
import {
  ConfigureSkusInputSchema,
  SkuMatrixResponseSchema,
  SkuParamsSchema,
  SkusParamsSchema,
  UpdateSkuInputSchema,
} from '@eaw/contracts';
import { DomainError } from '@eaw/domain';
import type { FastifyInstance } from 'fastify';
export function registerSkuRoutes(app: FastifyInstance, skus: SkusApplication | undefined): void {
  const need = () => {
    if (!skus)
      throw new DomainError('CAPABILITY_UNAVAILABLE', 'SKU application is not configured.');
    return skus;
  };
  app.get('/api/v1/products/:productId/skus', async (req) => {
    const p = parse(SkusParamsSchema.safeParse(req.params));
    return response(await need().get(p.productId));
  });
  app.put('/api/v1/products/:productId/skus', async (req) => {
    const p = parse(SkusParamsSchema.safeParse(req.params)),
      b = parse(ConfigureSkusInputSchema.safeParse(req.body));
    return response(await need().configure(p.productId, b.dimensions));
  });
  app.patch('/api/v1/products/:productId/skus/:skuId', async (req) => {
    const p = parse(SkuParamsSchema.safeParse(req.params)),
      b = parse(UpdateSkuInputSchema.safeParse(req.body));
    await need().update(p.productId, p.skuId, b);
    return response(await need().get(p.productId));
  });
}
function parse<T>(r: { success: true; data: T } | { success: false }): T {
  if (!r.success) throw new DomainError('VALIDATION_ERROR', 'SKU request is invalid.');
  return r.data;
}
function response(m: Awaited<ReturnType<SkusApplication['get']>>) {
  return SkuMatrixResponseSchema.parse({
    dimensions: m.dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      position: d.position,
      values: d.values.map((v) => ({ id: v.id, label: v.label, position: v.position })),
    })),
    skus: m.skus.map(
      ({ id, signature, valueIds, enabled, internalCode, externalCode, barcode, weightGrams }) => ({
        id,
        signature,
        valueIds,
        enabled,
        internalCode,
        externalCode,
        barcode,
        weightGrams,
      }),
    ),
  });
}
