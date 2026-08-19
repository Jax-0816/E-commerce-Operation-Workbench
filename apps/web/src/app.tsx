import { useState } from 'react';

import { createBrowserFactsApi } from './features/facts/api.js';
import { FactStatusTable } from './features/facts/fact-status-table.js';
import { createBrowserProductsApi } from './features/products/api.js';
import { ProductLibrary, type ProductItem } from './features/products/product-library.js';
import { createBrowserSkusApi } from './features/skus/api.js';
import { SkuMatrix } from './features/skus/sku-matrix.js';

const browserProductsApi = createBrowserProductsApi();
const browserFactsApi = createBrowserFactsApi();
const browserSkusApi = createBrowserSkusApi();

const navigationItems = [
  '工作台',
  '产品库',
  '内容资产',
  '平台与规则',
  'AI 设置',
  '数据管理',
  '系统设置',
];

const contextFields = [
  ['当前产品', '未选择产品'],
  ['SKU', '未选择 SKU'],
  ['平台', '拼多多'],
  ['规则包', '待配置'],
  ['AI 提供商', '待配置'],
];

export function App(): React.JSX.Element {
  const [selectedProduct, setSelectedProduct] = useState<ProductItem>();
  return (
    <main className="workbench-shell">
      <header className="topbar">
        <a className="brand" href="/">
          电商运营工作台
        </a>
        <nav aria-label="全局导航">
          <ul className="navigation-list">
            {navigationItems.map((item) => (
              <li key={item}>
                <a href="/">{item}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <section aria-label="运营上下文" className="context-bar">
        <dl>
          {contextFields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <button type="button">生成完整运营方案</button>
      </section>

      <section className="workspace-intro">
        <p>从产品事实、SKU 与成本开始，逐步建立可追溯的运营方案。</p>
      </section>

      <ProductLibrary api={browserProductsApi} onSelect={setSelectedProduct} />
      {selectedProduct ? (
        <>
          <FactStatusTable api={browserFactsApi} productId={selectedProduct.id} />
          <SkuMatrix api={browserSkusApi} productId={selectedProduct.id} />
        </>
      ) : null}
    </main>
  );
}
