import { useEffect, useState } from 'react';

import type { AISettingsApi, AISettingsStatus } from './api.js';

export function AISettingsPanel({ api }: { readonly api: AISettingsApi }): React.JSX.Element {
  const [status, setStatus] = useState<AISettingsStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .get()
      .then(setStatus)
      .catch(() => setMessage('读取设置失败'));
  }, [api]);

  const perform = async (operation: () => Promise<AISettingsStatus>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      setStatus(await operation());
      setApiKey('');
      setMessage(success);
    } catch {
      setMessage('操作失败，请检查输入后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="DeepSeek 设置" className="ai-settings-panel">
      <header>
        <div>
          <p className="eyebrow">AI PROVIDER</p>
          <h2>DeepSeek</h2>
        </div>
        <strong className={status?.configured ? 'status-good' : 'status-muted'}>
          {status?.configured ? '已配置' : '未配置'}
        </strong>
      </header>
      <p>密钥仅保存在本地工作区的受保护存储中，页面和 API 不会回显。</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void perform(() => api.configure(apiKey), '设置已保存');
        }}
      >
        <label>
          DeepSeek API Key
          <input
            aria-label="DeepSeek API Key"
            autoComplete="new-password"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="输入新密钥（保存后清空）"
            type="password"
            value={apiKey}
          />
        </label>
        <div className="button-row">
          <button aria-label="保存 DeepSeek 设置" disabled={busy || apiKey.trim().length < 8}>
            保存密钥
          </button>
          <button
            aria-label="测试 DeepSeek 连接"
            disabled={busy || !status?.configured}
            onClick={() => {
              setBusy(true);
              void api
                .testConnection()
                .then(({ ok }) => setMessage(ok ? '连接正常' : '连接失败'))
                .catch(() => setMessage('连接失败'))
                .finally(() => setBusy(false));
            }}
            type="button"
          >
            测试连接
          </button>
          <button
            aria-label="清除 DeepSeek 密钥"
            className="button-secondary"
            disabled={busy || !status?.configured}
            onClick={() => void perform(() => api.clear(), '密钥已清除')}
            type="button"
          >
            清除密钥
          </button>
        </div>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
