import { moneyFromMinorUnits } from '@eaw/calculation-engine';

import { calculatePromotion } from './calculate.js';
import type { CampaignPriceInput, CampaignPriceResult } from './types.js';

export const MAX_CAMPAIGN_SEARCH_WIDTH = 100_000n;

export function solveCampaignPrice(input: CampaignPriceInput): CampaignPriceResult {
  validate(input);
  let evaluatedCandidates = 0;
  for (
    let candidate = input.search.minimumMinorUnits;
    candidate <= input.search.maximumMinorUnits;
    candidate += 1n
  ) {
    evaluatedCandidates += 1;
    const campaignPrice = moneyFromMinorUnits(candidate, input.currency);
    const promotion = calculatePromotion({
      campaignPrice,
      components: input.components,
      rounding: input.rounding,
    });
    if (promotion.merchantSettlement.minorUnits >= input.minimumMerchantSettlement.minorUnits) {
      return Object.freeze({ campaignPrice, promotion, evaluatedCandidates });
    }
  }
  return Object.freeze({ campaignPrice: null, promotion: null, evaluatedCandidates });
}

function validate(input: CampaignPriceInput): void {
  if (!/^[A-Z]{3}$/u.test(input.currency)) {
    throw new TypeError('Campaign currency is invalid.');
  }
  if (input.minimumMerchantSettlement.currency !== input.currency) {
    throw new TypeError('Campaign target currency must match.');
  }
  const width = input.search.maximumMinorUnits - input.search.minimumMinorUnits;
  if (
    input.search.minimumMinorUnits < 0n ||
    input.search.maximumMinorUnits < input.search.minimumMinorUnits ||
    width > MAX_CAMPAIGN_SEARCH_WIDTH
  ) {
    throw new RangeError('Campaign price search range is invalid or too large.');
  }
}
