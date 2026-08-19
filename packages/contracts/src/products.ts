import { z } from 'zod';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const CreateProductInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const ProductIdParamsSchema = z
  .object({
    productId: z.string().regex(UUID_V7_PATTERN),
  })
  .strict();

export const ProductResponseSchema = z
  .object({
    id: z.string().regex(UUID_V7_PATTERN),
    name: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const ProductListResponseSchema = z
  .object({ items: z.array(ProductResponseSchema) })
  .strict();

export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;
export type ProductIdParams = z.infer<typeof ProductIdParamsSchema>;
export type ProductResponse = z.infer<typeof ProductResponseSchema>;
export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;
