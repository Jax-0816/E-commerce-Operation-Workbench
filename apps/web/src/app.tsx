import { BrowserRouter } from 'react-router-dom';

import { createBrowserCostsApi, type CostsApi } from './features/costs/api.js';
import { createBrowserFactsApi } from './features/facts/api.js';
import type { FactWorkspaceApi } from './features/facts/fact-status-table.js';
import {
  createBrowserPlatformProfilesApi,
  type PlatformProfilesApi,
} from './features/platform-profile/api.js';
import { createBrowserProductsApi } from './features/products/api.js';
import type { ProductsApi } from './features/products/product-library.js';
import { createBrowserSkusApi, type SkusApi } from './features/skus/api.js';
import { createBrowserPricingApi, type PricingApi } from './features/pricing/api.js';
import { WorkbenchRouter } from './routing/workbench-router.js';
import { createBrowserRulePacksApi, type RulePacksApi } from './features/rules/api.js';
import { createBrowserPromotionApi, type PromotionApi } from './features/promotion/api.js';
import { createBrowserAISettingsApi, type AISettingsApi } from './features/ai-settings/api.js';
import { createBrowserCompetitorsApi, type CompetitorsApi } from './features/competitors/api.js';

const browserProductsApi = createBrowserProductsApi();
const browserFactsApi = createBrowserFactsApi();
const browserSkusApi = createBrowserSkusApi();
const browserPlatformProfilesApi = createBrowserPlatformProfilesApi();
const browserCostsApi = createBrowserCostsApi();
const browserPricingApi = createBrowserPricingApi();
const browserRulePacksApi = createBrowserRulePacksApi();
const browserPromotionApi = createBrowserPromotionApi();
const browserAISettingsApi = createBrowserAISettingsApi();
const browserCompetitorsApi = createBrowserCompetitorsApi();

export function App({
  costsApi = browserCostsApi,
  factsApi = browserFactsApi,
  platformProfilesApi = browserPlatformProfilesApi,
  productsApi = browserProductsApi,
  pricingApi = browserPricingApi,
  promotionApi = browserPromotionApi,
  rulesApi = browserRulePacksApi,
  skusApi = browserSkusApi,
  aiSettingsApi = browserAISettingsApi,
  competitorsApi = browserCompetitorsApi,
}: {
  readonly costsApi?: CostsApi;
  readonly factsApi?: FactWorkspaceApi;
  readonly platformProfilesApi?: PlatformProfilesApi;
  readonly productsApi?: ProductsApi;
  readonly pricingApi?: PricingApi;
  readonly promotionApi?: PromotionApi;
  readonly rulesApi?: RulePacksApi;
  readonly skusApi?: SkusApi;
  readonly aiSettingsApi?: AISettingsApi;
  readonly competitorsApi?: CompetitorsApi;
} = {}): React.JSX.Element {
  return (
    <BrowserRouter>
      <WorkbenchRouter
        costsApi={costsApi}
        factsApi={factsApi}
        platformProfilesApi={platformProfilesApi}
        productsApi={productsApi}
        pricingApi={pricingApi}
        promotionApi={promotionApi}
        rulesApi={rulesApi}
        skusApi={skusApi}
        aiSettingsApi={aiSettingsApi}
        competitorsApi={competitorsApi}
      />
    </BrowserRouter>
  );
}
