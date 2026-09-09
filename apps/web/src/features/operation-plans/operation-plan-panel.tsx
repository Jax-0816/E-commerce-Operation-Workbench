import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PricingApi, PricingHistoryResponse } from '../pricing/api.js';
import type { PromotionApi, PromotionHistoryResponse } from '../promotion/api.js';
import type { SkusApi } from '../skus/api.js';
import type { WorkflowApi, WorkflowPlatformId, WorkflowRun } from '../workflows/api.js';
import type {
  CreateOperationPlanInput,
  OperationPlanBlockerCode,
  OperationPlanResponse,
  OperationPlansApi,
} from './api.js';

interface OperationPlanPanelProps {
  readonly operationPlansApi: OperationPlansApi;
  readonly pricingApi: PricingApi;
  readonly productId: string;
  readonly promotionApi: PromotionApi;
  readonly skusApi: SkusApi;
  readonly workflowApi: WorkflowApi;
}

type PricingRecord = PricingHistoryResponse['items'][number]['results'][number];
type PromotionItem = PromotionHistoryResponse['items'][number];

const platformLabels: Readonly<Record<WorkflowPlatformId, string>> = {
  pinduoduo: '拼多多',
  taobao: '淘宝',
  douyin: '抖音',
};

const nodeLabels: Readonly<
  Record<OperationPlanResponse['sources']['nodes'][number]['nodeKey'], string>
> = {
  competitor_analysis: '竞品分析',
  market_insight: '市场洞察',
  selling_points: '卖点',
  titles: '标题',
  creative: '创意方案',
  detail_page: '详情页',
};

export function OperationPlanPanel({
  operationPlansApi,
  pricingApi,
  productId,
  promotionApi,
  skusApi,
  workflowApi,
}: OperationPlanPanelProps): React.JSX.Element {
  const generation = useRef(0);
  const [platformId, setPlatformId] = useState<WorkflowPlatformId>('pinduoduo');
  const [plans, setPlans] = useState<readonly OperationPlanResponse[]>([]);
  const [runs, setRuns] = useState<readonly WorkflowRun[]>([]);
  const [pricingRecords, setPricingRecords] = useState<readonly PricingRecord[]>([]);
  const [promotionItems, setPromotionItems] = useState<readonly PromotionItem[]>([]);
  const [workflowRunId, setWorkflowRunId] = useState('');
  const [pricingRecordId, setPricingRecordId] = useState('');
  const [promotionScenarioId, setPromotionScenarioId] = useState('');
  const [currentPlan, setCurrentPlan] = useState<OperationPlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('正在读取运营方案来源…');

  useEffect(() => {
    const token = ++generation.current;
    setPlans([]);
    setRuns([]);
    setPricingRecords([]);
    setPromotionItems([]);
    setCurrentPlan(null);
    setBusy(false);
    setWorkflowRunId('');
    setPricingRecordId('');
    setPromotionScenarioId('');
    setMessage('正在读取运营方案来源…');

    void Promise.all([
      operationPlansApi.list(productId),
      workflowApi.list(productId),
      skusApi.get(productId),
      promotionApi.history(productId),
    ])
      .then(async ([loadedPlans, loadedRuns, matrix, promotions]) => {
        const pricingHistories = await Promise.all(
          matrix.skus
            .filter((sku) => sku.enabled)
            .map((sku) => pricingApi.history(productId, sku.id)),
        );
        if (generation.current !== token) return;
        const sortedPlans = newestFirst(loadedPlans);
        setPlans(sortedPlans);
        setCurrentPlan(sortedPlans[0] ?? null);
        setRuns(loadedRuns);
        setPricingRecords(
          pricingHistories
            .flatMap((history) => history.items.flatMap((item) => item.results))
            .filter((record) => record.status === 'verified' || record.status === 'warning')
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        );
        setPromotionItems(promotions.items);
        setMessage(
          sortedPlans[0] ? statusMessage(sortedPlans[0]) : '来源已载入，请选择精确记录创建草稿。',
        );
      })
      .catch(() => {
        if (generation.current === token) setMessage('运营方案来源读取失败，请检查上游工作区。');
      });

    return () => {
      if (generation.current === token) generation.current += 1;
    };
  }, [operationPlansApi, pricingApi, productId, promotionApi, skusApi, workflowApi]);

  const eligibleRuns = useMemo(
    () => runs.filter((run) => run.platformId === platformId && run.status === 'completed'),
    [platformId, runs],
  );
  const selectedPromotion = promotionItems.find(
    ({ scenario }) => scenario.id === promotionScenarioId,
  );
  const canCreate = workflowRunId !== '' && pricingRecordId !== '' && !busy;
  const canLock = currentPlan?.status === 'draft' && currentPlan.blockers.length === 0 && !busy;

  const createDraft = async (): Promise<void> => {
    if (!canCreate) return;
    const token = generation.current;
    setBusy(true);
    setMessage('正在创建草稿…');
    const input: CreateOperationPlanInput = selectedPromotion
      ? {
          workflowRunId,
          pricingRecordId,
          promotionScenarioId: selectedPromotion.scenario.id,
          promotionResultIds: selectedPromotion.results.map(({ id }) => id),
        }
      : { workflowRunId, pricingRecordId };
    try {
      const created = await operationPlansApi.create(productId, input);
      if (generation.current !== token) return;
      setPlans((values) => newestFirst([created, ...values]));
      setCurrentPlan(created);
      setMessage(statusMessage(created));
    } catch {
      if (generation.current === token) setMessage('草稿创建失败，请按提示检查来源。');
    } finally {
      if (generation.current === token) setBusy(false);
    }
  };

  const lockCurrent = async (): Promise<void> => {
    if (!currentPlan || !canLock) return;
    const token = generation.current;
    setBusy(true);
    setMessage('正在重新校验并锁定…');
    try {
      const locked = await operationPlansApi.lock(currentPlan.id, currentPlan.revisionNo);
      if (generation.current !== token) return;
      setPlans((values) => newestFirst([locked, ...values]));
      setCurrentPlan(locked);
      setMessage('运营方案已锁定，历史来源保持不可变。');
    } catch {
      if (generation.current === token) setMessage('锁定失败，来源可能已变化，请刷新草稿。');
    } finally {
      if (generation.current === token) setBusy(false);
    }
  };

  return (
    <section className="operation-plan-panel" aria-labelledby="operation-plan-title">
      <header>
        <div>
          <p className="eyebrow">精确来源 · 显式锁定</p>
          <h2 id="operation-plan-title">可追踪运营方案</h2>
        </div>
        <p aria-live="polite" role="status">
          {message}
        </p>
      </header>

      <div className="operation-plan-composer">
        <label>
          方案平台
          <select
            aria-label="方案平台"
            value={platformId}
            onChange={(event) => {
              setPlatformId(event.target.value as WorkflowPlatformId);
              setWorkflowRunId('');
              setPromotionScenarioId('');
            }}
          >
            {Object.entries(platformLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          工作流来源
          <select
            aria-label="工作流来源"
            value={workflowRunId}
            onChange={(event) => setWorkflowRunId(event.target.value)}
          >
            <option value="">选择已完成工作流</option>
            {eligibleRuns.map((run) => (
              <option key={run.id} value={run.id}>
                {run.id} · 修订 {run.revision}
              </option>
            ))}
          </select>
        </label>
        <label>
          定价来源
          <select
            aria-label="定价来源"
            value={pricingRecordId}
            onChange={(event) => setPricingRecordId(event.target.value)}
          >
            <option value="">选择已验证定价结果</option>
            {pricingRecords.map((record) => (
              <option key={record.id} value={record.id}>
                {record.id} · {record.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          活动来源
          <select
            aria-label="活动来源"
            value={promotionScenarioId}
            onChange={(event) => setPromotionScenarioId(event.target.value)}
            disabled={platformId !== 'pinduoduo'}
          >
            <option value="">不引用活动模拟</option>
            {promotionItems
              .filter(({ results }) => results.length > 0)
              .map(({ scenario, results }) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.id} · {results.length} 项结果
                </option>
              ))}
          </select>
        </label>
        <button disabled={!canCreate} onClick={() => void createDraft()} type="button">
          创建草稿
        </button>
      </div>

      {currentPlan ? (
        <section className="operation-plan-current" aria-label="当前方案修订">
          <PlanTrace plan={currentPlan} />
          {currentPlan.blockers.length > 0 && (
            <aside className="operation-plan-blockers" aria-label="锁定阻塞项">
              <h3>锁定前需要处理</h3>
              <ul>
                {currentPlan.blockers.map((blocker) => (
                  <li key={`${blocker.code}:${blocker.source}`}>
                    <strong>{blockerLabel(blocker.code)}</strong>
                    <span>{blocker.source}</span>
                    <Link to={blockerHref(productId, blocker.code, blocker.source)}>前往处理</Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
          <button disabled={!canLock} onClick={() => void lockCurrent()} type="button">
            锁定当前修订
          </button>
        </section>
      ) : null}

      <section className="operation-plan-history" aria-labelledby="operation-plan-history-title">
        <h3 id="operation-plan-history-title">不可变修订历史</h3>
        {plans.length === 0 ? (
          <p>尚无运营方案。</p>
        ) : (
          <ol>
            {plans.map((plan) => (
              <li data-testid="operation-plan-history-item" key={plan.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentPlan(plan);
                    setMessage(statusMessage(plan));
                  }}
                >
                  <span>
                    {plan.status === 'locked' ? '已锁定' : '草稿'} · 修订 {plan.revisionNo}
                  </span>
                  <code>{plan.id}</code>
                  <time dateTime={plan.createdAt}>
                    {new Date(plan.createdAt).toLocaleString('zh-CN')}
                  </time>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

function PlanTrace({ plan }: { readonly plan: OperationPlanResponse }): React.JSX.Element {
  return (
    <details open className="operation-plan-trace">
      <summary>精确来源追踪</summary>
      <dl>
        <div>
          <dt>方案 ID</dt>
          <dd>
            <code>{plan.id}</code>
          </dd>
        </div>
        <div>
          <dt>工作流</dt>
          <dd>
            <code>{plan.sources.workflowRunId}</code> · 工作流修订{' '}
            {plan.sources.workflowRunRevision}
          </dd>
        </div>
        <div>
          <dt>定价结果</dt>
          <dd>
            <code>{plan.sources.pricing.resultId}</code> · 成本修订{' '}
            {plan.sources.pricing.costProfileRevisionNo}
          </dd>
        </div>
        <div>
          <dt>来源哈希</dt>
          <dd>
            <code>{plan.sourceHash}</code>
          </dd>
        </div>
      </dl>
      <ol aria-label="内容资产来源">
        {plan.sources.nodes.map((node) => (
          <li key={node.nodeKey}>
            <strong>{nodeLabels[node.nodeKey]}</strong>
            <code>{node.assetId}</code>
            <span>资产修订 {node.revisionNo}</span>
            <code>{node.dependencyHash}</code>
          </li>
        ))}
      </ol>
      <p>竞品快照：{plan.sources.competitorSnapshotIds.join('、')}</p>
      {plan.sources.promotion && (
        <p>
          活动：<code>{plan.sources.promotion.scenarioId}</code> · 规则哈希{' '}
          <code>{plan.sources.promotion.ruleSnapshotHash}</code>
        </p>
      )}
    </details>
  );
}

function newestFirst(values: readonly OperationPlanResponse[]): readonly OperationPlanResponse[] {
  return [...values].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.revisionNo - left.revisionNo,
  );
}

function statusMessage(plan: OperationPlanResponse): string {
  if (plan.status === 'locked') return '当前为已锁定修订，来源不可变。';
  return plan.blockers.length === 0
    ? '草稿已通过当前来源校验，可以显式锁定。'
    : `存在 ${plan.blockers.length} 项阻塞，处理后才能锁定。`;
}

function blockerLabel(code: OperationPlanBlockerCode): string {
  return {
    SOURCE_STALE: '来源已有新修订',
    SOURCE_NEEDS_REVIEW: '来源需要复核',
    CONTENT_UNLOCKED: '内容尚未锁定',
    FINANCIAL_INPUT_MISMATCH: '财务输入不一致',
    RULE_SNAPSHOT_MISMATCH: '规则快照不一致',
  }[code];
}

function blockerHref(productId: string, code: OperationPlanBlockerCode, source: string): string {
  if (code === 'FINANCIAL_INPUT_MISMATCH') return `/products/${productId}/pricing`;
  if (code === 'RULE_SNAPSHOT_MISMATCH') return `/products/${productId}/promotion`;
  if (source.includes('creative')) return `/products/${productId}/creative`;
  if (source.includes('detail')) return `/products/${productId}/detail`;
  if (source.includes('title')) return `/products/${productId}/titles`;
  if (source.includes('selling')) return `/products/${productId}/selling-points`;
  return `/products/${productId}/market`;
}
