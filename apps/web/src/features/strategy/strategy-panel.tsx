import { useEffect, useState } from 'react';

import type { StrategyApi, StrategyAssetItem, StrategyKind } from './api.js';

const labels: Record<StrategyKind, string> = {
  competitor_analysis: '竞品分析',
  market_insight: '市场洞察',
  selling_point_set: '卖点方案',
};

export function StrategyPanel({
  api,
  productId,
  kinds,
}: {
  readonly api: StrategyApi;
  readonly productId: string;
  readonly kinds: readonly StrategyKind[];
}): React.JSX.Element {
  const [items, setItems] = useState<Partial<Record<StrategyKind, readonly StrategyAssetItem[]>>>(
    {},
  );
  const [busy, setBusy] = useState<StrategyKind | null>(null);
  const [error, setError] = useState('');
  const reload = async (kind: StrategyKind) => {
    const history = await api.list(productId, kind);
    setItems((current) => ({ ...current, [kind]: history }));
  };
  useEffect(() => {
    let active = true;
    void Promise.all(kinds.map(async (kind) => [kind, await api.list(productId, kind)] as const))
      .then((entries) => {
        if (active) setItems(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setError('无法读取策略历史');
      });
    return () => {
      active = false;
    };
  }, [api, productId, kinds]);
  const generate = async (kind: StrategyKind) => {
    setBusy(kind);
    setError('');
    try {
      await api.generate(productId, kind);
      await reload(kind);
    } catch {
      setError('生成失败，请确认已配置 AI 且具备足够证据');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="strategy-workspace">
      <p className="feature-note">
        AI 结论只引用当前商品的已确认事实和审计快照；无证据想法会进入待核实事实。
      </p>
      {error && <p role="alert">{error}</p>}
      {kinds.map((kind) => {
        const latest = items[kind]?.[0];
        return (
          <article className="strategy-card" key={kind}>
            <header>
              <div>
                <span className="eyebrow">{labels[kind]}</span>
                <h2>{latest ? `修订 ${latest.revisionNo}` : '尚未生成'}</h2>
              </div>
              <button disabled={busy !== null} onClick={() => void generate(kind)}>
                {busy === kind ? '生成中…' : latest ? '重新生成' : '生成'}
              </button>
            </header>
            {latest ? <StrategyResult asset={latest} /> : <p>导入竞品并确认商品事实后生成。</p>}
          </article>
        );
      })}
    </section>
  );
}

function StrategyResult({ asset }: { readonly asset: StrategyAssetItem }): React.JSX.Element {
  const payload = asset.payload;
  const rows = arrayValue(payload.conclusions ?? payload.insights ?? payload.sellingPoints);
  const suggested = arrayValue(payload.suggestedFacts);
  const limitations = stringArray(payload.limitations);
  return (
    <div>
      <p>
        <strong>{asset.status === 'verified' ? '证据已验证' : '需要人工复核'}</strong> ·{' '}
        {new Date(asset.createdAt).toLocaleString('zh-CN')}
      </p>
      <ul className="strategy-results">
        {rows.map((row, index) => (
          <li key={index}>
            <strong>{text(row.headline) || text(row.summary)}</strong>
            {text(row.description) && <p>{text(row.description)}</p>}
            <small>证据：{evidence(row.evidenceRefs)}</small>
          </li>
        ))}
      </ul>
      {suggested.length > 0 && (
        <aside className="strategy-review">
          <h3>待核实事实</h3>
          <ul>
            {suggested.map((row, index) => (
              <li key={index}>
                {text(row.label)}：{text(row.reason)}
              </li>
            ))}
          </ul>
        </aside>
      )}
      {limitations.length > 0 && (
        <aside>
          <h3>数据限制</h3>
          <ul>
            {limitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => item !== null && typeof item === 'object',
      )
    : [];
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
function evidence(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '无（需核实）';
  return value
    .map((item) =>
      item !== null && typeof item === 'object' && 'kind' in item && 'id' in item
        ? `${String(item.kind)}:${String(item.id).slice(0, 8)}`
        : '',
    )
    .filter(Boolean)
    .join('、');
}
