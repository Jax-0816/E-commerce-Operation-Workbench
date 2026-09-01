import { useEffect, useRef, useState } from 'react';

import type { SkusApi, SkuMatrixResponse } from '../skus/api.js';
import type {
  CalculatePricingRequest,
  PricingApi,
  PricingCalculationResponse,
  PricingHistoryResponse,
  PricingStatus,
} from './api.js';

type GoalType = CalculatePricingRequest['goal']['type'];

export function PricingLaboratory({
  pricingApi,
  productId,
  skusApi,
}: {
  readonly pricingApi: PricingApi;
  readonly productId: string;
  readonly skusApi: SkusApi;
}): React.JSX.Element {
  const [skus, setSkus] = useState<readonly SkuMatrixResponse['skus'][number][]>();
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('target_unit_profit');
  const [goalValue, setGoalValue] = useState('1000');
  const [name, setName] = useState('目标单件利润');
  const [minimum, setMinimum] = useState('0');
  const [maximum, setMaximum] = useState('100000');
  const [calculation, setCalculation] = useState<PricingCalculationResponse>();
  const [history, setHistory] = useState<PricingHistoryResponse>({ items: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const selectedSku = useRef('');
  const historyRequest = useRef(0);
  const calculationRequest = useRef(0);
  const skuListRequest = useRef(0);

  useEffect(() => {
    const request = ++skuListRequest.current;
    historyRequest.current += 1;
    calculationRequest.current += 1;
    selectedSku.current = '';
    setSkus(undefined);
    setSelectedSkuId('');
    setCalculation(undefined);
    setHistory({ items: [] });
    setBusy(false);
    setHistoryLoading(false);
    setError('');
    void skusApi
      .get(productId)
      .then((matrix) => {
        if (request !== skuListRequest.current) return;
        const enabled = matrix.skus.filter((sku) => sku.enabled);
        setSkus(enabled);
        selectedSku.current = enabled[0]?.id ?? '';
        setSelectedSkuId(enabled[0]?.id ?? '');
      })
      .catch((caught) => {
        if (request === skuListRequest.current) setError(errorMessage(caught));
      });
  }, [productId, skusApi]);

  useEffect(() => {
    if (!selectedSkuId || selectedSku.current !== selectedSkuId) return;
    const request = ++historyRequest.current;
    selectedSku.current = selectedSkuId;
    setCalculation(undefined);
    setHistory({ items: [] });
    setHistoryLoading(true);
    void pricingApi
      .history(productId, selectedSkuId)
      .then((loaded) => {
        if (request === historyRequest.current && selectedSku.current === selectedSkuId) {
          setHistory(loaded);
        }
      })
      .catch((caught) => {
        if (request === historyRequest.current) setError(errorMessage(caught));
      })
      .finally(() => {
        if (request === historyRequest.current) setHistoryLoading(false);
      });
  }, [pricingApi, productId, selectedSkuId]);

  if (!skus && !error) return <p>正在加载 SKU…</p>;
  if (!skus) return <p role="alert">{error}</p>;
  if (skus.length === 0)
    return <p className="instructive-empty">请先在 SKU 页面启用至少一个 SKU。</p>;

  const calculate = async (): Promise<void> => {
    const skuId = selectedSkuId;
    const request = ++calculationRequest.current;
    try {
      setBusy(true);
      setError('');
      const goal: CalculatePricingRequest['goal'] =
        goalType === 'break_even'
          ? { type: goalType }
          : goalType === 'target_unit_profit'
            ? { type: goalType, amountMinorUnits: goalValue }
            : { type: goalType, basisPoints: goalValue };
      const result = await pricingApi.calculate(productId, skuId, {
        name,
        goal,
        minimumMinorUnits: minimum,
        maximumMinorUnits: maximum,
      });
      if (request !== calculationRequest.current || selectedSku.current !== skuId) return;
      setCalculation(result);
      setHistory((current) => ({
        items: [{ scenario: result.scenario, results: [result.record] }, ...current.items],
      }));
    } catch (caught) {
      if (request === calculationRequest.current && selectedSku.current === skuId) {
        setError(errorMessage(caught));
      }
    } finally {
      if (request === calculationRequest.current && selectedSku.current === skuId) setBusy(false);
    }
  };

  return (
    <section aria-label="价格实验室" className="finance-workspace pricing-lab">
      <div className="pricing-layout">
        <form className="pricing-controls" onSubmit={(event) => event.preventDefault()}>
          <h2>目标与搜索范围</h2>
          <label>
            当前 SKU
            <select
              value={selectedSkuId}
              onChange={(event) => {
                selectedSku.current = event.target.value;
                historyRequest.current += 1;
                calculationRequest.current += 1;
                setCalculation(undefined);
                setHistory({ items: [] });
                setBusy(false);
                setHistoryLoading(true);
                setSelectedSkuId(event.target.value);
              }}
            >
              {skus.map((sku) => (
                <option key={sku.id} value={sku.id}>
                  {sku.internalCode ?? sku.signature}
                </option>
              ))}
            </select>
          </label>
          <label>
            方案名称
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            定价目标
            <select
              aria-label="定价目标"
              value={goalType}
              onChange={(event) => setGoalType(event.target.value as GoalType)}
            >
              <option value="target_unit_profit">目标单件利润</option>
              <option value="gross_margin">目标毛利率</option>
              <option value="net_margin">目标净利率</option>
              <option value="break_even">保本</option>
            </select>
          </label>
          {goalType !== 'break_even' ? (
            <label>
              {goalType === 'target_unit_profit' ? '目标利润（分）' : '目标比例（基点）'}
              <input
                aria-label="目标值"
                inputMode="numeric"
                value={goalValue}
                onChange={(event) => setGoalValue(digits(event.target.value))}
              />
            </label>
          ) : null}
          <label>
            最低候选价（分）
            <input
              inputMode="numeric"
              value={minimum}
              onChange={(event) => setMinimum(digits(event.target.value))}
            />
          </label>
          <label>
            最高候选价（分）
            <input
              inputMode="numeric"
              value={maximum}
              onChange={(event) => setMaximum(digits(event.target.value))}
            />
          </label>
          <button
            aria-label="执行定价计算"
            disabled={busy || historyLoading}
            type="button"
            onClick={() => void calculate()}
          >
            {busy ? '计算中…' : '计算建议价'}
          </button>
        </form>
        <div className="pricing-output">
          <h2>计算结果</h2>
          {error ? <p role="alert">{error}</p> : null}
          {!calculation ? (
            <p className="instructive-empty">设置目标后运行计算，结果会保存到历史。</p>
          ) : null}
          {calculation ? <PricingResult calculation={calculation} /> : null}
        </div>
      </div>
      <section className="pricing-history" aria-label="定价历史">
        <h2>不可变计算历史</h2>
        {history.items.length === 0 ? (
          <p>暂无历史计算。</p>
        ) : (
          <ol>
            {history.items.map(({ scenario, results }) => (
              <li key={scenario.id}>
                <strong>{scenario.name}</strong>
                <span>成本档案第 {scenario.costProfileRevisionNo} 版</span>
                <span>{new Date(scenario.createdAt).toLocaleString('zh-CN')}</span>
                <span>{statusLabel(results[0]?.status ?? 'incomplete')}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

function PricingResult({
  calculation,
}: {
  readonly calculation: PricingCalculationResponse;
}): React.JSX.Element {
  const { pricing } = calculation;
  return (
    <>
      <div className={`pricing-status pricing-status-${pricing.status}`}>
        {statusLabel(pricing.status)}
      </div>
      {pricing.status === 'warning' ? (
        <p className="notice">结果包含估算成本，请复核后使用。</p>
      ) : null}
      {pricing.status === 'incomplete' ? (
        <p className="notice">存在缺失成本，结果不能标记为已验证。</p>
      ) : null}
      <div className="price-hero">
        <span>建议价</span>
        <strong>{formatMoney(pricing.prices.recommended)}</strong>
      </div>
      <dl className="financial-metrics">
        <Metric label="保本价" value={formatMoney(pricing.prices.breakEven)} />
        <Metric label="确认收入" value={formatMoney(pricing.outcome.recognizedRevenue)} />
        <Metric label="总成本" value={formatMoney(pricing.outcome.totalCosts)} />
        <Metric label="毛利润" value={formatMoney(pricing.outcome.grossProfit)} />
        <Metric label="净利润" value={formatMoney(pricing.outcome.netProfit)} />
        <Metric label="净利率" value={formatBasisPoints(pricing.outcome.netMarginBasisPoints)} />
      </dl>
      <details className="calculation-trace" open>
        <summary>计算轨迹（{pricing.trace.length} 步）</summary>
        <ol>
          {pricing.trace.map((step, index) => (
            <li key={`${step.operation}-${index}`}>
              <strong>{step.operation}</strong>
              <code>
                {Object.entries(step.inputs)
                  .map(([key, value]) => `${key}=${value}`)
                  .join(', ')}
              </code>
              <span>→ {step.outputMinorUnits}</span>
            </li>
          ))}
        </ol>
      </details>
    </>
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

function formatMoney(money: { currency: string; minorUnits: string } | null): string {
  if (!money) return '—';
  const amount = BigInt(money.minorUnits);
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  const symbol = money.currency === 'CNY' ? '¥' : `${money.currency} `;
  return `${sign}${symbol}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function formatBasisPoints(value: string | null): string {
  if (value === null) return '—';
  const basisPoints = BigInt(value);
  const sign = basisPoints < 0n ? '-' : '';
  const absolute = basisPoints < 0n ? -basisPoints : basisPoints;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}%`;
}

function statusLabel(status: PricingStatus): string {
  return { verified: '已验证', warning: '需复核', incomplete: '信息不完整', invalid: '无有效解' }[
    status
  ];
}

function digits(value: string): string {
  return value.replace(/\D/gu, '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
