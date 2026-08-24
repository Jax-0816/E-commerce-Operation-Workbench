import { useState } from 'react';

import type { ProductItem, ProductsApi } from './product-library.js';

export function ProductOnboarding({
  onCreated,
  productsApi,
}: {
  readonly onCreated: (product: ProductItem) => void;
  readonly productsApi: ProductsApi;
}): React.JSX.Element {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function create(): Promise<void> {
    setSaving(true);
    setError('');
    try {
      const product = await productsApi.create({ name: name.trim() });
      if (product) onCreated(product);
    } catch {
      setError('创建商品失败，请检查名称后重试。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="onboarding-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRODUCT SETUP</p>
          <h1>新建商品</h1>
          <p>步骤 {step} / 4</p>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {step === 1 ? (
        <div className="choice-grid">
          <button onClick={() => setStep(2)} type="button">
            <strong>手工创建</strong>
            <span>现在可用</span>
          </button>
          {['粘贴供应商资料', 'Excel / CSV 导入', '复制已有商品'].map((label) => (
            <button disabled key={label} title="后续导入能力开放后可用" type="button">
              <strong>{label}</strong>
              <span>尚未开放</span>
            </button>
          ))}
        </div>
      ) : null}
      {step === 2 ? (
        <div className="wizard-card">
          <label htmlFor="product-name">商品名称</label>
          <input
            aria-label="商品名称"
            id="product-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <div className="actions">
            <button disabled={!name.trim()} onClick={() => setStep(3)} type="button">
              下一步
            </button>
          </div>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="wizard-card">
          <h2>商品事实准备</h2>
          <p>商品创建后可以立即手工添加并确认事实。</p>
          <p className="notice">AI 辅助整理将在 Phase 6 开放，系统不会伪造 AI 提取结果。</p>
          <div className="actions">
            <button className="secondary" onClick={() => setStep(2)} type="button">
              上一步
            </button>
            <button onClick={() => setStep(4)} type="button">
              下一步
            </button>
          </div>
        </div>
      ) : null}
      {step === 4 ? (
        <div className="wizard-card">
          <h2>确认创建</h2>
          <dl>
            <dt>商品名称</dt>
            <dd>{name.trim()}</dd>
            <dt>下一步</dt>
            <dd>添加事实并配置 SKU</dd>
          </dl>
          <div className="actions">
            <button className="secondary" onClick={() => setStep(3)} type="button">
              上一步
            </button>
            <button disabled={saving} onClick={() => void create()} type="button">
              {saving ? '正在创建…' : '创建商品并进入工作区'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
