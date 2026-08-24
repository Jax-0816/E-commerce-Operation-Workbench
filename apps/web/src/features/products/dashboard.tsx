import { useEffect, useState } from 'react';

import type { ProductItem, ProductsApi } from './product-library.js';

export function ProductDashboard({
  onOpen,
  productsApi,
}: {
  readonly onOpen: (product: ProductItem) => void;
  readonly productsApi: ProductsApi;
}): React.JSX.Element {
  const [products, setProducts] = useState<readonly ProductItem[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    void productsApi
      .list()
      .then(setProducts)
      .catch(() => setError('无法加载工作台数据。'));
  }, [productsApi]);
  return (
    <section className="dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKBENCH</p>
          <h1>工作台</h1>
          <p>从可靠商品事实开始，逐步完成 SKU、平台内容与运营决策。</p>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div className="metric-grid">
        <article>
          <span>商品数量</span>
          <strong>{products?.length ?? '—'}</strong>
        </article>
        <article>
          <span>SKU 数量</span>
          <strong>进入商品查看</strong>
        </article>
        <article>
          <span>待确认事实</span>
          <strong>进入商品查看</strong>
        </article>
        <article>
          <span>财务风险</span>
          <strong>Phase 3 开放</strong>
        </article>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>最近商品</h2>
            <p>继续完善事实、SKU 与平台档案。</p>
          </div>
        </div>
        {products === undefined && !error ? <p>正在加载商品…</p> : null}
        {products?.length === 0 ? <p>还没有商品，请先创建一个商品。</p> : null}
        <div className="recent-products">
          {products?.slice(0, 6).map((product) => (
            <button
              className="product-card"
              key={product.id}
              onClick={() => onOpen(product)}
              type="button"
            >
              <strong>{product.name}</strong>
              <span>进入商品工作区 →</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
