import { z } from 'zod';
const UuidV7Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const OptionalField = z.string().trim().min(1).max(120).nullable();
export const ConfigureSkusInputSchema = z
  .object({
    dimensions: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            values: z.array(z.string().trim().min(1).max(120)).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const UpdateSkuInputSchema = z
  .object({
    enabled: z.boolean(),
    internalCode: OptionalField,
    externalCode: OptionalField,
    barcode: OptionalField,
    weightGrams: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const SkuParamsSchema = z.object({ productId: UuidV7Schema, skuId: UuidV7Schema }).strict();
export const SkusParamsSchema = z.object({ productId: UuidV7Schema }).strict();
export const SkuMatrixResponseSchema = z
  .object({
    dimensions: z.array(
      z
        .object({
          id: UuidV7Schema,
          name: z.string(),
          position: z.number().int(),
          values: z.array(
            z.object({ id: UuidV7Schema, label: z.string(), position: z.number().int() }).strict(),
          ),
        })
        .strict(),
    ),
    skus: z.array(
      z
        .object({
          id: UuidV7Schema,
          signature: z.string(),
          valueIds: z.array(UuidV7Schema),
          enabled: z.boolean(),
          internalCode: OptionalField,
          externalCode: OptionalField,
          barcode: OptionalField,
          weightGrams: z.number().int().nonnegative().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type SkuMatrixResponse = z.infer<typeof SkuMatrixResponseSchema>;
