import { useEffect, useState } from 'react';
import type { ContentBuildersApi, ContentPlatform, CreativePlanView } from './api.js';

export function CreativeBuilder({
  api,
  productId,
}: {
  readonly api: ContentBuildersApi;
  readonly productId: string;
}): React.JSX.Element {
  const [platformId, setPlatform] = useState<ContentPlatform>('pinduoduo');
  const [history, setHistory] = useState<readonly CreativePlanView[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api
      .listCreative(productId, platformId)
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch(() => {
        if (active) setError('无法读取创意历史');
      });
    return () => {
      active = false;
    };
  }, [api, productId, platformId]);
  const act = async (run: () => Promise<CreativePlanView>) => {
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
    const ids = latest.revision.items.map(({ id }) => id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void act(() => api.reorderCreative(productId, platformId, ids));
  };
  return (
    <section className="content-builder">
      <header>
        <div>
          <span className="eyebrow">结构化视觉策划</span>
          <h2>五图创意方案</h2>
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
      <p className="feature-note">仅生成可审计的画面方案与提示词，不调用图片生成。</p>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void act(() => api.generateCreative(productId, platformId))}>
        {latest ? '重新生成方案' : '生成五图方案'}
      </button>
      {latest?.stale && <p>已过期：{latest.staleReasons.join('、')}</p>}
      <div className="creative-grid">
        {latest?.revision.items.map((item, index) => (
          <article data-testid="creative-item" key={item.id}>
            <h3>
              {item.order}. {item.headline}
            </h3>
            <p>{item.body}</p>
            <dl>
              <dt>中文提示词</dt>
              <dd>{item.promptZh}</dd>
              <dt>English prompt</dt>
              <dd>{item.promptEn}</dd>
              <dt>中文负面提示词</dt>
              <dd>{item.negativePromptZh}</dd>
              <dt>English negative</dt>
              <dd>{item.negativePromptEn}</dd>
            </dl>
            <p>
              证据 {item.evidenceRefs.length} 项 · 待核实 {item.reviewTerms.join('、') || '无'}
            </p>
            <div>
              <button
                disabled={item.locked}
                onClick={() =>
                  void act(() => api.regenerateCreativeItem(productId, platformId, item.id))
                }
              >
                重新生成此项
              </button>
              <button
                disabled={item.locked}
                onClick={() => void act(() => api.lockCreativeItem(productId, platformId, item.id))}
              >
                {item.locked ? '已锁定' : '锁定此项'}
              </button>
              <button disabled={index === 0} onClick={() => move(index, -1)}>
                上移
              </button>
              <button disabled={index === 4} onClick={() => move(index, 1)}>
                下移
              </button>
            </div>
          </article>
        ))}
      </div>
      {history.length > 0 && (
        <p>
          当前修订 {latest?.revision.revisionNo} · 历史 {history.length} 版
        </p>
      )}
    </section>
  );
}
