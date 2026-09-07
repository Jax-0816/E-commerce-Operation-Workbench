import { useEffect, useState } from 'react';
import type { ContentBuildersApi, ContentPlatform, DetailPageView } from './api.js';

export function DetailBuilder({
  api,
  productId,
}: {
  readonly api: ContentBuildersApi;
  readonly productId: string;
}): React.JSX.Element {
  const [platformId, setPlatform] = useState<ContentPlatform>('pinduoduo');
  const [history, setHistory] = useState<readonly DetailPageView[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api
      .listDetail(productId, platformId)
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch(() => {
        if (active) setError('无法读取详情页历史');
      });
    return () => {
      active = false;
    };
  }, [api, productId, platformId]);
  const act = async (run: () => Promise<DetailPageView>) => {
    setError('');
    try {
      const value = await run();
      setHistory((items) => [
        value,
        ...items.filter(({ revision }) => revision.id !== value.revision.id),
      ]);
    } catch {
      setError('操作失败，请检查事实证据和 AI 设置');
    }
  };
  const latest = history[0];
  const move = (index: number, delta: number) => {
    if (!latest) return;
    const ids = latest.revision.sections.map(({ id }) => id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void act(() => api.reorderDetail(productId, platformId, ids));
  };
  return (
    <section className="content-builder">
      <header>
        <div>
          <span className="eyebrow">结构化内容资产</span>
          <h2>详情页架构</h2>
        </div>
        <select
          aria-label="平台"
          value={platformId}
          onChange={(e) => setPlatform(e.target.value as ContentPlatform)}
        >
          <option value="pinduoduo">拼多多</option>
          <option value="taobao">淘宝/天猫</option>
          <option value="douyin">抖音电商</option>
        </select>
      </header>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void act(() => api.generateDetail(productId, platformId))}>
        {latest ? '重新生成架构' : '生成详情页架构'}
      </button>
      {latest?.stale && <p>已过期：{latest.staleReasons.join('、')}</p>}
      <ol className="detail-sections">
        {latest?.revision.sections.map((section, index) => (
          <li key={section.id}>
            <h3>{section.headline}</h3>
            <p>{section.body}</p>
            <p>
              证据 {section.evidenceRefs.length} 项 · 待核实{' '}
              {section.reviewTerms.join('、') || '无'}
            </p>
            <button
              disabled={section.locked}
              onClick={() =>
                void act(() => api.lockDetailSection(productId, platformId, section.id))
              }
            >
              {section.locked ? '已锁定' : '锁定区块'}
            </button>
            <button disabled={index === 0} onClick={() => move(index, -1)}>
              上移
            </button>
            <button
              disabled={index === latest.revision.sections.length - 1}
              onClick={() => move(index, 1)}
            >
              下移
            </button>
          </li>
        ))}
      </ol>
      {history.length > 0 && (
        <p>
          当前修订 {latest?.revision.revisionNo} · 历史 {history.length} 版
        </p>
      )}
    </section>
  );
}
