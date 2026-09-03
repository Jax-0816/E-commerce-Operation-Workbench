import { z } from 'zod';

export const AISettingsResponseSchema = z
  .object({
    provider: z.literal('deepseek'),
    configured: z.boolean(),
    model: z.literal('deepseek-chat'),
  })
  .strict();

export const ConfigureAISettingsInputSchema = z
  .object({ apiKey: z.string().trim().min(8).max(500) })
  .strict();

export const TestAIConnectionResponseSchema = z.object({ ok: z.boolean() }).strict();

export type AISettingsResponse = z.infer<typeof AISettingsResponseSchema>;
