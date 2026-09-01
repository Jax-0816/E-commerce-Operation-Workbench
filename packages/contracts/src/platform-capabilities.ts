import { z } from 'zod';

export const PlatformIdentifierSchema = z.enum([
  'pinduoduo',
  'taobao',
  'taobao_tmall',
  'douyin',
  'douyin_ecommerce',
]);
export const PlatformCapabilitiesParamsSchema = z
  .object({ platformId: PlatformIdentifierSchema })
  .strict();
export const PlatformCapabilitiesQuerySchema = z
  .object({ categoryCode: z.string().trim().min(1).max(120).optional() })
  .strict();

export const CapabilityStatusSchema = z.enum([
  'supported',
  'generic',
  'requires_rule_pack',
  'incomplete',
  'unavailable',
]);
export const CapabilityStateSchema = z
  .object({
    status: CapabilityStatusSchema,
    available: z.boolean(),
    message: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const expected = value.status === 'supported' || value.status === 'generic';
    if (value.available !== expected) {
      context.addIssue({ code: 'custom', message: 'Capability availability contradicts status.' });
    }
  });

const exactState = <
  Status extends z.infer<typeof CapabilityStatusSchema>,
  Available extends boolean,
>(
  status: Status,
  available: Available,
) =>
  z
    .object({
      status: z.literal(status),
      available: z.literal(available),
      message: z.string().trim().min(1).max(500),
    })
    .strict();
const supported = exactState('supported', true);
const generic = exactState('generic', true);
const requiresRulePack = exactState('requires_rule_pack', false);
const incomplete = exactState('incomplete', false);
const unavailable = exactState('unavailable', false);
const common = {
  displayName: z.string().trim().min(1).max(100),
};

export const PlatformCapabilitiesResponseSchema = z.discriminatedUnion('platformId', [
  z
    .object({
      platformId: z.literal('pinduoduo'),
      profilePlatformId: z.literal('pinduoduo'),
      ...common,
      capabilities: z
        .object({
          content: supported,
          creative: supported,
          pricing: supported,
          promotion: requiresRulePack,
          fee_model: requiresRulePack,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      platformId: z.literal('taobao_tmall'),
      profilePlatformId: z.literal('taobao'),
      ...common,
      capabilities: z
        .object({
          content: supported,
          creative: supported,
          pricing: generic,
          promotion: unavailable,
          fee_model: incomplete,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      platformId: z.literal('douyin_ecommerce'),
      profilePlatformId: z.literal('douyin'),
      ...common,
      capabilities: z
        .object({
          content: supported,
          creative: supported,
          pricing: generic,
          promotion: unavailable,
          fee_model: incomplete,
        })
        .strict(),
    })
    .strict(),
]);

export type PlatformCapabilitiesResponse = z.infer<typeof PlatformCapabilitiesResponseSchema>;
