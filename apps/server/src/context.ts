import { APP_VERSION, type AppVersion } from '@eaw/shared';
import type { FactsApplication, ProductsApplication } from '@eaw/application';

export interface AppContextOptions {
  readonly webDistDir?: string;
  readonly products?: ProductsApplication;
  readonly facts?: FactsApplication;
}

export interface AppContext {
  readonly appVersion: AppVersion;
  readonly webDistDir?: string;
  readonly products?: ProductsApplication;
  readonly facts?: FactsApplication;
}

export function createAppContext(options: AppContextOptions): AppContext {
  return {
    appVersion: APP_VERSION,
    webDistDir: options.webDistDir,
    products: options.products,
    facts: options.facts,
  };
}
