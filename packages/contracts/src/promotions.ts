import { z } from 'zod';

const UUID_V7 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const ExactInteger = z
  .string()
  .max(128)
  .regex(/^(0|[1-9][0-9]*)$/u);
const SignedInteger = z
  .string()
  .max(129)
  .regex(/^-?(0|[1-9][0-9]*)$/u);
const Money = z
  .object({ currency: z.string().regex(/^[A-Z]{3}$/u), minorUnits: ExactInteger })
  .strict();
const SignedMoney = z
  .object({ currency: z.string().regex(/^[A-Z]{3}$/u), minorUnits: SignedInteger })
  .strict();
const ComponentCommon = {
  key: z.string().regex(/^[a-z][a-z0-9_.-]{0,119}$/u),
  funder: z.enum(['merchant', 'platform']),
  priority: z.number().int().nonnegative(),
  threshold: Money,
};
export const PromotionComponentSchema = z.discriminatedUnion('kind', [
  z.object({ ...ComponentCommon, kind: z.literal('fixed_reduction'), amount: Money }).strict(),
  z.object({ ...ComponentCommon, kind: z.literal('coupon'), amount: Money }).strict(),
  z
    .object({
      ...ComponentCommon,
      kind: z.literal('percentage_discount'),
      payRateBasisPoints: ExactInteger,
      maximumReduction: Money.nullable(),
    })
    .strict(),
]);

export const CreatePromotionScenarioInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    region: z.string().regex(/^[A-Z]{2}(?:-[A-Z0-9]{2,8})?$/u),
    categoryCode: z.string().max(120).nullable(),
    minimumMinorUnits: ExactInteger,
    maximumMinorUnits: ExactInteger,
    components: z.array(PromotionComponentSchema).min(1).max(256),
  })
  .strict()
  .superRefine((input, context) => {
    const minimum = BigInt(input.minimumMinorUnits);
    const maximum = BigInt(input.maximumMinorUnits);
    if (maximum < minimum || maximum - minimum > 100_000n) {
      context.addIssue({ code: 'custom', message: 'Promotion search range is invalid.' });
    }
    if (new Set(input.components.map(({ key }) => key)).size !== input.components.length) {
      context.addIssue({ code: 'custom', message: 'Promotion component keys must be unique.' });
    }
  });

export const ProductPromotionParamsSchema = z.object({ productId: UUID_V7 }).strict();
export const PromotionScenarioParamsSchema = z.object({ scenarioId: UUID_V7 }).strict();
export const CalculatePromotionBatchInputSchema = z
  .object({
    rows: z
      .array(z.object({ skuId: UUID_V7, campaignPrice: Money }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.rows.map(({ skuId }) => skuId)).size !== input.rows.length) {
      context.addIssue({ code: 'custom', message: 'Promotion batch SKU rows must be unique.' });
    }
  });

export const PromotionScenarioResponseSchema = z
  .object({
    id: UUID_V7,
    productId: UUID_V7,
    name: z.string(),
    platformId: z.literal('pinduoduo'),
    region: z.string(),
    ruleSnapshotId: UUID_V7,
    ruleSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/u),
    configurationSnapshot: z.json(),
    createdAt: z.iso.datetime(),
  })
  .strict();

const PromotionTrace = z
  .object({
    componentKey: z.string(),
    kind: z.enum(['fixed_reduction', 'coupon', 'percentage_discount']),
    funder: z.enum(['merchant', 'platform']),
    eligible: z.boolean(),
    requestedMinorUnits: ExactInteger,
    appliedMinorUnits: ExactInteger,
    beforeConsumerPaymentMinorUnits: ExactInteger,
    afterConsumerPaymentMinorUnits: ExactInteger,
    beforeMerchantSettlementMinorUnits: ExactInteger,
    afterMerchantSettlementMinorUnits: ExactInteger,
  })
  .strict();
const Promotion = z
  .object({
    campaignPrice: Money,
    consumerPayment: Money,
    merchantSettlement: Money,
    recognizedRevenue: Money,
    merchantFundedDiscount: Money,
    platformFundedDiscount: Money,
    totalDiscount: Money,
    trace: z.array(PromotionTrace),
  })
  .strict();
const Financial = z
  .object({
    campaignPrice: Money,
    consumerPayment: Money,
    recognizedRevenue: Money,
    merchantSettlement: Money,
    costOfGoods: Money,
    operatingCosts: Money,
    totalCosts: Money,
    grossProfit: SignedMoney,
    netProfit: SignedMoney,
    grossMarginBasisPoints: SignedInteger.nullable(),
    netMarginBasisPoints: SignedInteger.nullable(),
  })
  .strict();
const CombinedTrace = z
  .object({
    operation: z.string(),
    inputs: z.record(z.string(), z.string()),
    outputMinorUnits: SignedInteger,
  })
  .strict();
const Simulation = z
  .object({
    status: z.enum(['verified', 'warning', 'incomplete']),
    promotion: Promotion,
    financial: Financial.nullable(),
    breakEvenCampaignPrice: Money.nullable(),
    ruleSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/u),
    issues: z.array(z.string()),
    trace: z.array(CombinedTrace),
  })
  .strict();
const ResultRecord = z
  .object({
    id: UUID_V7,
    scenarioId: UUID_V7,
    skuId: UUID_V7,
    costProfileId: UUID_V7.nullable(),
    costProfileRevisionNo: z.number().int().positive().nullable(),
    status: z.enum(['verified', 'warning', 'incomplete']),
    inputSnapshot: z.json(),
    resultSnapshot: z.json(),
    engineVersion: z.string(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const PromotionBatchResponseSchema = z
  .object({
    scenario: PromotionScenarioResponseSchema,
    rows: z.array(
      z
        .object({
          skuId: UUID_V7,
          status: z.enum(['verified', 'warning', 'incomplete']),
          simulation: Simulation,
          record: ResultRecord,
        })
        .strict(),
    ),
  })
  .strict();

export const PromotionHistoryResponseSchema = z
  .object({
    items: z.array(
      z
        .object({ scenario: PromotionScenarioResponseSchema, results: z.array(ResultRecord) })
        .strict(),
    ),
  })
  .strict();

export type PromotionBatchResponse = z.infer<typeof PromotionBatchResponseSchema>;
export type PromotionHistoryResponse = z.infer<typeof PromotionHistoryResponseSchema>;
export type CreatePromotionScenarioInput = z.infer<typeof CreatePromotionScenarioInputSchema>;
