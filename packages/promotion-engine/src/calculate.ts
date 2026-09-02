import { moneyFromMinorUnits } from '@eaw/calculation-engine';

import { capReduction, requestedReduction } from './components.js';
import { normalizePromotionComponents } from './normalize.js';
import type { PromotionInput, PromotionResult, PromotionTraceStep } from './types.js';

export function calculatePromotion(input: PromotionInput): PromotionResult {
  const components = normalizePromotionComponents(input);
  const currency = input.campaignPrice.currency;
  let consumerPayment = input.campaignPrice.minorUnits;
  let merchantSettlement = input.campaignPrice.minorUnits;
  let merchantFundedDiscount = 0n;
  let platformFundedDiscount = 0n;
  const trace: PromotionTraceStep[] = [];

  for (const component of components) {
    const beforeConsumerPayment = consumerPayment;
    const beforeMerchantSettlement = merchantSettlement;
    const eligible = input.campaignPrice.minorUnits >= component.threshold.minorUnits;
    const requested = eligible
      ? requestedReduction(component, consumerPayment, input.rounding)
      : 0n;
    const permitted = capReduction(requested, component);
    const applied = permitted > consumerPayment ? consumerPayment : permitted;
    consumerPayment -= applied;
    if (component.funder === 'merchant') {
      merchantSettlement -= applied;
      merchantFundedDiscount += applied;
    } else {
      platformFundedDiscount += applied;
    }
    trace.push(
      Object.freeze({
        componentKey: component.key,
        kind: component.kind,
        funder: component.funder,
        eligible,
        requestedMinorUnits: requested,
        appliedMinorUnits: applied,
        beforeConsumerPaymentMinorUnits: beforeConsumerPayment,
        afterConsumerPaymentMinorUnits: consumerPayment,
        beforeMerchantSettlementMinorUnits: beforeMerchantSettlement,
        afterMerchantSettlementMinorUnits: merchantSettlement,
      }),
    );
  }

  if (
    consumerPayment < 0n ||
    merchantSettlement < 0n ||
    merchantSettlement !== consumerPayment + platformFundedDiscount
  ) {
    throw new Error('Promotion money-flow invariant failed.');
  }
  return Object.freeze({
    campaignPrice: input.campaignPrice,
    consumerPayment: moneyFromMinorUnits(consumerPayment, currency),
    merchantSettlement: moneyFromMinorUnits(merchantSettlement, currency),
    recognizedRevenue: moneyFromMinorUnits(merchantSettlement, currency),
    merchantFundedDiscount: moneyFromMinorUnits(merchantFundedDiscount, currency),
    platformFundedDiscount: moneyFromMinorUnits(platformFundedDiscount, currency),
    totalDiscount: moneyFromMinorUnits(input.campaignPrice.minorUnits - consumerPayment, currency),
    trace: Object.freeze(trace),
  });
}
