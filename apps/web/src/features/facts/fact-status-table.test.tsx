// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { FactStatusTable, type FactItem, type FactsApi } from './fact-status-table.js';

const containers: HTMLDivElement[] = [];
const productId = '0198f0a0-0000-7000-8000-000000000001';

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('FactStatusTable', () => {
  it('shows all statuses, an inferred warning, and no ineligible confirm controls', async () => {
    const { container, root } = await render([
      fact('000000000101', '材质', 'confirmed'),
      fact('000000000102', '保温时长', 'inferred'),
      fact('000000000103', '食品级', 'missing'),
      { ...fact('000000000104', '医疗安全', 'unverified'), sensitive: true, policyEligible: false },
    ]);

    expect(container.querySelector('table')?.textContent).toContain('材质');
    expect(container.textContent).toContain('已确认');
    expect(container.textContent).toContain('AI 推断，未经人工确认');
    expect(container.textContent).toContain('缺失');
    expect(container.textContent).toContain('需先完成敏感声明政策核验');
    expect(container.querySelector('[aria-label="确认 材质"]')).toBeNull();
    expect(container.querySelector('[aria-label="确认 食品级"]')).toBeNull();
    expect(container.querySelector('[aria-label="确认 医疗安全"]')).toBeNull();
    expect(container.querySelector('[aria-label="确认 保温时长"]')).not.toBeNull();
    root.unmount();
  });

  it('requires an evidence reference and an explicit click before confirming', async () => {
    const calls: Parameters<FactsApi['confirm']>[] = [];
    const { container, root } = await render([fact('000000000102', '保温时长', 'inferred')], {
      async confirm(...args) {
        calls.push(args);
        return {
          ...fact('000000000102', '保温时长', 'confirmed'),
          confirmedAt: '2026-08-19T09:00:00.000Z',
        };
      },
    });
    expect(calls).toEqual([]);
    const button = container.querySelector<HTMLButtonElement>('[aria-label="确认 保温时长"]')!;
    expect(button.disabled).toBe(true);
    const evidence = container.querySelector<HTMLInputElement>('[aria-label="确认依据 保温时长"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(evidence, 'supplier:certificate-1');
      evidence.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button.disabled).toBe(false);
    await act(async () => button.click());

    expect(calls).toEqual([
      [
        productId,
        '0198f0a0-0000-7000-8000-000000000102',
        {
          expectedUpdatedAt: '2026-08-19T08:00:00.000Z',
          actorRef: 'local-user',
          evidenceRef: 'supplier:certificate-1',
        },
      ],
    ]);
    expect(container.textContent).toContain('已确认');
    root.unmount();
  });
});

async function render(items: FactItem[], overrides: Partial<FactsApi> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  const api: FactsApi = {
    async list() {
      return items;
    },
    async confirm() {
      throw new Error('unexpected confirm');
    },
    ...overrides,
  };
  await act(async () => root.render(<FactStatusTable api={api} productId={productId} />));
  return { container, root };
}

function fact(suffix: string, label: string, verification: FactItem['verification']): FactItem {
  return {
    id: `0198f0a0-0000-7000-8000-${suffix}`,
    productId,
    key: `key_${suffix}`,
    label,
    value: verification === 'missing' ? null : { type: 'text', value: label },
    unit: null,
    sourceType: verification === 'inferred' ? 'ai_inferred' : 'manual',
    sourceRef: null,
    verification,
    sensitive: false,
    policyEligible: true,
    revisionNo: 1,
    supersedesFactId: null,
    createdAt: '2026-08-19T08:00:00.000Z',
    updatedAt: '2026-08-19T08:00:00.000Z',
    confirmedAt: verification === 'confirmed' ? '2026-08-19T08:00:00.000Z' : null,
    confirmation:
      verification === 'confirmed'
        ? { actorType: 'user', actorRef: 'local-user', evidenceRef: 'manual:1' }
        : null,
  };
}
