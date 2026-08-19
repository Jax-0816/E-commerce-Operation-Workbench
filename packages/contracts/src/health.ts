import { z } from 'zod';

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok'),
    appVersion: z.string().min(1),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
