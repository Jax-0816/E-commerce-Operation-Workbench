import type { PromotionComponent, PromotionInput } from './types.js';

const COMPONENT_KEY = /^[a-z][a-z0-9_.-]{0,119}$/u;
const MAX_COMPONENTS = 256;

export function normalizePromotionComponents(input: PromotionInput): readonly PromotionComponent[] {
  if (input.components.length > MAX_COMPONENTS) {
    throw new RangeError(`Promotion supports at most ${MAX_COMPONENTS} components.`);
  }
  const keys = new Set<string>();
  for (const component of input.components) {
    if (!COMPONENT_KEY.test(component.key) || keys.has(component.key)) {
      throw new TypeError('Promotion component keys must be valid and unique.');
    }
    keys.add(component.key);
    if (!Number.isSafeInteger(component.priority) || component.priority < 0) {
      throw new RangeError('Promotion component priority must be a non-negative safe integer.');
    }
    assertCurrency(component.threshold.currency, input.campaignPrice.currency);
    if (component.kind === 'fixed_reduction' || component.kind === 'coupon') {
      assertCurrency(component.amount.currency, input.campaignPrice.currency);
    } else {
      if (component.payRateBasisPoints < 0n || component.payRateBasisPoints > 10_000n) {
        throw new RangeError('Percentage discount pay rate must be between 0 and 10000.');
      }
      if (component.maximumReduction !== null) {
        assertCurrency(component.maximumReduction.currency, input.campaignPrice.currency);
      }
    }
  }
  return Object.freeze(
    [...input.components].sort(
      (left, right) => left.priority - right.priority || left.key.localeCompare(right.key),
    ),
  );
}

function assertCurrency(actual: string, expected: string): void {
  if (actual !== expected) throw new TypeError('Promotion component currency must match price.');
}
