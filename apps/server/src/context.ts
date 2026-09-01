import { APP_VERSION, type AppVersion } from '@eaw/shared';
import type {
  FactsApplication,
  PlatformCapabilitiesApplication,
  PlatformProfilesApplication,
  PricingApplication,
  ProductsApplication,
  SkusApplication,
} from '@eaw/application';

export interface AppContextOptions {
  readonly webDistDir?: string;
  readonly products?: ProductsApplication;
  readonly facts?: FactsApplication;
  readonly skus?: SkusApplication;
  readonly platformProfiles?: PlatformProfilesApplication;
  readonly platformCapabilities?: PlatformCapabilitiesApplication;
  readonly pricing?: PricingApplication;
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
  };
}
