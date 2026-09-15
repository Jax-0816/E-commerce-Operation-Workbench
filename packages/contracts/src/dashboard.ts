import { z } from 'zod';

const CountSchema = z.number().int().nonnegative().safe();

export const DashboardAttentionCodeSchema = z.enum([
  'missing_cost_profiles',
  'loss_making_results',
  'stale_assets',
  'rule_review_required',
  'active_rule_pack_missing',
  'ai_not_configured',
]);

export const DashboardAttentionItemSchema = z
  .object({
    code: DashboardAttentionCodeSchema,
    severity: z.enum(['critical', 'warning', 'info']),
    count: CountSchema,
    label: z.string().trim().min(1).max(160),
    explanation: z.string().trim().min(1).max(500),
    href: z
      .string()
      .max(500)
      .refine((value) => value.startsWith('/') && !value.startsWith('//'), {
        message: 'Dashboard attention links must be internal absolute paths.',
      }),
  })
  .strict();

export const DashboardResponseSchema = z
  .object({
    summary: z
      .object({
        productCount: CountSchema,
        enabledSkuCount: CountSchema,
        missingCostProfileCount: CountSchema,
        staleAssetCount: CountSchema,
        lossMakingResultCount: CountSchema,
        ruleRiskCount: CountSchema,
      })
      .strict(),
    configuration: z
      .object({
        aiConfigured: z.boolean(),
        pinduoduoRulePackActive: z.boolean(),
      })
      .strict(),
    attention: z.array(DashboardAttentionItemSchema).max(6),
  })
  .strict();

export type DashboardAttentionCode = z.infer<typeof DashboardAttentionCodeSchema>;
export type DashboardAttentionItem = z.infer<typeof DashboardAttentionItemSchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
