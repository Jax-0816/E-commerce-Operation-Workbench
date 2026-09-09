import { useEffect, useRef, useState } from 'react';

import type {
  WorkflowApi,
  WorkflowNodeKey,
  WorkflowPlatformId,
  WorkflowPreflight,
  WorkflowRun,
} from './api.js';

const nodeLabels: Readonly<Record<WorkflowNodeKey, string>> = {
  competitor_analysis: '竞品分析',
  market_insight: '市场洞察',
  selling_points: '卖点方案',
  titles: '标题方案',
  creative: '创意方案',
  detail_page: '详情页',
};
const platformLabels: Readonly<Record<WorkflowPlatformId, string>> = {
  pinduoduo: '拼多多',
  taobao: '淘宝',
  douyin: '抖音',
};
const statusLabels: Readonly<Record<string, string>> = {
  not_started: '未开始',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  interrupted: '已中断',
  cancelled: '已取消',
  stale: '依赖已变化',
  locked: '已锁定',
  needs_review: '需要复核',
};

export function WorkflowProgress({
  api,
  productId,
}: {
  readonly api: WorkflowApi;
  readonly productId: string;
}): React.JSX.Element {
  const [platformId, setPlatformId] = useState<WorkflowPlatformId>('pinduoduo');
  const [preflight, setPreflight] = useState<WorkflowPreflight | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const generation = useRef(0);
  const stream = useRef<(() => void) | undefined>(undefined);
  const connectCurrentRun = useRef<(workflowRunId: string) => void>(() => undefined);
  const lastSequence = useRef(0);
  const reconnecting = useRef(false);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    stream.current?.();
    stream.current = undefined;
    lastSequence.current = 0;
    reconnecting.current = false;
    setPreflight(null);
    setRun(null);
    setError('');

    const current = () => generation.current === requestGeneration;
    const connect = (workflowRunId: string): void => {
      if (!current()) return;
      stream.current?.();
      stream.current = api.subscribe(
        workflowRunId,
        lastSequence.current,
        (event) => {
          if (!current() || event.workflowRunId !== workflowRunId) return;
          lastSequence.current = Math.max(lastSequence.current, event.sequence);
          void reconcile(workflowRunId);
        },
        () => void reconnect(workflowRunId),
      );
    };
    connectCurrentRun.current = connect;
    const reconcile = async (workflowRunId: string): Promise<void> => {
      try {
        const authoritative = await api.get(workflowRunId);
        if (current() && authoritative.productId === productId && authoritative.platformId === platformId) {
          setRun(authoritative);
        }
      } catch {
        if (current()) setError('无法刷新工作流状态');
      }
    };
    const reconnect = async (workflowRunId: string): Promise<void> => {
      if (!current() || reconnecting.current) return;
      reconnecting.current = true;
      stream.current?.();
      stream.current = undefined;
      connectCurrentRun.current = () => undefined;
      try {
        const authoritative = await api.get(workflowRunId);
        if (!current() || authoritative.productId !== productId || authoritative.platformId !== platformId) return;
        setRun(authoritative);
        connect(workflowRunId);
      } catch {
        if (current()) setError('事件连接已断开，请稍后重试');
      } finally {
        reconnecting.current = false;
      }
    };

    void Promise.all([api.preflight(productId, platformId), api.list(productId)])
      .then(async ([inspection, runs]) => {
        if (!current()) return;
        setPreflight(inspection);
        const latest = runs
          .filter((candidate) => candidate.platformId === platformId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
        if (!latest) return;
        const authoritative = await api.get(latest.id);
        if (!current() || authoritative.productId !== productId || authoritative.platformId !== platformId) return;
        setRun(authoritative);
        connect(authoritative.id);
      })
      .catch(() => {
        if (current()) setError('无法读取工作流预检与历史状态');
      });
    return () => {
      if (generation.current === requestGeneration) generation.current += 1;
      stream.current?.();
      stream.current = undefined;
    };
  }, [api, platformId, productId]);

  const updateRun = async (
    actionName: string,
    operation: () => Promise<WorkflowRun>,
  ): Promise<void> => {
    const requestGeneration = generation.current;
    setBusy(actionName);
    setError('');
    try {
      const result = await operation();
      if (
        requestGeneration === generation.current &&
        result.productId === productId &&
        result.platformId === platformId
      ) {
        setRun(result);
        connectCurrentRun.current(result.id);
      }
    } catch {
      if (requestGeneration === generation.current) setError('工作流操作失败，请刷新状态后重试');
    } finally {
      if (requestGeneration === generation.current) setBusy('');
    }
  };
  const start = () =>
    updateRun('start', () => api.start(productId, platformId));
  const resume = () => run && updateRun('resume', () => api.resume(run.id, run.revision));
  const cancel = () => run && updateRun('cancel', () => api.cancel(run.id, run.revision));
  const retry = (nodeKey: WorkflowNodeKey) =>
    run && updateRun(`retry:${nodeKey}`, () => api.retry(run.id, nodeKey, run.revision));

  const nodes = run?.nodes ?? preflight?.nodes ?? [];
  const canStart = !run && preflight?.nodes.every(({ runnable }) => runnable) === true;
  const announcement = run
    ? `工作流${statusLabels[run.status] ?? run.status}`
    : preflight
      ? '预检完成，可启动工作流'
      : '正在读取工作流状态';

  return (
    <section className="workflow-progress">
      <header className="workflow-toolbar">
        <div>
          <p className="eyebrow">可恢复内容生产</p>
          <h2>{platformLabels[platformId]}运营工作流</h2>
        </div>
        <label>
          平台
          <select
            aria-label="工作流平台"
            disabled={busy !== ''}
            value={platformId}
            onChange={(event) => setPlatformId(event.target.value as WorkflowPlatformId)}
          >
            {Object.entries(platformLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </header>

      <p aria-live="polite" className="workflow-announcement">{announcement}</p>
      {error && <p role="alert">{error}</p>}
      {run?.status === 'interrupted' && (
        <p className="workflow-interrupted" role="status">服务曾中断；确认当前输入后手动恢复，不会自动消耗 AI 额度。</p>
      )}

      <div className="workflow-actions">
        {!run && (
          <button disabled={!canStart || busy !== ''} onClick={() => void start()} type="button">
            {busy === 'start' ? '启动中…' : '启动工作流'}
          </button>
        )}
        {run && ['failed', 'interrupted'].includes(run.status) && (
          <button disabled={busy !== ''} onClick={() => void resume()} type="button">恢复工作流</button>
        )}
        {run && ['not_started', 'running', 'failed', 'interrupted'].includes(run.status) && (
          <button className="secondary" disabled={busy !== ''} onClick={() => void cancel()} type="button">取消工作流</button>
        )}
      </div>

      <ol className="workflow-node-list">
        {nodes.map((node) => {
          const currentNode = 'status' in node ? node : undefined;
          const inspection = preflight?.nodes.find(({ key }) => key === node.key);
          return (
            <li data-testid="workflow-node" key={node.key}>
              <div className="workflow-node-heading">
                <strong>{nodeLabels[node.key]}</strong>
                <span>{currentNode ? statusLabels[currentNode.status] : inspection?.runnable ? '可运行' : '缺少输入'}</span>
              </div>
              {inspection && inspection.missingInputs.length > 0 && (
                <p>缺少：{inspection.missingInputs.join('、')}</p>
              )}
              {currentNode?.output && (
                <p>输出修订 {currentNode.output.revisionNo} · {currentNode.output.assetType}</p>
              )}
              {currentNode?.status === 'needs_review' && <p>输出需要人工复核后再发布。</p>}
              {currentNode?.status === 'stale' && <p>依赖已变化，请显式重试该节点。</p>}
              {currentNode?.error && (
                <p role="alert">{currentNode.error.code}：{currentNode.error.message}</p>
              )}
              {run && currentNode?.status === 'failed' && (
                <button disabled={busy !== ''} onClick={() => void retry(node.key)} type="button">
                  重试{nodeLabels[node.key]}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
