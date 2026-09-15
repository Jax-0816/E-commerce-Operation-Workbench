import type { DashboardAttentionItem, DashboardResponse } from '@eaw/contracts/dashboard';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { DashboardApi } from './api.js';

const metrics: readonly [keyof DashboardResponse['summary'], string, string][] = [
  ['productCount', '商品数量', '已建档且未归档'],
  ['enabledSkuCount', '启用 SKU', '当前参与运营'],
  ['missingCostProfileCount', '缺失成本', '已启用 SKU'],
  ['staleAssetCount', '过期内容', '最新资产依赖已变化'],
  ['lossMakingResultCount', '最新亏损', '定价与活动结果'],
  ['ruleRiskCount', '待审核规则', '当前启用规则包'],
];

export function OperationalDashboard({ api }: { readonly api: DashboardApi }): React.JSX.Element {
  const [dashboard, setDashboard] = useState<DashboardResponse>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setDashboard(undefined);
    setError(false);
    void api
      .get()
      .then((value) => {
        if (active) setDashboard(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className="dashboard-page operational-dashboard">
      <header className="page-heading command-heading">
        <div>
          <h1>运营总控台</h1>
          <p>汇总当前商品、财务、内容与配置风险，并直接进入对应工作区处理。</p>
        </div>
        <Link className="button-link" to="/products/new">
          <PlusIcon aria-hidden="true" size={18} weight="bold" />
          新建商品
        </Link>
      </header>

      {!dashboard && !error ? (
        <p className="dashboard-loading" role="status">
          正在加载运营总控台…
        </p>
      ) : null}
      {error ? (
        <section className="dashboard-error" role="alert">
          <h2>无法加载运营总控台</h2>
          <p>请确认本地服务正在运行，然后刷新页面重试；当前不会显示推测的零值。</p>
        </section>
      ) : null}

      {dashboard ? (
        <>
          <dl aria-label="运营指标" className="dashboard-metrics">
            {metrics.map(([key, label, detail]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{dashboard.summary[key]}</dd>
                <small>{detail}</small>
              </div>
            ))}
          </dl>

          <section aria-label="配置状态" className="dashboard-configuration">
            <h2>关键配置</h2>
            <ul>
              <li data-state={dashboard.configuration.aiConfigured ? 'ready' : 'attention'}>
                <strong>
                  DeepSeek {dashboard.configuration.aiConfigured ? '已配置' : '未配置'}
                </strong>
                <span>联网生成能力</span>
              </li>
              <li
                data-state={dashboard.configuration.pinduoduoRulePackActive ? 'ready' : 'attention'}
              >
                <strong>
                  拼多多规则包
                  {dashboard.configuration.pinduoduoRulePackActive ? '已启用' : '未启用'}
                </strong>
                <span>中国区活动与财务规则</span>
              </li>
            </ul>
          </section>

          {dashboard.summary.productCount === 0 ? (
            <section className="dashboard-empty">
              <h2>先创建第一个商品</h2>
              <p>建档后即可配置商品事实、SKU、成本、平台规则和内容资产。</p>
              <Link to="/products/new">创建商品</Link>
            </section>
          ) : null}

          <section aria-label="待处理事项" className="dashboard-attention">
            <div className="section-heading">
              <div>
                <h2>待处理事项</h2>
                <p>只显示当前最新状态；历史风险不会重复计数。</p>
              </div>
              <span>{dashboard.attention.length} 项</span>
            </div>
            {dashboard.attention.length === 0 ? (
              <p className="dashboard-clear">当前没有待处理风险。</p>
            ) : (
              <ul>
                {dashboard.attention.map((item) => (
                  <AttentionItem item={item} key={item.code} />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function AttentionItem({ item }: { readonly item: DashboardAttentionItem }): React.JSX.Element {
  return (
    <li data-severity={item.severity}>
      <div>
        <span className="risk-severity">{severityLabel(item.severity)}</span>
        <strong>{item.label}</strong>
        <p>{item.explanation}</p>
      </div>
      <Link to={item.href}>
        前往处理
        <ArrowRightIcon aria-hidden="true" size={16} />
      </Link>
    </li>
  );
}

function severityLabel(severity: DashboardAttentionItem['severity']): string {
  if (severity === 'critical') return '严重';
  if (severity === 'warning') return '注意';
  return '提示';
}
