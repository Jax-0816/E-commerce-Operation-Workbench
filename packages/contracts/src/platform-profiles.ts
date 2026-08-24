import { z } from 'zod';

import { PLATFORM_IDS } from '@eaw/domain';

const UUID_V7 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

export const PlatformIdSchema = z.enum(PLATFORM_IDS);
export const SavePlatformProfileInputSchema = z
  .object({
    categoryCode: optionalText(120),
    categoryName: optionalText(200),
    externalProductId: optionalText(200),
    title: optionalText(300),
    description: optionalText(5000),
    metadata: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(1000)),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
export const PlatformProfileParamsSchema = z
  .object({ productId: UUID_V7, platformId: PlatformIdSchema })
  .strict();
export const PlatformProfilesParamsSchema = z.object({ productId: UUID_V7 }).strict();
export const PlatformProfileResponseSchema = z
  .object({
    id: UUID_V7,
    productId: UUID_V7,
    platformId: PlatformIdSchema,
    categoryCode: optionalText(120),
    categoryName: optionalText(200),
    externalProductId: optionalText(200),
    title: optionalText(300),
    description: optionalText(5000),
    metadata: z.record(z.string(), z.string()),
    status: z.enum(['draft', 'ready']),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const PlatformProfileListResponseSchema = z
  .object({ items: z.array(PlatformProfileResponseSchema) })
  .strict();
