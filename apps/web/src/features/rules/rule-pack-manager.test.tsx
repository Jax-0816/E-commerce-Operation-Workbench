// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { RulePackManager } from './rule-pack-manager.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('RulePackManager', () => {
  it('imports, activates, and compares rule pack versions without hiding review status', async () => {
    let items = [record('pack-one', '2026.9.0', false), record('pack-two', '2026.9.1', false)];
    const calls: string[] = [];
    const api = {
      async list(platformId: string, region: string) {
        calls.push(`list:${platformId}:${region}`);
        return items;
      },
      async importJson(contents: string) {
        calls.push(`import:${contents}`);
        const imported = record('pack-three', '2026.9.2', false);
        items = [imported, ...items];
        return imported;
      },
      async activate(id: string) {
        calls.push(`activate:${id}`);
        items = items.map((item) => ({ ...item, active: item.id === id }));
        return items.find((item) => item.id === id)!;
      },
      async diff(beforeId: string, afterId: string) {
        calls.push(`diff:${beforeId}:${afterId}`);
        return {
          added: [],
          removed: [],
          changed: [{ key: 'commission', before: rule(null), after: rule(125) }],
        };
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () => root.render(<RulePackManager api={api} />));

    expect(container.textContent).toContain('2026.9.0');
    expect(container.textContent).toContain('需要复核');
    await change(container.querySelector<HTMLTextAreaElement>('[aria-label="规则包 JSON"]')!, '{}');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="导入规则包"]')!.click(),
    );
    expect(container.textContent).toContain('2026.9.2');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="启用 2026.9.2"]')!.click(),
    );
    expect(container.textContent).toContain('当前启用');

    await change(
      container.querySelector<HTMLSelectElement>('[aria-label="对比基准版本"]')!,
      'pack-one',
    );
    await change(
      container.querySelector<HTMLSelectElement>('[aria-label="对比目标版本"]')!,
      'pack-two',
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="查看规则差异"]')!.click(),
    );
    expect(container.querySelector('[aria-label="规则差异"]')?.textContent).toContain('commission');
    expect(calls).toEqual([
      'list:pinduoduo:CN',
      'import:{}',
      'list:pinduoduo:CN',
      'activate:pack-three',
      'list:pinduoduo:CN',
      'diff:pack-one:pack-two',
    ]);
    root.unmount();
  });
});

async function change(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function record(id: string, version: string, active: boolean) {
  return {
    id,
    manifest: {
      schemaVersion: '1' as const,
      platformId: 'pinduoduo' as const,
      region: 'CN',
      version,
      publisher: 'Ecommerce AI Workbench',
      verifiedAt: '2026-09-01T00:00:00.000Z',
      minimumAppVersion: '0.1.0',
      checksum: 'a'.repeat(64),
      description: '测试规则包',
    },
    rules: [rule(null)],
    installedAt: '2026-09-01T00:00:00.000Z',
    activatedAt: active ? '2026-09-02T00:00:00.000Z' : null,
    active,
  };
}

function rule(rateBasisPoints: number | null) {
  return {
    key: 'commission',
    type: 'financial' as const,
    scope: { level: 'platform' as const },
    provenance: {
      url: 'https://example.invalid',
      title: '测试来源',
      type: 'documentation' as const,
    },
    verifiedAt: '2026-09-01T00:00:00.000Z',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    expiresAt: null,
    status: rateBasisPoints === null ? ('needs_review' as const) : ('verified' as const),
    summary: '佣金规则',
    implementationNote: '测试规则',
    config: { rateBasisPoints },
    impact: 'financial' as const,
  };
}
