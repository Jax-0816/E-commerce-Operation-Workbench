// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FactStatusTable,
  type FactItem,
  type FactsApi,
  type FactWorkspaceApi,
} from './fact-status-table.js';

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

  it('adds a manual unverified text fact', async () => {
    const calls: unknown[] = [];
    const created = fact('000000000105', '杯身材质', 'unverified');
    const { container, root } = await render([], {
      async create(_productId, input) {
        calls.push(input);
        return created;
      },
    });

    await click(container, '添加事实');
    await input(container, '事实键', 'material');
    await input(container, '事实名称', '杯身材质');
    await input(container, '事实值', '304 不锈钢');
    await click(container, '保存事实');

    expect(calls).toEqual([
      {
        key: 'material',
        label: '杯身材质',
        value: { type: 'text', value: '304 不锈钢' },
        unit: null,
        sourceType: 'manual',
        sourceRef: null,
        verification: 'unverified',
        sensitive: false,
        policyEligible: true,
      },
    ]);
    expect(container.textContent).toContain('杯身材质');
    root.unmount();
  });

  it('edits an unconfirmed fact with its optimistic token', async () => {
    const original = fact('000000000106', '材质', 'unverified');
    const calls: unknown[] = [];
    const { container, root } = await render([original], {
      async update(_productId, _factId, input) {
        calls.push(input);
        return { ...original, label: input.label, value: input.value };
      },
    });

    await click(container, '编辑 材质');
    await input(container, '事实名称', '杯身材料');
    await input(container, '事实值', '316 不锈钢');
    await click(container, '保存修改');

    expect(calls).toEqual([
      expect.objectContaining({
        label: '杯身材料',
        value: { type: 'text', value: '316 不锈钢' },
        expectedUpdatedAt: original.updatedAt,
      }),
    ]);
    expect(container.textContent).toContain('杯身材料');
    root.unmount();
  });
});

async function render(items: FactItem[], overrides: Partial<FactWorkspaceApi> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  const api: FactWorkspaceApi = {
    async create() {
      throw new Error('unexpected create');
    },
    async list() {
      return items;
    },
    async confirm() {
      throw new Error('unexpected confirm');
    },
    async update() {
      throw new Error('unexpected update');
    },
    ...overrides,
  };
  await act(async () => root.render(<FactStatusTable api={api} productId={productId} />));
  return { container, root };
}

async function click(container: HTMLElement, label: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) =>
      candidate.getAttribute('aria-label') === label || candidate.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

async function input(container: HTMLElement, label: string, value: string): Promise<void> {
  const field = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  expect(field).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function fact(suffix: string, label: string, verification: FactItem['verification']): FactItem {
  return {
    id: `0198f0a0-0000-7000-8000-${suffix}`,
    lineageId: `0198f0a0-0000-7000-8000-${suffix}`,
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
