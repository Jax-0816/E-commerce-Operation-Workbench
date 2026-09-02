import { z } from 'zod';

export const TRUST_LEVELS = [
  'SYSTEM',
  'RULE',
  'CONFIRMED_FACT',
  'APPROVED_AI_ASSET',
  'EXTERNAL_UNTRUSTED',
] as const;

export const TrustLevelSchema = z.enum(TRUST_LEVELS);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

const ranks = new Map<TrustLevel, number>(TRUST_LEVELS.map((level, index) => [level, index]));

export function compareTrust(left: TrustLevel, right: TrustLevel): number {
  return (
    (ranks.get(left) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
}
