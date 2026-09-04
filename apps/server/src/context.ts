import { APP_VERSION, type AppVersion } from '@eaw/shared';
import type {
  FactsApplication,
  PlatformCapabilitiesApplication,
  PlatformProfilesApplication,
  PricingApplication,
  PromotionApplication,
  ProductsApplication,
  RulePacksApplication,
  SkusApplication,
  AISettingsApplication,
  CompetitorsApplication,
  StrategyApplication,
} from '@eaw/application';

export interface AppContextOptions {
  readonly webDistDir?: string;
  readonly products?: ProductsApplication;
  readonly facts?: FactsApplication;
  readonly skus?: SkusApplication;
  readonly platformProfiles?: PlatformProfilesApplication;
  readonly platformCapabilities?: PlatformCapabilitiesApplication;
  readonly pricing?: PricingApplication;
  readonly promotions?: PromotionApplication;
  readonly rules?: RulePacksApplication;
  readonly aiSettings?: AISettingsApplication;
  readonly competitors?: CompetitorsApplication;
  readonly strategy?: StrategyApplication;
}

export interface AppContext {
  readonly appVersion: AppVersion;
  readonly webDistDir?: string;
  readonly products?: ProductsApplication;
  readonly facts?: FactsApplication;
  readonly skus?: SkusApplication;
  readonly platformProfiles?: PlatformProfilesApplication;
  readonly platformCapabilities?: PlatformCapabilitiesApplication;
  readonly pricing?: PricingApplication;
  readonly promotions?: PromotionApplication;
  readonly rules?: RulePacksApplication;
  readonly aiSettings?: AISettingsApplication;
  readonly competitors?: CompetitorsApplication;
  readonly strategy?: StrategyApplication;
}

export function createAppContext(options: AppContextOptions): AppContext {
  return {
    appVersion: APP_VERSION,
    webDistDir: options.webDistDir,
    products: options.products,
    facts: options.facts,
    skus: options.skus,
    platformProfiles: options.platformProfiles,
    platformCapabilities: options.platformCapabilities,
    pricing: options.pricing,
    promotions: options.promotions,
    rules: options.rules,
    aiSettings: options.aiSettings,
    competitors: options.competitors,
    strategy: options.strategy,
  };
}
