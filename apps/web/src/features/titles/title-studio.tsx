import { useEffect, useState } from 'react';

import type { TitleCandidate, TitlePlatform, TitlesApi, TitleAssetView } from './api.js';

const variantLabels = {
  recommended: '推荐型',
  search: '搜索型',
  selling_point: '卖点型',
  scenario: '场景型',
} as const;

export function TitleStudio({
  api,
  productId,
}: {
  readonly api: TitlesApi;
  readonly productId: string;
}): React.JSX.Element {
  const [platformId, setPlatformId] = useState<TitlePlatform>('pinduoduo');
  const [history, setHistory] = useState<readonly TitleAssetView[]>([]);
  const [drafts, setDrafts] = useState<readonly TitleCandidate[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    const items = await api.list(productId, platformId);
    setHistory(items);
    setDrafts(items[0]?.revision.titles ?? []);
  };
  useEffect(() => {
    let active = true;
    void api
      .list(productId, platformId)
      .then((items) => {
        if (active) {
          setHistory(items);
          setDrafts(items[0]?.revision.titles ?? []);
        }
      })
      .catch(() => {
        if (active) setError('无法读取标题历史');
      });
    return () => {
      active = false;
    };
  }, [api, productId, platformId]);
  const action = async (name: string, run: () => Promise<unknown>) => {
    setBusy(name);
    setError('');
    try {
      await run();
      await load();
    } catch {
      setError('操作失败，请检查 AI 配置、事实证据和输入');
    } finally {
      setBusy('');
    }
  };
  const update = (index: number, text: string) =>
    setDrafts((current) =>
      current.map((title, candidateIndex) =>
        candidateIndex === index ? { ...title, text } : title,
      ),
    );
  const latest = history[0];
  return (
    <section className="title-studio">
      <header>
        <div>
          <span className="eyebrow">版本化内容资产</span>
          <h2>标题工作室</h2>
        </div>
        <label>
          平台
          <select
            value={platformId}
            onChange={(event) => setPlatformId(event.target.value as TitlePlatform)}
          >
            <option value="pinduoduo">拼多多</option>
            <option value="taobao">淘宝/天猫</option>
            <option value="douyin">抖音电商</option>
          </select>
        </label>
      </header>
      <p className="feature-note">
        生成、编辑和锁定都会新增修订；旧版本不会被覆盖。无事实支撑词语会进入人工复核。
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="title-actions">
        <button
          disabled={Boolean(busy)}
          onClick={() => void action('generate', () => api.generate(productId, platformId))}
        >
          {busy === 'generate' ? '生成中…' : latest ? '重新生成' : '生成四类标题'}
        </button>
        <button
          disabled={Boolean(busy) || drafts.length !== 4}
          onClick={() => void action('save', () => api.edit(productId, platformId, drafts))}
        >
          保存编辑为新修订
        </button>
        <button
          disabled={Boolean(busy) || !latest}
          onClick={() => void action('lock', () => api.lock(productId, platformId))}
        >
          锁定当前修订
        </button>
      </div>
      {latest && (
        <p>
          <strong>修订 {latest.revision.revisionNo}</strong> ·{' '}
          {latest.revision.locked
            ? '已锁定'
            : latest.revision.status === 'verified'
              ? '校验通过'
              : '需要复核'}
          {latest.stale ? ` · 已过期：${latest.staleReasons.join('、')}` : ''}
        </p>
      )}
      <div className="title-candidates">
        {drafts.map((title, index) => (
          <label key={title.variant}>
            <span>{variantLabels[title.variant]}</span>
            <input value={title.text} onChange={(event) => update(index, event.target.value)} />
            <small>
              关键词：{title.keywords.join('、') || '无'}；待核实：
              {title.reviewTerms.join('、') || '无'}
            </small>
          </label>
        ))}
      </div>
      {latest?.revision.validationIssues.length ? (
        <aside className="strategy-review">
          <h3>本地校验</h3>
          <ul>
            {latest.revision.validationIssues.map((issue, index) => (
              <li key={index}>{issue.detail}</li>
            ))}
          </ul>
        </aside>
      ) : null}
      {history.length > 0 && (
        <ol className="title-history">
          {history.map(({ revision, stale }) => (
            <li key={revision.id}>
              修订 {revision.revisionNo} · {revision.origin} · {revision.locked ? '锁定' : '未锁定'}
              {stale ? ' · stale' : ''}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
