import { z } from 'zod';
import { FormulaNodeSchema } from '@eaw/calculation-engine';

const UUID_V7 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const ExactInteger = z
  .string()
  .max(128)
  .regex(/^(0|[1-9][0-9]*)$/u);
const PercentageBase = z.enum([
  'campaign_price',
  'consumer_payment',
  'merchant_settlement',
  'recognized_revenue',
]);

export const CostProfileItemSchema = z
  .object({
    key: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u),
    label: z.string().trim().min(1).max(120),
    kind: z.enum(['fixed', 'formula', 'per_order', 'per_unit', 'percentage']),
    classification: z.enum(['cost_of_goods', 'operating']),
    critical: z.boolean(),
    status: z.enum(['confirmed', 'estimated', 'missing']),
    amountMinorUnits: ExactInteger.nullable(),
    allocationUnits: ExactInteger.nullable(),
    unitsPerOrder: ExactInteger.nullable(),
    rateBasisPoints: ExactInteger.nullable(),
    percentageBase: PercentageBase.nullable(),
    formula: FormulaNodeSchema.nullable(),
  })
  .strict()
  .superRefine((item, context) => {
    const values = {
      amountMinorUnits: item.amountMinorUnits,
      allocationUnits: item.allocationUnits,
      unitsPerOrder: item.unitsPerOrder,
      rateBasisPoints: item.rateBasisPoints,
      percentageBase: item.percentageBase,
      formula: item.formula,
    };
    const populated = Object.entries(values)
      .filter(([, value]) => value !== null)
      .map(([key]) => key);
    const expected =
      item.status === 'missing'
        ? []
        : item.kind === 'per_unit'
          ? ['amountMinorUnits']
          : item.kind === 'fixed'
            ? ['amountMinorUnits', 'allocationUnits']
            : item.kind === 'per_order'
              ? ['amountMinorUnits', 'unitsPerOrder']
              : item.kind === 'percentage'
                ? ['rateBasisPoints', 'percentageBase']
                : ['formula'];
    if (populated.length !== expected.length || populated.some((key) => !expected.includes(key))) {
      context.addIssue({
        code: 'custom',
        message: 'Cost item values do not match its kind and status.',
      });
    }
    if (
      (item.kind === 'fixed' && item.allocationUnits === '0') ||
      (item.kind === 'per_order' && item.unitsPerOrder === '0')
    ) {
      context.addIssue({ code: 'custom', message: 'Cost allocation quantities must be positive.' });
    }
  });

export const CostPricingParamsSchema = z.object({ productId: UUID_V7, skuId: UUID_V7 }).strict();
export const SaveCostProfileInputSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/u),
    expectedRevisionNo: z.number().int().positive().optional(),
    items: z.array(CostProfileItemSchema).max(256),
  })
  .strict();
export const CostProfileResponseSchema = z
  .object({
    id: UUID_V7,
    skuId: UUID_V7,
    currency: z.string().regex(/^[A-Z]{3}$/u),
    revisionNo: z.number().int().positive(),
    items: z.array(CostProfileItemSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const PricingGoalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('break_even') }).strict(),
  z.object({ type: z.literal('target_unit_profit'), amountMinorUnits: ExactInteger }).strict(),
  z.object({ type: z.literal('gross_margin'), basisPoints: ExactInteger }).strict(),
  z.object({ type: z.literal('net_margin'), basisPoints: ExactInteger }).strict(),
]);
export const CalculatePricingInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    goal: PricingGoalSchema,
    minimumMinorUnits: ExactInteger,
    maximumMinorUnits: ExactInteger,
  })
  .strict()
  .superRefine((input, context) => {
    const minimum = BigInt(input.minimumMinorUnits),
      maximum = BigInt(input.maximumMinorUnits);
    if (maximum < minimum || maximum - minimum > 100_000n) {
      context.addIssue({
        code: 'custom',
        message: 'Pricing search range is invalid or too large.',
      });
    }
  });

const MoneyResponse = z.object({ currency: z.string(), minorUnits: ExactInteger }).strict();
const SignedMoneyResponse = z
  .object({ currency: z.string(), minorUnits: z.string().regex(/^-?(0|[1-9][0-9]*)$/u) })
  .strict();
const OutcomeResponse = z
  .object({
    campaignPrice: MoneyResponse,
    consumerPayment: MoneyResponse,
    recognizedRevenue: MoneyResponse,
    merchantSettlement: MoneyResponse,
    costOfGoods: MoneyResponse,
    operatingCosts: MoneyResponse,
    totalCosts: MoneyResponse,
    grossProfit: SignedMoneyResponse,
    netProfit: SignedMoneyResponse,
    grossMarginBasisPoints: z.string().nullable(),
    netMarginBasisPoints: z.string().nullable(),
  })
  .strict();
const PricingSnapshotResponse = z
  .object({
    status: z.enum(['verified', 'warning', 'incomplete', 'invalid']),
    inputSummary: z
      .object({
        confirmed: z.array(z.string()),
        estimated: z.array(z.string()),
        missing: z.array(z.string()),
      })
      .strict(),
    prices: z
      .object({
        breakEven: MoneyResponse.nullable(),
        minimumSafe: MoneyResponse.nullable(),
        target: MoneyResponse.nullable(),
        recommended: MoneyResponse.nullable(),
      })
      .strict(),
    outcome: OutcomeResponse,
    trace: z.array(
      z
        .object({
          operation: z.string(),
          inputs: z.record(z.string(), z.string()),
          outputMinorUnits: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
const ScenarioResponse = z
  .object({
    id: UUID_V7,
    skuId: UUID_V7,
    costProfileId: UUID_V7,
    costProfileRevisionNo: z.number().int().positive(),
    name: z.string(),
    goalSnapshot: z.json(),
    createdAt: z.iso.datetime(),
  })
  .strict();
const ResultRecordResponse = z
  .object({
    id: UUID_V7,
    scenarioId: UUID_V7,
    skuId: UUID_V7,
    status: z.enum(['verified', 'warning', 'incomplete', 'invalid']),
    inputSnapshot: z.json(),
    resultSnapshot: z.json(),
    engineVersion: z.string(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const PricingCalculationResponseSchema = z
  .object({
    scenario: ScenarioResponse,
    record: ResultRecordResponse,
    pricing: PricingSnapshotResponse,
  })
  .strict();
export const PricingHistoryResponseSchema = z
  .object({
    items: z.array(
      z.object({ scenario: ScenarioResponse, results: z.array(ResultRecordResponse) }).strict(),
    ),
  })
  .strict();
