import { useEffect, useState } from 'react';

export type FactValue =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean };

export interface FactItem {
  readonly id: string;
  readonly lineageId: string;
  readonly productId: string;
  readonly key: string;
  readonly label: string;
  readonly value: FactValue | null;
  readonly unit: string | null;
  readonly sourceType:
    | 'manual'
    | 'supplier'
    | 'import'
    | 'document'
    | 'ai_inferred'
    | 'competitor_reference'
    | 'other';
  readonly sourceRef: string | null;
  readonly verification: 'confirmed' | 'unverified' | 'inferred' | 'missing';
  readonly sensitive: boolean;
  readonly policyEligible: boolean;
  readonly revisionNo: number;
  readonly supersedesFactId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt: string | null;
  readonly confirmation: {
    readonly actorType: 'user';
    readonly actorRef: string;
    readonly evidenceRef: string;
  } | null;
}

export interface FactsApi {
  list(productId: string): Promise<readonly FactItem[]>;
  confirm(
    productId: string,
    factId: string,
    input: {
      readonly expectedUpdatedAt: string;
      readonly actorRef: string;
      readonly evidenceRef: string;
    },
  ): Promise<FactItem>;
}

export function FactStatusTable({
  api,
  productId,
}: {
  readonly api: FactsApi;
  readonly productId: string;
}): React.JSX.Element {
  const [items, setItems] = useState<readonly FactItem[]>();
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string>();

  useEffect(() => {
    setItems(undefined);
    setError(undefined);
    void api
      .list(productId)
      .then(setItems)
      .catch(() => setError('无法加载产品事实，请稍后重试。'));
  }, [api, productId]);

  async function confirm(fact: FactItem): Promise<void> {
    const evidenceRef = evidence[fact.id]?.trim();
    if (!evidenceRef) return;
    setConfirming((current) => new Set(current).add(fact.id));
    setError(undefined);
    try {
      const confirmed = await api.confirm(productId, fact.id, {
        expectedUpdatedAt: fact.updatedAt,
        actorRef: 'local-user',
        evidenceRef,
      });
      setItems((current) => current?.map((item) => (item.id === fact.id ? confirmed : item)));
    } catch {
      setError('确认失败；事实可能已变化，请刷新后重试。');
    } finally {
      setConfirming((current) => {
        const next = new Set(current);
        next.delete(fact.id);
        return next;
      });
    }
  }

  return (
    <section aria-labelledby="facts-heading" className="fact-status-table">
      <h2 id="facts-heading">产品事实状态</h2>
      <p>只有经过人工确认且符合声明政策的事实，才能作为确定性宣传证据。</p>
      {error ? <p role="alert">{error}</p> : null}
      {items === undefined && !error ? <p>正在加载事实…</p> : null}
      {items?.length === 0 ? <p>尚未录入产品事实。</p> : null}
      {items && items.length > 0 ? (
        <table>
          <caption>当前事实及核验状态</caption>
          <thead>
            <tr>
              <th scope="col">事实</th>
              <th scope="col">值</th>
              <th scope="col">来源</th>
              <th scope="col">状态</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((fact) => {
              const canConfirm =
                (fact.verification === 'unverified' || fact.verification === 'inferred') &&
                fact.value !== null &&
                (!fact.sensitive || fact.policyEligible);
              return (
                <tr key={fact.id}>
                  <th scope="row">{fact.label}</th>
                  <td>{formatValue(fact)}</td>
                  <td>{sourceLabel(fact.sourceType)}</td>
                  <td>
                    {verificationLabel(fact.verification)}
                    {fact.verification === 'inferred' ? (
                      <span role="note"> — AI 推断，未经人工确认</span>
                    ) : null}
                    {fact.sensitive && !fact.policyEligible ? (
                      <span role="note"> — 需先完成敏感声明政策核验</span>
                    ) : null}
                  </td>
                  <td>
                    {canConfirm ? (
                      <div>
                        <label>
                          <span>确认依据</span>
                          <input
                            aria-label={`确认依据 ${fact.label}`}
                            onChange={(event) =>
                              setEvidence((current) => ({
                                ...current,
                                [fact.id]: event.target.value,
                              }))
                            }
                            value={evidence[fact.id] ?? ''}
                          />
                        </label>
                        <button
                          aria-label={`确认 ${fact.label}`}
                          disabled={!evidence[fact.id]?.trim() || confirming.has(fact.id)}
                          onClick={() => void confirm(fact)}
                          type="button"
                        >
                          {confirming.has(fact.id) ? '正在确认…' : '人工确认'}
                        </button>
                      </div>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function formatValue(fact: FactItem): string {
  if (fact.value === null) return '待补充';
  const value =
    fact.value.type === 'boolean' ? (fact.value.value ? '是' : '否') : String(fact.value.value);
  return fact.unit ? `${value} ${fact.unit}` : value;
}

function verificationLabel(status: FactItem['verification']): string {
  return { confirmed: '已确认', unverified: '未核验', inferred: '推断', missing: '缺失' }[status];
}

function sourceLabel(source: FactItem['sourceType']): string {
  return {
    manual: '手工录入',
    supplier: '供应商',
    import: '导入',
    document: '文档',
    ai_inferred: 'AI 推断',
    competitor_reference: '竞品参考',
    other: '其他',
  }[source];
}
