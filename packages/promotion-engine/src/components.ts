import { divideAndRound } from '@eaw/calculation-engine';

import type { PromotionComponent, PromotionInput } from './types.js';

export function requestedReduction(
  component: PromotionComponent,
  consumerPayment: bigint,
  rounding: PromotionInput['rounding'],
): bigint {
  if (component.kind === 'fixed_reduction' || component.kind === 'coupon') {
    return component.amount.minorUnits;
  }
  return divideAndRound(
    consumerPayment * (10_000n - component.payRateBasisPoints),
    10_000n,
    rounding,
  );
}

export function capReduction(reduction: bigint, component: PromotionComponent): bigint {
  const cap =
    component.kind === 'percentage_discount' ? component.maximumReduction?.minorUnits : undefined;
  return cap !== undefined && reduction > cap ? cap : reduction;
}
