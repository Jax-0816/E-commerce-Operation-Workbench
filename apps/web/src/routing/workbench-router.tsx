import { useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { ArchiveIcon } from '@phosphor-icons/react/dist/csr/Archive';
import { BrainIcon } from '@phosphor-icons/react/dist/csr/Brain';
import { ChartLineUpIcon } from '@phosphor-icons/react/dist/csr/ChartLineUp';
import { DatabaseIcon } from '@phosphor-icons/react/dist/csr/Database';
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear';
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { ShieldCheckIcon } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { StorefrontIcon } from '@phosphor-icons/react/dist/csr/Storefront';

import { FactStatusTable, type FactWorkspaceApi } from '../features/facts/fact-status-table.js';
import type { CostsApi } from '../features/costs/api.js';
import { CostProfileEditor } from '../features/costs/cost-profile-editor.js';
import type { PlatformProfilesApi } from '../features/platform-profile/api.js';
import { PlatformProfilePanel } from '../features/platform-profile/platform-profile-panel.js';
import { ProductDashboard } from '../features/products/dashboard.js';
import type { PricingApi } from '../features/pricing/api.js';
import { PricingLaboratory } from '../features/pricing/pricing-laboratory.js';
import { ProductOnboarding } from '../features/products/product-onboarding.js';
import {
  ProductLibrary,
  type ProductItem,
  type ProductsApi,
} from '../features/products/product-library.js';
import type { SkusApi } from '../features/skus/api.js';
import { SkuMatrix } from '../features/skus/sku-matrix.js';
import type { RulePacksApi } from '../features/rules/api.js';
import { RulePackManager } from '../features/rules/rule-pack-manager.js';
import type { PromotionApi } from '../features/promotion/api.js';
import { PromotionSimulator } from '../features/promotion/promotion-simulator.js';

export interface WorkbenchDependencies {
  readonly costsApi: CostsApi;
  readonly factsApi: FactWorkspaceApi;
  readonly platformProfilesApi: PlatformProfilesApi;
  readonly productsApi: ProductsApi;
  readonly pricingApi: PricingApi;
  readonly promotionApi: PromotionApi;
  readonly rulesApi: RulePacksApi;
  readonly skusApi: SkusApi;
}

const globalNavigation = [
  {
    label: '运营中心',
    items: [
      ['工作台', '/', HouseIcon],
      ['商品库', '/products', PackageIcon],
      ['新建商品', '/products/new', PlusIcon],
    ],
  },
  {
    label: '内容与策略',
    items: [
      ['内容资产', '/capabilities/content', ArchiveIcon],
      ['平台与规则', '/capabilities/rules', ShieldCheckIcon],
      ['AI 设置', '/capabilities/ai', BrainIcon],
    ],
  },
  {
    label: '数据与系统',
    items: [
      ['数据管理', '/capabilities/data', DatabaseIcon],
      ['系统设置', '/capabilities/settings', GearIcon],
    ],
  },
] as const;

const productNavigation = [
  ['概览', 'overview'],
  ['商品事实', 'facts'],
  ['SKU', 'skus'],
  ['平台档案', 'platforms'],
  ['竞品', 'competitors'],
  ['市场分析', 'market'],
  ['卖点', 'selling-points'],
  ['标题', 'titles'],
  ['视觉', 'creative'],
  ['详情页', 'detail'],
  ['成本', 'costs'],
  ['定价', 'pricing'],
  ['活动', 'promotion'],
  ['运营方案', 'plans'],
  ['历史', 'history'],
] as const;

export function WorkbenchRouter(dependencies: WorkbenchDependencies): React.JSX.Element {
  return (
    <Routes>
      <Route element={<WorkbenchShell productsApi={dependencies.productsApi} />}>
        <Route index element={<Dashboard productsApi={dependencies.productsApi} />} />
        <Route path="products" element={<ProductHome productsApi={dependencies.productsApi} />} />
        <Route
          path="products/new"
          element={<Onboarding productsApi={dependencies.productsApi} />}
        />
        <Route path="products/:productId" element={<Navigate replace to="overview" />} />
        <Route path="products/:productId/overview" element={<ProductOverview />} />
        <Route
          path="products/:productId/facts"
          element={<FactsPage api={dependencies.factsApi} />}
        />
        <Route path="products/:productId/skus" element={<SkusPage api={dependencies.skusApi} />} />
        <Route
          path="products/:productId/platforms"
          element={<PlatformsPage api={dependencies.platformProfilesApi} />}
        />
        {['competitors', 'market', 'selling-points'].map((section) => (
          <Route
            key={section}
            path={`products/:productId/${section}`}
            element={<Unavailable title={sectionTitle(section)} phase="Phase 7" />}
          />
        ))}
        {['titles'].map((section) => (
          <Route
            key={section}
            path={`products/:productId/${section}`}
            element={<Unavailable title={sectionTitle(section)} phase="Phase 8" />}
          />
        ))}
        {['creative', 'detail'].map((section) => (
          <Route
            key={section}
            path={`products/:productId/${section}`}
            element={<Unavailable title={sectionTitle(section)} phase="Phase 9" />}
          />
        ))}
        <Route
          path="products/:productId/costs"
          element={<CostsPage costsApi={dependencies.costsApi} skusApi={dependencies.skusApi} />}
        />
        <Route
          path="products/:productId/pricing"
          element={
            <PricingPage pricingApi={dependencies.pricingApi} skusApi={dependencies.skusApi} />
          }
        />
        <Route
          path="products/:productId/promotion"
          element={
            <PromotionPage
              promotionApi={dependencies.promotionApi}
              skusApi={dependencies.skusApi}
            />
          }
        />
        <Route
          path="products/:productId/plans"
          element={<Unavailable title="运营方案" phase="Phase 10" />}
        />
        <Route
          path="products/:productId/history"
          element={<Unavailable title="历史版本" phase="Phase 12" />}
        />
        <Route
          path="capabilities/rules"
          element={
            <ProductFeature title="平台与规则">
              <RulePackManager api={dependencies.rulesApi} />
            </ProductFeature>
          }
        />
        <Route
          path="capabilities/:capability"
          element={<Unavailable title="该工作区模块" phase="后续实施阶段" />}
        />
        <Route path="*" element={<Unavailable title="页面" phase="当前版本" />} />
      </Route>
    </Routes>
  );
}

function WorkbenchShell({ productsApi }: { readonly productsApi: ProductsApi }): React.JSX.Element {
  const { productId } = useParams();
  const location = useLocation();
  const [products, setProducts] = useState<readonly ProductItem[]>([]);
  useEffect(() => {
    void productsApi
      .list()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [productsApi]);
  const product = products.find((candidate) => candidate.id === productId);
  return (
    <main className="workbench-shell">
      <aside className="command-sidebar">
        <Link aria-label="返回工作台" className="brand" to="/">
          <StorefrontIcon aria-hidden="true" size={28} weight="duotone" />
          <span>
            电商运营工作台
            <small>本地优先</small>
          </span>
        </Link>
        <nav aria-label="主导航" className="primary-navigation">
          {globalNavigation.map((group) => (
            <section key={group.label}>
              <h2>{group.label}</h2>
              <ul>
                {group.items.map(([label, to, Icon]) => (
                  <li key={to}>
                    <NavLink
                      end={to === '/'}
                      to={to}
                      className={({ isActive }) => (isActive ? 'active' : undefined)}
                    >
                      <Icon aria-hidden="true" size={19} weight="regular" />
                      <span>{label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <section aria-label="当前工作区" className="sidebar-workspace">
          <span>当前商品</span>
          <strong>{product?.name ?? '尚未选择'}</strong>
          <small>数据仅在本地存储</small>
        </section>
      </aside>
      <section className="command-surface">
        <header aria-label="运营上下文" className="context-bar">
          <dl>
            <Context label="当前商品" value={product?.name ?? '未选择商品'} />
            <Context label="SKU" value="未选择 SKU" />
            <Context
              label="平台"
              value={platformLabel(new URLSearchParams(location.search).get('platform'))}
            />
            <Context label="规则包" value="尚未配置" />
            <Context label="AI Provider" value="尚未配置" />
          </dl>
          <div className="plan-action">
            <button disabled title="Phase 10 完成后可用" type="button">
              <ChartLineUpIcon aria-hidden="true" size={18} />
              生成运营方案
            </button>
            <small>Phase 10 开放；财务能力从 Phase 3 开始</small>
          </div>
        </header>
        {productId ? (
          <nav aria-label="商品导航" className="product-navigation">
            {productNavigation.map(([label, section]) => (
              <NavLink
                key={section}
                to={`/products/${productId}/${section}`}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        ) : null}
        <div className="workspace-content">
          <Outlet />
        </div>
        <footer className="workspace-status">
          <span>
            <SquaresFourIcon aria-hidden="true" size={15} /> 本地工作区
          </span>
          <span>
            <SlidersHorizontalIcon aria-hidden="true" size={15} /> 当前平台：
            {platformLabel(new URLSearchParams(location.search).get('platform'))}
          </span>
          <span>未连接的能力不会生成伪结果</span>
        </footer>
      </section>
    </main>
  );
}

function ProductHome({ productsApi }: { readonly productsApi: ProductsApi }): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <ProductLibrary
      api={productsApi}
      onSelect={(product) => navigate(`/products/${product.id}/overview`)}
    />
  );
}

function Dashboard({ productsApi }: { readonly productsApi: ProductsApi }): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <ProductDashboard
      productsApi={productsApi}
      onCreate={() => navigate('/products/new')}
      onOpen={(product) => navigate(`/products/${product.id}/overview`)}
    />
  );
}

function Onboarding({ productsApi }: { readonly productsApi: ProductsApi }): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <ProductOnboarding
      productsApi={productsApi}
      onCreated={(product) => navigate(`/products/${product.id}/facts`)}
    />
  );
}

function ProductOverview(): React.JSX.Element {
  return (
    <ProductFeature title="商品概览">
      <p>从商品事实、SKU 与平台档案开始完善这个商品。</p>
    </ProductFeature>
  );
}

function FactsPage({ api }: { readonly api: FactWorkspaceApi }): React.JSX.Element {
  return (
    <ProductFeature title="商品事实">
      <FactStatusTable api={api} productId={useProductId()} />
    </ProductFeature>
  );
}

function SkusPage({ api }: { readonly api: SkusApi }): React.JSX.Element {
  return (
    <ProductFeature title="SKU 与规格">
      <SkuMatrix api={api} productId={useProductId()} />
    </ProductFeature>
  );
}

function PlatformsPage({ api }: { readonly api: PlatformProfilesApi }): React.JSX.Element {
  return (
    <ProductFeature title="平台档案">
      <PlatformProfilePanel api={api} productId={useProductId()} />
    </ProductFeature>
  );
}

function CostsPage({
  costsApi,
  skusApi,
}: {
  readonly costsApi: CostsApi;
  readonly skusApi: SkusApi;
}): React.JSX.Element {
  return (
    <ProductFeature title="成本中心">
      <CostProfileEditor costsApi={costsApi} productId={useProductId()} skusApi={skusApi} />
    </ProductFeature>
  );
}

function PricingPage({
  pricingApi,
  skusApi,
}: {
  readonly pricingApi: PricingApi;
  readonly skusApi: SkusApi;
}): React.JSX.Element {
  return (
    <ProductFeature title="价格实验室">
      <PricingLaboratory pricingApi={pricingApi} productId={useProductId()} skusApi={skusApi} />
    </ProductFeature>
  );
}

function PromotionPage({
  promotionApi,
  skusApi,
}: {
  readonly promotionApi: PromotionApi;
  readonly skusApi: SkusApi;
}): React.JSX.Element {
  return (
    <ProductFeature title="拼多多活动模拟">
      <PromotionSimulator
        productId={useProductId()}
        promotionApi={promotionApi}
        skusApi={skusApi}
      />
    </ProductFeature>
  );
}

function ProductFeature({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section className="feature-page">
      <h1>{title}</h1>
      {children}
    </section>
  );
}

function Unavailable({
  phase,
  title,
}: {
  readonly phase: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section className="unavailable-page">
      <h1>{title}</h1>
      <p role="status">当前能力尚未实现，将在 {phase} 完成。</p>
    </section>
  );
}

function Context({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function useProductId(): string {
  return useParams().productId ?? '';
}

function platformLabel(platform: string | null): string {
  return (
    { pinduoduo: '拼多多', taobao: '淘宝', douyin: '抖音' }[platform ?? 'pinduoduo'] ?? '拼多多'
  );
}

function sectionTitle(section: string): string {
  return (
    {
      competitors: '竞品',
      market: '市场分析',
      'selling-points': '卖点',
      titles: '标题 Studio',
      creative: '视觉方案',
      detail: '详情页',
      costs: '成本中心',
      pricing: '价格实验室',
    }[section] ?? section
  );
}
