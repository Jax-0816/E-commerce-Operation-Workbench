import { PLATFORM_IDS } from '@eaw/domain';
import { z } from 'zod';

const UuidV7 = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const Hash = z.string().regex(/^[0-9a-f]{64}$/u);
const Identifier = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u);
const Timestamp = z.iso.datetime();
const Platform = z.enum(PLATFORM_IDS);

export const WorkflowDefinitionIdSchema = z.literal('product_content');
export const WorkflowNodeKeySchema = z.enum([
  'competitor_analysis',
  'market_insight',
  'selling_points',
  'titles',
  'creative',
  'detail_page',
]);

export const ProductWorkflowParamsSchema = z.object({ productId: UuidV7 }).strict();
export const WorkflowRunParamsSchema = z.object({ workflowRunId: UuidV7 }).strict();
export const WorkflowNodeParamsSchema = z
  .object({ workflowRunId: UuidV7, nodeKey: WorkflowNodeKeySchema })
  .strict();
export const StartWorkflowInputSchema = z
  .object({ platformId: Platform, definitionId: WorkflowDefinitionIdSchema })
  .strict();
export const WorkflowRevisionInputSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export const WorkflowEventsQuerySchema = z
  .object({ afterSequence: z.coerce.number().int().nonnegative().default(0) })
  .strict();

export const WorkflowOutputReferenceSchema = z
  .object({ assetType: Identifier, assetId: UuidV7, revisionNo: z.number().int().positive() })
  .strict();
const WorkflowNodeErrorSchema = z.object({ code: Identifier, message: z.string().min(1) }).strict();
const WorkflowNodeDefinitionSchema = z
  .object({
    key: WorkflowNodeKeySchema,
    taskType: Identifier,
    dependsOn: z.array(WorkflowNodeKeySchema),
    order: z.number().int().positive(),
  })
  .strict();
const WorkflowDefinitionSchema = z
  .object({
    definitionId: WorkflowDefinitionIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    nodes: z.array(WorkflowNodeDefinitionSchema).min(1),
  })
  .strict();
export const WorkflowNodeResponseSchema = z
  .object({
    key: WorkflowNodeKeySchema,
    taskType: Identifier,
    status: z.enum([
      'not_started',
      'running',
      'completed',
      'failed',
      'stale',
      'locked',
      'needs_review',
      'cancelled',
    ]),
    dependencyHash: Hash.nullable(),
    output: WorkflowOutputReferenceSchema.nullable(),
    error: WorkflowNodeErrorSchema.nullable(),
  })
  .strict();
export const WorkflowRunResponseSchema = z
  .object({
    id: UuidV7,
    productId: UuidV7,
    platformId: Platform,
    definition: WorkflowDefinitionSchema,
    status: z.enum(['not_started', 'running', 'completed', 'failed', 'interrupted', 'cancelled']),
    revision: z.number().int().positive(),
    cancellationRequested: z.boolean(),
    nodes: z.array(WorkflowNodeResponseSchema),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .strict();
export const WorkflowRunListResponseSchema = z
  .object({ items: z.array(WorkflowRunResponseSchema) })
  .strict();

export const WorkflowPreflightNodeSchema = z
  .object({
    key: WorkflowNodeKeySchema,
    taskType: Identifier,
    order: z.number().int().positive(),
    runnable: z.boolean(),
    missingInputs: z.array(Identifier),
    dependencyHash: Hash,
    reusableOutput: WorkflowOutputReferenceSchema.optional(),
  })
  .strict();
export const WorkflowPreflightResponseSchema = z
  .object({
    definitionId: WorkflowDefinitionIdSchema,
    definitionVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
    productId: UuidV7,
    platformId: Platform,
    nodes: z.array(WorkflowPreflightNodeSchema),
  })
  .strict();

export const WorkflowEventResponseSchema = z
  .object({
    workflowRunId: UuidV7,
    sequence: z.number().int().positive(),
    type: Identifier,
    runRevision: z.number().int().positive(),
    nodeKey: WorkflowNodeKeySchema.nullable(),
    payload: z.record(z.string(), z.unknown()),
    createdAt: Timestamp,
  })
  .strict();

export type StartWorkflowInput = z.infer<typeof StartWorkflowInputSchema>;
export type WorkflowRevisionInput = z.infer<typeof WorkflowRevisionInputSchema>;
export type WorkflowRunResponse = z.infer<typeof WorkflowRunResponseSchema>;
export type WorkflowPreflightResponse = z.infer<typeof WorkflowPreflightResponseSchema>;
export type WorkflowEventResponse = z.infer<typeof WorkflowEventResponseSchema>;
