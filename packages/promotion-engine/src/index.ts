export { calculatePromotion } from './calculate.js';
export { MAX_CAMPAIGN_SEARCH_WIDTH, solveCampaignPrice } from './solver.js';
export { simulatePinduoduo } from './pinduoduo.js';
export type {
  PinduoduoSimulationInput,
  PinduoduoSimulationResult,
  PinduoduoSimulationTraceStep,
} from './pinduoduo.js';
export type {
  CampaignPriceInput,
  CampaignPriceResult,
  CouponComponent,
  FixedReductionComponent,
  PercentageDiscountComponent,
  PromotionComponent,
  PromotionFunder,
  PromotionInput,
  PromotionResult,
  PromotionTraceStep,
} from './types.js';
