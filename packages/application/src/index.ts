export { createProductsApplication } from './products/index.js';
export type {
  CreateProductInput,
  ProductsApplication,
  ProductsApplicationDependencies,
} from './products/index.js';
export { createFactsApplication } from './facts/index.js';
export type {
  ConfirmFactInput,
  DeleteFactInput,
  FactDraftInput,
  FactsApplication,
  FactsApplicationDependencies,
  ReviseFactInput,
  UpdateFactInput,
} from './facts/index.js';
export { createSkusApplication } from './skus/index.js';
export type { ConfigureDimensionInput, SkusApplication, UpdateSkuInput } from './skus/index.js';
export { createPlatformProfilesApplication } from './platform-profiles/index.js';
export type { PlatformProfilesApplication } from './platform-profiles/index.js';
export { createPlatformCapabilitiesApplication } from './platform-capabilities/index.js';
export type {
  PlatformCapabilitiesApplication,
  PlatformCapabilityView,
} from './platform-capabilities/index.js';
export { createPricingApplication } from './pricing/index.js';
export type {
  CalculatePricingInput,
  PricingApplication,
  PricingCalculation,
  SaveCostProfileInput,
} from './pricing/index.js';
export { createRulePacksApplication } from './rules/index.js';
export type {
  RuleOverrideRecord,
  RulePackRecord,
  RulePacksApplication,
  RuleRepositoryPort,
  RuleSnapshotRecord,
} from './rules/index.js';
export { createPromotionApplication } from './promotions/index.js';
export type {
  CalculatePromotionRowInput,
  CreatePromotionScenarioInput,
  PromotionApplication,
  PromotionBatchRow,
} from './promotions/index.js';
export { createAISettingsApplication } from './ai-settings/index.js';
export type { AISettingsApplication, AISettingsStatus } from './ai-settings/index.js';
export { createCompetitorsApplication } from './competitors/index.js';
export type {
  CompetitorsApplication,
  CompetitorPreviewInput,
  ConfirmCompetitorImportInput,
  ProductCompetitorImportPreview,
} from './competitors/index.js';
