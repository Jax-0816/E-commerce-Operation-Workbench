import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { LockSimpleIcon } from '@phosphor-icons/react/dist/csr/LockSimple';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { useEffect, useState } from 'react';

import type { ProductItem, ProductsApi } from './product-library.js';

export function ProductDashboard({
  onCreate,
  onOpen,
  productsApi,
}: {
  readonly onCreate?: () => void;
  readonly onOpen: (product: ProductItem) => void;
  readonly productsApi: ProductsApi;
}): React.JSX.Element {
  const [products, setProducts] = useState<readonly ProductItem[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    void productsApi
      .list()
      .then(setProducts)
      .catch(() => setError('无法加载工作台数据，请检查本地服务后重试。'));
  }, [productsApi]);

  const firstProduct = products?.[0];

  return (
    <section className="dashboard-page">
      <header className="page-heading command-heading">
        <div>
          <h1>运营总控台</h1>
          <p>从可靠商品事实开始，进入各商品工作区核对 SKU、平台档案与运营信息。</p>
        </div>
        <button onClick={onCreate} type="button">
          <PlusIcon aria-hidden="true" size={18} weight="bold" />
          新建商品
        </button>
      </header>

      {error ? <p role="alert">{error}</p> : null}

      <section aria-label="商品工作流入口" className="readiness-rail">
        <ReadinessStep
          detail={firstProduct ? '进入查看' : '先创建商品'}
          label="商品事实"
          state={firstProduct ? 'current' : 'pending'}
          step="1"
        />
        <ReadinessStep detail="按商品查看" label="SKU" state="pending" step="2" />
        <ReadinessStep detail="按商品查看" label="平台档案" state="pending" step="3" />
        <ReadinessStep detail="未开放" label="成本（Phase 3）" state="locked" step="4" />
        <p className="readiness-note">
          <WarningCircleIcon aria-hidden="true" size={17} />
          总控台只确认商品是否已建档；事实、SKU 与平台档案的实际状态请进入商品查看。
        </p>
      </section>

      <div className="dashboard-grid">
        <section className="ledger-panel">
          <div className="section-heading">
            <div>
              <h2>商品工作区</h2>
              <p>从商品入口继续维护事实、SKU 与平台档案；总控台不推测未读取的数据。</p>
            </div>
            <span>商品数量：{products?.length ?? '—'} 个</span>
          </div>

          {products === undefined && !error ? (
            <div aria-label="正在加载商品" className="ledger-skeleton">
              <span />
              <span />
              <span />
            </div>
          ) : null}
          {products?.length === 0 ? (
            <div className="instructive-empty">
              <h3>先创建第一个商品</h3>
              <p>创建后即可录入商品事实、配置规格和维护三个平台的独立档案。</p>
              <button onClick={onCreate} type="button">
                创建商品
              </button>
            </div>
          ) : null}
          {products && products.length > 0 ? (
            <div className="ledger-scroll">
              <table>
                <caption>商品任务账本</caption>
                <thead>
                  <tr>
                    <th scope="col">商品</th>
                    <th scope="col">建档状态</th>
                    <th scope="col">可用工作区</th>
                    <th scope="col">当前可证明数据</th>
                    <th scope="col">进入商品</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <th scope="row">
                        <strong>{product.name}</strong>
                        <small>本地商品工作区</small>
                      </th>
                      <td>
                        <span className="status-line current">
                          <span aria-hidden="true" /> 已建档
                        </span>
                        <small>基础建档已完成</small>
                      </td>
                      <td>
                        <ul className="task-list">
                          <li>商品事实</li>
                          <li>SKU 与规格</li>
                          <li>平台档案</li>
                        </ul>
                      </td>
                      <td>
                        <span>商品：本地持久化</span>
                        <small>其他状态：未在总控台读取</small>
                      </td>
                      <td>
                        <button
                          className="text-action"
                          onClick={() => onOpen(product)}
                          type="button"
                        >
                          打开商品工作区
                          <ArrowRightIcon aria-hidden="true" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <aside aria-label="快捷入口" className="attention-panel">
          <section>
            <div className="section-heading compact-heading">
              <h2>快捷入口</h2>
              <span>{firstProduct ? '3 项' : '0 项'}</span>
            </div>
            {firstProduct ? (
              <ul className="attention-list">
                <li>进入 {firstProduct.name} 的商品事实</li>
                <li>进入 {firstProduct.name} 的 SKU 与规格</li>
                <li>进入 {firstProduct.name} 的平台档案</li>
              </ul>
            ) : (
              <p>创建商品后，这里会显示各工作区的快捷入口。</p>
            )}
          </section>
          <section>
            <h2>平台能力范围</h2>
            <dl className="capability-list">
              <div>
                <dt>拼多多</dt>
                <dd>
                  <CheckCircleIcon aria-hidden="true" size={16} /> 基础档案可配置
                </dd>
              </div>
              <div>
                <dt>淘宝 / 抖音</dt>
                <dd>
                  <CheckCircleIcon aria-hidden="true" size={16} /> 基础档案可配置
                </dd>
              </div>
              <div>
                <dt>成本与财务</dt>
                <dd className="locked">
                  <LockSimpleIcon aria-hidden="true" size={16} /> Phase 3 开放
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ReadinessStep({
  detail,
  label,
  state,
  step,
}: {
  readonly detail: string;
  readonly label: string;
  readonly state: 'current' | 'locked' | 'pending';
  readonly step: string;
}): React.JSX.Element {
  return (
    <div className={`readiness-step ${state}`}>
      <span aria-hidden="true" className="step-number">
        {state === 'locked' ? <LockSimpleIcon size={15} /> : step}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}
