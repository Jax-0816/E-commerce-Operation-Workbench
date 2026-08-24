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

export interface FactDraftInput {
  readonly label: string;
  readonly value: FactValue | null;
  readonly unit: string | null;
  readonly sourceType: FactItem['sourceType'];
  readonly sourceRef: string | null;
  readonly verification: 'unverified' | 'inferred' | 'missing';
  readonly sensitive: boolean;
  readonly policyEligible: boolean;
}

export interface FactWorkspaceApi extends FactsApi {
  create(productId: string, input: FactDraftInput & { readonly key: string }): Promise<FactItem>;
  update(
    productId: string,
    factId: string,
    input: FactDraftInput & { readonly expectedUpdatedAt: string },
  ): Promise<FactItem>;
}

export function FactStatusTable({
  api,
  productId,
}: {
  readonly api: FactWorkspaceApi;
  readonly productId: string;
}): React.JSX.Element {
  const [items, setItems] = useState<readonly FactItem[]>();
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<FactItem | 'new'>();

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

  async function save(input: FactDraftInput & { readonly key?: string }): Promise<void> {
    setError(undefined);
    try {
      if (editing === 'new') {
        const created = await api.create(productId, { ...input, key: input.key ?? '' });
        setItems((current) => [...(current ?? []), created]);
      } else if (editing) {
        const updated = await api.update(productId, editing.id, {
          ...input,
          expectedUpdatedAt: editing.updatedAt,
        });
        setItems((current) => current?.map((item) => (item.id === editing.id ? updated : item)));
      }
      setEditing(undefined);
    } catch {
      setError('保存事实失败；数据可能已变化，请重试。');
    }
  }

  return (
    <section aria-labelledby="facts-heading" className="fact-status-table">
      <div className="panel-heading">
        <div>
          <h2 id="facts-heading">产品事实状态</h2>
          <p>只有经过人工确认且符合声明政策的事实，才能作为确定性宣传证据。</p>
        </div>
        <button onClick={() => setEditing('new')} type="button">
          添加事实
        </button>
      </div>
      {editing ? (
        <FactEditor
          fact={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(undefined)}
          onSave={(input) => void save(input)}
        />
      ) : null}
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
                    {fact.verification !== 'confirmed' ? (
                      <button
                        aria-label={`编辑 ${fact.label}`}
                        className="secondary compact"
                        onClick={() => setEditing(fact)}
                        type="button"
                      >
                        编辑
                      </button>
                    ) : null}
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

function FactEditor({
  fact,
  onCancel,
  onSave,
}: {
  readonly fact?: FactItem;
  readonly onCancel: () => void;
  readonly onSave: (input: FactDraftInput & { readonly key?: string }) => void;
}): React.JSX.Element {
  const [key, setKey] = useState(fact?.key ?? '');
  const [label, setLabel] = useState(fact?.label ?? '');
  const [valueType, setValueType] = useState<FactValue['type']>(fact?.value?.type ?? 'text');
  const [value, setValue] = useState(fact?.value === null ? '' : String(fact?.value?.value ?? ''));
  const [unit, setUnit] = useState(fact?.unit ?? '');
  const [sourceType, setSourceType] = useState<FactItem['sourceType']>(
    fact?.sourceType ?? 'manual',
  );
  const [sourceRef, setSourceRef] = useState(fact?.sourceRef ?? '');
  const [verification, setVerification] = useState<'unverified' | 'inferred' | 'missing'>(
    fact?.verification === 'missing' || fact?.verification === 'inferred'
      ? fact.verification
      : 'unverified',
  );
  const [sensitive, setSensitive] = useState(fact?.sensitive ?? false);
  const [policyEligible, setPolicyEligible] = useState(fact?.policyEligible ?? true);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const factValue = toFactValue(valueType, value, verification);
    onSave({
      ...(fact ? {} : { key: key.trim() }),
      label: label.trim(),
      value: factValue,
      unit: factValue?.type === 'number' && unit.trim() ? unit.trim() : null,
      sourceType,
      sourceRef: sourceRef.trim() || null,
      verification,
      sensitive,
      policyEligible: sensitive ? policyEligible : true,
    });
  };

  return (
    <form
      aria-label={fact ? `编辑事实 ${fact.label}` : '添加事实'}
      className="fact-editor"
      onSubmit={submit}
    >
      {!fact ? (
        <label>
          事实键
          <input
            aria-label="事实键"
            maxLength={80}
            onChange={(event) => setKey(event.target.value)}
            required
            value={key}
          />
        </label>
      ) : null}
      <label>
        事实名称
        <input
          aria-label="事实名称"
          maxLength={120}
          onChange={(event) => setLabel(event.target.value)}
          required
          value={label}
        />
      </label>
      <label>
        值类型
        <select
          aria-label="值类型"
          onChange={(event) => setValueType(event.target.value as FactValue['type'])}
          value={valueType}
        >
          <option value="text">文本</option>
          <option value="number">数值</option>
          <option value="boolean">是/否</option>
        </select>
      </label>
      {verification !== 'missing' ? (
        <label>
          事实值
          {valueType === 'boolean' ? (
            <select
              aria-label="事实值"
              onChange={(event) => setValue(event.target.value)}
              value={value}
            >
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          ) : (
            <input
              aria-label="事实值"
              onChange={(event) => setValue(event.target.value)}
              required
              value={value}
            />
          )}
        </label>
      ) : null}
      {valueType === 'number' && verification !== 'missing' ? (
        <label>
          单位
          <input
            aria-label="单位"
            maxLength={40}
            onChange={(event) => setUnit(event.target.value)}
            value={unit}
          />
        </label>
      ) : null}
      <label>
        来源
        <select
          aria-label="来源"
          onChange={(event) => setSourceType(event.target.value as FactItem['sourceType'])}
          value={sourceType}
        >
          <option value="manual">手工录入</option>
          <option value="supplier">供应商</option>
          <option value="import">导入</option>
          <option value="document">文档</option>
          <option value="other">其他</option>
        </select>
      </label>
      <label>
        来源依据
        <input
          aria-label="来源依据"
          maxLength={500}
          onChange={(event) => setSourceRef(event.target.value)}
          value={sourceRef}
        />
      </label>
      <label>
        核验状态
        <select
          aria-label="核验状态"
          onChange={(event) => setVerification(event.target.value as typeof verification)}
          value={verification}
        >
          <option value="unverified">未核验</option>
          <option value="missing">缺失</option>
          <option value="inferred">推断</option>
        </select>
      </label>
      <label className="checkbox-label">
        <input
          checked={sensitive}
          onChange={(event) => setSensitive(event.target.checked)}
          type="checkbox"
        />
        敏感声明
      </label>
      {sensitive ? (
        <label className="checkbox-label">
          <input
            checked={policyEligible}
            onChange={(event) => setPolicyEligible(event.target.checked)}
            type="checkbox"
          />
          已满足声明政策
        </label>
      ) : null}
      <div className="actions">
        <button className="secondary" onClick={onCancel} type="button">
          取消
        </button>
        <button
          disabled={
            !label.trim() || (!fact && !key.trim()) || (verification !== 'missing' && !value.trim())
          }
          type="submit"
        >
          {fact ? '保存修改' : '保存事实'}
        </button>
      </div>
    </form>
  );
}

function toFactValue(
  type: FactValue['type'],
  value: string,
  verification: 'unverified' | 'inferred' | 'missing',
): FactValue | null {
  if (verification === 'missing') return null;
  if (type === 'number') return { type, value: Number(value) };
  if (type === 'boolean') return { type, value: value !== 'false' };
  return { type, value: value.trim() };
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
