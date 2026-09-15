import type { SystemStatusResponse } from '@eaw/contracts/system-status';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { SystemStatusApi } from './api.js';

export function SystemSettingsPanel({ api }: { readonly api: SystemStatusApi }): React.JSX.Element {
  const [status, setStatus] = useState<SystemStatusResponse>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .get()
      .then((value) => active && setStatus(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [api]);

  if (failed) return <p role="alert">无法加载系统状态，请确认本地服务正在运行后重试。</p>;
  if (!status) return <p role="status">正在加载系统状态…</p>;

  return (
    <section className="system-settings-panel">
      <div className="local-only-notice">
        <strong>仅限本机</strong>
        <p>服务固定绑定 {status.bindAddress}，只接受当前电脑的回环连接，不向局域网或公网开放。</p>
      </div>
      <dl className="system-status-grid">
        <div>
          <dt>应用版本</dt>
          <dd>版本 {status.appVersion}</dd>
        </div>
        <div>
          <dt>AI 能力</dt>
          <dd>DeepSeek {status.ai.configured ? '已配置' : '未配置'}</dd>
          <small>{status.ai.model}</small>
        </div>
        <div>
          <dt>提示词</dt>
          <dd>
            {status.prompts.activeCount} / {status.prompts.installedCount}
          </dd>
          <small>已启用 / 已安装</small>
        </div>
        <div>
          <dt>拼多多规则</dt>
          <dd>{status.rules.activePinduoduoCnVersion ?? '未启用'}</dd>
          <small>
            已安装 {status.rules.installedCount} 个，待审核 {status.rules.unresolvedActiveRuleCount}{' '}
            条
          </small>
        </div>
      </dl>
      <nav aria-label="系统设置入口" className="system-settings-links">
        <Link to="/capabilities/ai">管理 AI 设置</Link>
        <Link to="/capabilities/rules">管理平台规则</Link>
        <Link to="/capabilities/data">备份与恢复</Link>
      </nav>
      <p className="redaction-note">此页面不会显示 API 密钥、工作区路径、进程信息或日志。</p>
    </section>
  );
}
