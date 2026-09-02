import { useCallback, useEffect, useState } from 'react';

import type {
  RulePackDiffResponse,
  RulePackRecordResponse,
  RulePacksApi,
  RulePlatformId,
} from './api.js';

export function RulePackManager({ api }: { readonly api: RulePacksApi }): React.JSX.Element {
  const [platformId, setPlatformId] = useState<RulePlatformId>('pinduoduo');
  const [region, setRegion] = useState('CN');
  const [items, setItems] = useState<readonly RulePackRecordResponse[]>([]);
  const [contents, setContents] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [diff, setDiff] = useState<RulePackDiffResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const loaded = await api.list(platformId, region.trim());
    setItems(loaded);
  }, [api, platformId, region]);

  useEffect(() => {
    let active = true;
    void load().catch((cause: unknown) => {
      if (active) setError(message(cause));
    });
    return () => {
      active = false;
    };
  }, [load]);

  const execute = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rule-pack-manager">
      <section className="rule-toolbar" aria-label="规则包上下文">
        <label>
          平台
          <select
            aria-label="规则包平台"
            value={platformId}
            onChange={(event) => setPlatformId(event.target.value as RulePlatformId)}
          >
            <option value="pinduoduo">拼多多</option>
            <option value="taobao_tmall">淘宝 / 天猫</option>
            <option value="douyin_ecommerce">抖音电商</option>
          </select>
        </label>
        <label>
          区域
          <input
            aria-label="规则包区域"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          />
        </label>
      </section>

      <section className="rule-import-panel">
        <div>
          <h2>导入只读规则包</h2>
          <p>支持 JSON 或 ZIP。系统会校验版本、checksum、路径和内容；规则包不会执行代码。</p>
        </div>
        <label>
          选择规则包文件
          <input
            accept=".json,.zip,application/json,application/zip"
            aria-label="选择规则包文件"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          或粘贴规则包 JSON
          <textarea
            aria-label="规则包 JSON"
            value={contents}
            onChange={(event) => setContents(event.target.value)}
          />
        </label>
        <button
          aria-label="导入规则包"
          disabled={busy || (file === null && !contents.trim())}
          type="button"
          onClick={() =>
            void execute(async () => {
              if (file !== null && api.importFile !== undefined) await api.importFile(file);
              else await api.importJson(contents);
              setContents('');
              setFile(null);
              await load();
            })
          }
        >
          校验并导入
        </button>
      </section>

      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}

      <section aria-label="已安装规则包" className="rule-pack-list">
        <h2>已安装版本</h2>
        {items.length === 0 ? <p>当前平台和区域尚未安装规则包。</p> : null}
        {items.map((item) => {
          const needsReview = item.rules.filter(({ status }) => status === 'needs_review').length;
          return (
            <article className="rule-pack-card" key={item.id}>
              <header>
                <div>
                  <strong>{item.manifest.version}</strong>
                  <span>{item.active ? '当前启用' : '未启用'}</span>
                </div>
                <button
                  aria-label={`启用 ${item.manifest.version}`}
                  className="compact"
                  disabled={busy || item.active}
                  type="button"
                  onClick={() =>
                    void execute(async () => {
                      await api.activate(item.id);
                      await load();
                    })
                  }
                >
                  {item.active ? '已启用' : '启用'}
                </button>
              </header>
              <p>{item.manifest.description}</p>
              <dl>
                <div>
                  <dt>规则</dt>
                  <dd>{item.rules.length}</dd>
                </div>
                <div>
                  <dt>需要复核</dt>
                  <dd>{needsReview}</dd>
                </div>
                <div>
                  <dt>发布者</dt>
                  <dd>{item.manifest.publisher}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>

      <section className="rule-diff-panel">
        <h2>版本差异</h2>
        <div className="rule-diff-controls">
          <label>
            基准版本
            <select
              aria-label="对比基准版本"
              value={beforeId}
              onChange={(event) => setBeforeId(event.target.value)}
            >
              <option value="">请选择</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.manifest.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            目标版本
            <select
              aria-label="对比目标版本"
              value={afterId}
              onChange={(event) => setAfterId(event.target.value)}
            >
              <option value="">请选择</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.manifest.version}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-label="查看规则差异"
            disabled={busy || !beforeId || !afterId || beforeId === afterId}
            type="button"
            onClick={() => void execute(async () => setDiff(await api.diff(beforeId, afterId)))}
          >
            查看差异
          </button>
        </div>
        {diff ? (
          <div aria-label="规则差异" className="rule-diff-result">
            <p>
              新增 {diff.added.length} · 删除 {diff.removed.length} · 修改 {diff.changed.length}
            </p>
            <ul>
              {diff.added.map(({ key }) => (
                <li key={`add-${key}`}>新增：{key}</li>
              ))}
              {diff.removed.map(({ key }) => (
                <li key={`remove-${key}`}>删除：{key}</li>
              ))}
              {diff.changed.map(({ key }) => (
                <li key={`change-${key}`}>修改：{key}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : '规则包操作失败';
}
