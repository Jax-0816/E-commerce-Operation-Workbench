import { z } from 'zod';

const CountSchema = z.number().int().nonnegative().safe();

export const SystemStatusResponseSchema = z
  .object({
    appVersion: z.string().trim().min(1).max(80),
    localOnly: z.literal(true),
    bindAddress: z.literal('127.0.0.1'),
    ai: z
      .object({
        provider: z.literal('deepseek'),
        model: z.literal('deepseek-chat'),
        configured: z.boolean(),
      })
      .strict(),
    prompts: z.object({ installedCount: CountSchema, activeCount: CountSchema }).strict(),
    rules: z
      .object({
        installedCount: CountSchema,
        activePinduoduoCnVersion: z.string().trim().min(1).max(160).nullable(),
        unresolvedActiveRuleCount: CountSchema,
      })
      .strict(),
  })
  .strict();

export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
