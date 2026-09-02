import { useEffect, useRef, useState } from 'react';

import type { SkusApi, SkuMatrixResponse } from '../skus/api.js';
import type {
  PromotionApi,
  PromotionBatchResponse,
  PromotionHistoryResponse,
  PromotionStatus,
} from './api.js';

type Sku = SkuMatrixResponse['skus'][number];

export function PromotionSimulator({
  productId,
  promotionApi,
  skusApi,
}: {
  readonly productId: string;
  readonly promotionApi: PromotionApi;
  readonly skusApi: SkusApi;
}): React.JSX.Element {
  const [skus, setSkus] = useState<readonly Sku[]>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [prices, setPrices] = useState<Readonly<Record<string, string>>>({});
  const [name, setName] = useState('拼多多活动模拟');
  const [merchantCoupon, setMerchantCoupon] = useState('1000');
  const [platformCoupon, setPlatformCoupon] = useState('2000');
  const [minimum, setMinimum] = useState('0');
  const [maximum, setMaximum] = useState('100000');
  const [batch, setBatch] = useState<PromotionBatchResponse>();
  const [history, setHistory] = useState<PromotionHistoryResponse>({ items: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestGeneration = useRef(0);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setSkus(undefined);
    setBatch(undefined);
    setHistory({ items: [] });
    setError('');
    setBusy(false);
    void Promise.all([skusApi.get(productId), promotionApi.history(productId)])
      .then(([matrix, loadedHistory]) => {
        if (generation !== requestGeneration.current) return;
        const enabled = matrix.skus.filter(({ enabled }) => enabled);
        setSkus(enabled);
        setSelected(new Set(enabled.map(({ id }) => id)));
        setPrices(Object.fromEntries(enabled.map(({ id }) => [id, '10000'])));
        setHistory(loadedHistory);
      })
      .catch((caught) => {
        if (generation === requestGeneration.current) setError(message(caught));
      });
  }, [productId, promotionApi, skusApi]);

  if (!skus && !error) return <p>正在加载活动模拟…</p>;
  if (!skus) return <p role="alert">{error}</p>;
  if (skus.length === 0) return <p className="instructive-empty">请先启用至少一个 SKU。</p>;

  const calculate = async () => {
    const generation = requestGeneration.current;
    try {
      setBusy(true);
      setError('');
      const currency = 'CNY';
      const threshold = { currency, minorUnits: '0' };
      const scenario = await promotionApi.create(productId, {
        name,
        region: 'CN',
        categoryCode: null,
        minimumMinorUnits: minimum,
        maximumMinorUnits: maximum,
        components: [
          {
            key: 'merchant-coupon',
            kind: 'coupon',
            funder: 'merchant',
            priority: 1,
            threshold,
            amount: { currency, minorUnits: merchantCoupon || '0' },
          },
          {
            key: 'platform-coupon',
            kind: 'coupon',
            funder: 'platform',
            priority: 2,
            threshold,
            amount: { currency, minorUnits: platformCoupon || '0' },
          },
        ],
      });
      const result = await promotionApi.calculate(scenario.id, {
        rows: skus
          .filter(({ id }) => selected.has(id))
          .map(({ id }) => ({
            skuId: id,
            campaignPrice: { currency, minorUnits: prices[id] || '0' },
          })),
      });
      if (generation !== requestGeneration.current) return;
      setBatch(result);
      setHistory((current) => ({
        items: [
          { scenario: result.scenario, results: result.rows.map(({ record }) => record) },
          ...current.items,
        ],
      }));
    } catch (caught) {
      if (generation === requestGeneration.current) setError(message(caught));
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  };

  return (
    <section aria-label="拼多多活动模拟" className="finance-workspace promotion-workspace">
      <div className="promotion-layout">
        <form className="promotion-controls" onSubmit={(event) => event.preventDefault()}>
          <h2>活动条件</h2>
          <label>
            方案名称
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            商家券（分）
            <input
              value={merchantCoupon}
              onChange={(event) => setMerchantCoupon(digits(event.target.value))}
            />
          </label>
          <label>
            平台券（分）
            <input
              value={platformCoupon}
              onChange={(event) => setPlatformCoupon(digits(event.target.value))}
            />
          </label>
          <label>
            保本搜索下限（分）
            <input value={minimum} onChange={(event) => setMinimum(digits(event.target.value))} />
          </label>
          <label>
            保本搜索上限（分）
            <input value={maximum} onChange={(event) => setMaximum(digits(event.target.value))} />
          </label>
          <fieldset>
            <legend>批算 SKU 与活动价</legend>
            {skus.map((sku) => (
              <div className="promotion-sku-input" key={sku.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(sku.id)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(sku.id);
                      else next.delete(sku.id);
                      setSelected(next);
                    }}
                  />
                  {sku.internalCode ?? sku.signature}
                </label>
                <input
                  aria-label={`${sku.internalCode ?? sku.signature} 活动价`}
                  value={prices[sku.id] ?? ''}
                  onChange={(event) =>
                    setPrices({ ...prices, [sku.id]: digits(event.target.value) })
                  }
                />
              </div>
            ))}
          </fieldset>
          <button
            aria-label="运行活动批算"
            disabled={busy || selected.size === 0}
            type="button"
            onClick={() => void calculate()}
          >
            {busy ? '计算中…' : '运行活动批算'}
          </button>
        </form>
        <div className="promotion-output">
          <h2>批算结果</h2>
          {error ? <p role="alert">{error}</p> : null}
          {!batch ? (
            <p className="instructive-empty">选择 SKU 并运行，结果将绑定当前规则快照。</p>
          ) : null}
          {batch ? <BatchResults batch={batch} skus={skus} /> : null}
        </div>
      </div>
      <section className="pricing-history" aria-label="活动模拟历史">
        <h2>不可变活动历史</h2>
        {history.items.length === 0 ? (
          <p>暂无活动模拟。</p>
        ) : (
          <ol>
            {history.items.map(({ scenario, results }) => (
              <li key={scenario.id}>
                <strong>{scenario.name}</strong>
                <span>{results.length} 个结果</span>
                <span>{new Date(scenario.createdAt).toLocaleString('zh-CN')}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

function BatchResults({
  batch,
  skus,
}: {
  readonly batch: PromotionBatchResponse;
  readonly skus: readonly Sku[];
}) {
  return (
    <div className="promotion-results">
      {batch.rows.map((row) => {
        const label = skus.find(({ id }) => id === row.skuId)?.internalCode ?? row.skuId;
        return (
          <article
            className={`promotion-result promotion-status-${row.status}`}
            key={row.record.id}
          >
            <header>
              <h3>{label}</h3>
              <span>{statusLabel(row.status)}</span>
            </header>
            {row.status === 'incomplete' ? (
              <p className="notice">规则或成本信息不完整，不生成确定性利润。</p>
            ) : null}
            <dl className="financial-metrics">
              <Metric
                label="到手价"
                value={formatMoney(row.simulation.promotion.consumerPayment)}
              />
              <Metric
                label="商家实收"
                value={formatMoney(row.simulation.promotion.merchantSettlement)}
              />
              <Metric
                label="平台承担"
                value={formatMoney(row.simulation.promotion.platformFundedDiscount)}
              />
              <Metric
                label="净利润"
                value={formatMoney(row.simulation.financial?.netProfit ?? null)}
              />
              <Metric
                label="净利率"
                value={formatBasisPoints(row.simulation.financial?.netMarginBasisPoints ?? null)}
              />
              <Metric label="保本价" value={formatMoney(row.simulation.breakEvenCampaignPrice)} />
            </dl>
            <details open>
              <summary>计算过程（{row.simulation.trace.length} 步）</summary>
              <ol>
                {row.simulation.trace.map((step, index) => (
                  <li key={`${step.operation}-${index}`}>
                    <strong>{step.operation}</strong>
                    <span>→ {step.outputMinorUnits}</span>
                  </li>
                ))}
              </ol>
            </details>
          </article>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function digits(value: string) {
  return value.replace(/\D/gu, '');
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function statusLabel(status: PromotionStatus) {
  return { verified: '已验证', warning: '需复核', incomplete: '信息不完整' }[status];
}
function formatMoney(
  money: { readonly currency: string; readonly minorUnits: string } | null,
): string {
  if (!money) return '—';
  const amount = BigInt(money.minorUnits),
    sign = amount < 0n ? '-' : '',
    absolute = amount < 0n ? -amount : amount;
  return `${sign}${money.currency === 'CNY' ? '¥' : `${money.currency} `}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
function formatBasisPoints(value: string | null): string {
  if (value === null) return '—';
  const amount = BigInt(value),
    sign = amount < 0n ? '-' : '',
    absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}%`;
}
