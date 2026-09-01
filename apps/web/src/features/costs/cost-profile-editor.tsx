import { useEffect, useRef, useState } from 'react';

import type { SkusApi, SkuMatrixResponse } from '../skus/api.js';
import type {
  CostKind,
  CostProfileItem,
  CostProfileResponse,
  CostsApi,
  CostStatus,
} from './api.js';

export function CostProfileEditor({
  costsApi,
  productId,
  skusApi,
}: {
  readonly costsApi: CostsApi;
  readonly productId: string;
  readonly skusApi: SkusApi;
}): React.JSX.Element {
  const [skus, setSkus] = useState<readonly SkuMatrixResponse['skus'][number][]>();
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const [profile, setProfile] = useState<CostProfileResponse>();
  const [items, setItems] = useState<readonly CostProfileItem[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const profileRequest = useRef(0);
  const saveRequest = useRef(0);
  const selectedSku = useRef('');
  const skuListRequest = useRef(0);

  useEffect(() => {
    const request = ++skuListRequest.current;
    profileRequest.current += 1;
    saveRequest.current += 1;
    selectedSku.current = '';
    setSkus(undefined);
    setSelectedSkuId('');
    setProfile(undefined);
    setItems([]);
    setLoadingProfile(false);
    setSaving(false);
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
    const request = ++profileRequest.current;
    selectedSku.current = selectedSkuId;
    setProfile(undefined);
    setItems([]);
    setLoadingProfile(true);
    setError('');
    setNotice('');
    void costsApi
      .get(productId, selectedSkuId)
      .then((loaded) => {
        if (request !== profileRequest.current || selectedSku.current !== selectedSkuId) return;
        setProfile(loaded);
        setItems(loaded?.items ?? []);
      })
      .catch((caught) => {
        if (request === profileRequest.current) setError(errorMessage(caught));
      })
      .finally(() => {
        if (request === profileRequest.current) setLoadingProfile(false);
      });
  }, [costsApi, productId, selectedSkuId]);

  if (!skus && !error) return <p>正在加载 SKU…</p>;
  if (!skus) return <p role="alert">{error}</p>;
  if (skus.length === 0)
    return <p className="instructive-empty">请先在 SKU 页面启用至少一个 SKU。</p>;

  const update = (index: number, changed: CostProfileItem): void => {
    setItems(items.map((item, itemIndex) => (itemIndex === index ? normalize(changed) : item)));
  };
  const save = async (): Promise<void> => {
    const skuId = selectedSkuId;
    const request = ++saveRequest.current;
    try {
      setSaving(true);
      setError('');
      setNotice('');
      const saved = await costsApi.save(productId, skuId, {
        currency: profile?.currency ?? 'CNY',
        ...(profile ? { expectedRevisionNo: profile.revisionNo } : {}),
        items,
      });
      if (request !== saveRequest.current || selectedSku.current !== skuId) return;
      setProfile(saved);
      setItems(saved.items);
      setNotice('成本档案已保存。');
    } catch (caught) {
      if (request === saveRequest.current && selectedSku.current === skuId) {
        setError(errorMessage(caught));
      }
    } finally {
      if (request === saveRequest.current) setSaving(false);
    }
  };

  return (
    <section aria-label="成本档案" className="finance-workspace">
      <header className="finance-toolbar">
        <label>
          当前 SKU
          <select
            value={selectedSkuId}
            onChange={(event) => {
              selectedSku.current = event.target.value;
              profileRequest.current += 1;
              saveRequest.current += 1;
              setProfile(undefined);
              setItems([]);
              setLoadingProfile(true);
              setSaving(false);
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
        <div className="revision-badge">{profile ? `第 ${profile.revisionNo} 版` : '尚未建档'}</div>
        <button type="button" onClick={() => setItems([...items, emptyItem(items.length + 1)])}>
          添加成本项
        </button>
      </header>
      <p className="notice">
        金额以分录入；估算项会使定价结果标记为“需复核”，关键缺失项不会生成已验证价格。
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {loadingProfile ? <p>正在加载成本档案…</p> : null}
      {!loadingProfile && items.length === 0 ? <p>暂无成本项，请先添加成本。</p> : null}
      <div className="cost-item-list">
        {items.map((item, index) => (
          <CostRow
            item={item}
            key={`${item.key}-${index}`}
            onChange={(changed) => update(index, changed)}
            onRemove={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}
          />
        ))}
      </div>
      <div className="actions">
        <button
          aria-label="保存成本档案"
          disabled={loadingProfile || saving}
          type="button"
          onClick={() => void save()}
        >
          {saving ? '保存中…' : '保存成本档案'}
        </button>
      </div>
    </section>
  );
}

function CostRow({
  item,
  onChange,
  onRemove,
}: {
  readonly item: CostProfileItem;
  readonly onChange: (item: CostProfileItem) => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  const field = <K extends keyof CostProfileItem>(key: K, value: CostProfileItem[K]) =>
    onChange({ ...item, [key]: value });
  return (
    <fieldset className="cost-item-card">
      <legend>{item.label || '新成本项'}</legend>
      <label>
        名称
        <input value={item.label} onChange={(event) => field('label', event.target.value)} />
      </label>
      <label>
        唯一键
        <input value={item.key} onChange={(event) => field('key', event.target.value)} />
      </label>
      <label>
        计费方式
        <select
          value={item.kind}
          onChange={(event) => field('kind', event.target.value as CostKind)}
        >
          <option value="per_unit">每件</option>
          <option value="per_order">每单分摊</option>
          <option value="fixed">固定成本分摊</option>
          <option value="percentage">百分比</option>
          <option value="formula">安全公式</option>
        </select>
      </label>
      <label>
        数据状态
        <select
          value={item.status}
          onChange={(event) => field('status', event.target.value as CostStatus)}
        >
          <option value="confirmed">已确认</option>
          <option value="estimated">估算</option>
          <option value="missing">缺失</option>
        </select>
      </label>
      <label>
        成本分类
        <select
          value={item.classification}
          onChange={(event) =>
            field('classification', event.target.value as CostProfileItem['classification'])
          }
        >
          <option value="cost_of_goods">商品成本</option>
          <option value="operating">运营成本</option>
        </select>
      </label>
      {item.status !== 'missing' && ['fixed', 'per_order', 'per_unit'].includes(item.kind) ? (
        <label>
          金额（分）
          <input
            aria-label={`${item.label} 金额（分）`}
            inputMode="numeric"
            value={item.amountMinorUnits ?? ''}
            onChange={(event) => field('amountMinorUnits', digits(event.target.value))}
          />
        </label>
      ) : null}
      {item.status !== 'missing' && item.kind === 'fixed' ? (
        <label>
          分摊件数
          <input
            inputMode="numeric"
            value={item.allocationUnits ?? ''}
            onChange={(event) => field('allocationUnits', digits(event.target.value))}
          />
        </label>
      ) : null}
      {item.status !== 'missing' && item.kind === 'per_order' ? (
        <label>
          每单件数
          <input
            inputMode="numeric"
            value={item.unitsPerOrder ?? ''}
            onChange={(event) => field('unitsPerOrder', digits(event.target.value))}
          />
        </label>
      ) : null}
      {item.status !== 'missing' && item.kind === 'percentage' ? (
        <>
          <label>
            费率（基点）
            <input
              inputMode="numeric"
              value={item.rateBasisPoints ?? ''}
              onChange={(event) => field('rateBasisPoints', digits(event.target.value))}
            />
          </label>
          <label>
            计费基数
            <select
              value={item.percentageBase ?? 'recognized_revenue'}
              onChange={(event) =>
                field('percentageBase', event.target.value as CostProfileItem['percentageBase'])
              }
            >
              <option value="campaign_price">活动价</option>
              <option value="consumer_payment">消费者实付</option>
              <option value="recognized_revenue">确认收入</option>
              <option value="merchant_settlement">商家结算</option>
            </select>
          </label>
        </>
      ) : null}
      {item.status !== 'missing' && item.kind === 'formula' ? (
        <label className="wide-field">
          公式 AST（JSON）
          <textarea
            value={item.formula === null ? '' : JSON.stringify(item.formula)}
            onChange={(event) => field('formula', parseFormula(event.target.value))}
          />
        </label>
      ) : null}
      <label className="checkbox-field">
        <input
          checked={item.critical}
          type="checkbox"
          onChange={(event) => field('critical', event.target.checked)}
        />
        关键成本项
      </label>
      <button className="secondary-button" type="button" onClick={onRemove}>
        移除
      </button>
    </fieldset>
  );
}

function normalize(item: CostProfileItem): CostProfileItem {
  const cleared = {
    ...item,
    amountMinorUnits: null,
    allocationUnits: null,
    unitsPerOrder: null,
    rateBasisPoints: null,
    percentageBase: null,
    formula: null,
  };
  if (item.status === 'missing') return cleared;
  if (item.kind === 'per_unit')
    return { ...cleared, amountMinorUnits: item.amountMinorUnits ?? '' };
  if (item.kind === 'fixed')
    return {
      ...cleared,
      amountMinorUnits: item.amountMinorUnits ?? '',
      allocationUnits: item.allocationUnits ?? '1',
    };
  if (item.kind === 'per_order')
    return {
      ...cleared,
      amountMinorUnits: item.amountMinorUnits ?? '',
      unitsPerOrder: item.unitsPerOrder ?? '1',
    };
  if (item.kind === 'percentage')
    return {
      ...cleared,
      rateBasisPoints: item.rateBasisPoints ?? '',
      percentageBase: item.percentageBase ?? 'recognized_revenue',
    };
  return { ...cleared, formula: item.formula };
}

function emptyItem(index: number): CostProfileItem {
  return {
    key: `cost_${index}`,
    label: `成本项 ${index}`,
    kind: 'per_unit',
    classification: 'operating',
    critical: true,
    status: 'confirmed',
    amountMinorUnits: '',
    allocationUnits: null,
    unitsPerOrder: null,
    rateBasisPoints: null,
    percentageBase: null,
    formula: null,
  };
}

function digits(value: string): string {
  return value.replace(/\D/gu, '');
}

function parseFormula(value: string): unknown | null {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
