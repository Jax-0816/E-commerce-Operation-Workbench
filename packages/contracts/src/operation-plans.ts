import { PLATFORM_IDS } from '@eaw/domain';
import { z } from 'zod';

const UuidV7 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const Hash = z.string().regex(/^[0-9a-f]{64}$/u);
const Timestamp = z.iso.datetime();
const Platform = z.enum(PLATFORM_IDS);
const PositiveInteger = z.number().int().positive();
const NodeKeys = [
  'competitor_analysis',
  'market_insight',
  'selling_points',
  'titles',
  'creative',
  'detail_page',
] as const;
const AssetTypes = [
  'competitor_analysis',
  'market_insight',
  'selling_point_set',
  'title_asset',
  'creative_plan',
  'detail_page',
] as const;

export const ProductOperationPlansParamsSchema = z.object({ productId: UuidV7 }).strict();
export const OperationPlanParamsSchema = z.object({ operationPlanId: UuidV7 }).strict();
export const CreateOperationPlanInputSchema = z
  .object({
    workflowRunId: UuidV7,
    pricingRecordId: UuidV7,
    promotionScenarioId: UuidV7.optional(),
    promotionResultIds: z.array(UuidV7).min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.promotionScenarioId === undefined) !== (value.promotionResultIds === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Promotion references must be supplied together.',
      });
    }
    if (
      value.promotionResultIds &&
      new Set(value.promotionResultIds).size !== value.promotionResultIds.length
    ) {
      context.addIssue({ code: 'custom', message: 'Promotion result IDs must be unique.' });
    }
  });
export const LockOperationPlanInputSchema = z
  .object({ expectedRevisionNo: PositiveInteger })
  .strict();

const OperationPlanNodeSourceSchema = z
  .object({
    nodeKey: z.enum(NodeKeys),
    assetType: z.enum(AssetTypes),
    assetId: UuidV7,
    revisionNo: PositiveInteger,
    dependencyHash: Hash,
  })
  .strict();
const OperationPlanNodesSchema = z
  .array(OperationPlanNodeSourceSchema)
  .length(NodeKeys.length)
  .superRefine((nodes, context) => {
    nodes.forEach((node, index) => {
      if (node.nodeKey !== NodeKeys[index] || node.assetType !== AssetTypes[index]) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Operation plan node order or asset type is invalid.',
        });
      }
    });
  });
const PricingSourceSchema = z
  .object({
    resultId: UuidV7,
    scenarioId: UuidV7,
    skuId: UuidV7,
    costProfileId: UuidV7,
    costProfileRevisionNo: PositiveInteger,
  })
  .strict();
const PromotionSourceSchema = z
  .object({
    scenarioId: UuidV7,
    resultIds: z.array(UuidV7).min(1).max(100),
    ruleSnapshotHash: Hash,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.resultIds).size !== value.resultIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['resultIds'],
        message: 'Result IDs must be unique.',
      });
    }
  });
const OperationPlanSourcesSchema = z
  .object({
    workflowRunId: UuidV7,
    workflowRunRevision: PositiveInteger,
    nodes: OperationPlanNodesSchema,
    competitorSnapshotIds: z.array(UuidV7).min(1).max(100),
    pricing: PricingSourceSchema,
    promotion: PromotionSourceSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.competitorSnapshotIds).size !== value.competitorSnapshotIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['competitorSnapshotIds'],
        message: 'Competitor snapshot IDs must be unique.',
      });
    }
  });
export const OperationPlanBlockerSchema = z
  .object({
    code: z.enum([
      'SOURCE_STALE',
      'SOURCE_NEEDS_REVIEW',
      'CONTENT_UNLOCKED',
      'FINANCIAL_INPUT_MISMATCH',
      'RULE_SNAPSHOT_MISMATCH',
    ]),
    source: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value.trim() === value),
  })
  .strict();

export const OperationPlanResponseSchema = z
  .object({
    id: UuidV7,
    lineageId: UuidV7,
    productId: UuidV7,
    platformId: Platform,
    revisionNo: PositiveInteger,
    status: z.enum(['draft', 'locked']),
    lockedAt: Timestamp.nullable(),
    sources: OperationPlanSourcesSchema,
    sourceHash: Hash,
    blockers: z.array(OperationPlanBlockerSchema).max(50),
    supersedesRevisionId: UuidV7.nullable(),
    createdAt: Timestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === 'locked') !== (value.lockedAt !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['lockedAt'],
        message: 'Plan lifecycle is invalid.',
      });
    }
    if (value.status === 'locked' && value.blockers.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['blockers'],
        message: 'Locked plans cannot be blocked.',
      });
    }
    if (
      (value.revisionNo === 1 &&
        (value.id !== value.lineageId || value.supersedesRevisionId !== null)) ||
      (value.revisionNo > 1 && value.supersedesRevisionId === null)
    ) {
      context.addIssue({ code: 'custom', message: 'Plan revision lineage is invalid.' });
    }
  });
export const OperationPlanListResponseSchema = z
  .object({ items: z.array(OperationPlanResponseSchema) })
  .strict();

export type CreateOperationPlanInput = z.infer<typeof CreateOperationPlanInputSchema>;
export type LockOperationPlanInput = z.infer<typeof LockOperationPlanInputSchema>;
export type OperationPlanResponse = z.infer<typeof OperationPlanResponseSchema>;
