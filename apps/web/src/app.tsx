import { BrowserRouter } from 'react-router-dom';

import { createBrowserFactsApi } from './features/facts/api.js';
import type { FactWorkspaceApi } from './features/facts/fact-status-table.js';
import {
  createBrowserPlatformProfilesApi,
  type PlatformProfilesApi,
} from './features/platform-profile/api.js';
import { createBrowserProductsApi } from './features/products/api.js';
import type { ProductsApi } from './features/products/product-library.js';
import { createBrowserSkusApi, type SkusApi } from './features/skus/api.js';
import { WorkbenchRouter } from './routing/workbench-router.js';

const browserProductsApi = createBrowserProductsApi();
const browserFactsApi = createBrowserFactsApi();
const browserSkusApi = createBrowserSkusApi();
const browserPlatformProfilesApi = createBrowserPlatformProfilesApi();

export function App({
  factsApi = browserFactsApi,
  platformProfilesApi = browserPlatformProfilesApi,
  productsApi = browserProductsApi,
  skusApi = browserSkusApi,
}: {
  readonly factsApi?: FactWorkspaceApi;
  readonly platformProfilesApi?: PlatformProfilesApi;
  readonly productsApi?: ProductsApi;
  readonly skusApi?: SkusApi;
} = {}): React.JSX.Element {
  return (
    <BrowserRouter>
      <WorkbenchRouter
        factsApi={factsApi}
        platformProfilesApi={platformProfilesApi}
        productsApi={productsApi}
        skusApi={skusApi}
      />
    </BrowserRouter>
  );
}
