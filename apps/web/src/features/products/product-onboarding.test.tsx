// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { ProductDashboard } from './dashboard.js';
import { ProductOnboarding } from './product-onboarding.js';

const containers: HTMLDivElement[] = [];
const product = {
  id: '0198f0a0-0000-7000-8000-000000000001',
  name: '保温杯',
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('Phase 2 product entry', () => {
  it('shows product count and recent products on the dashboard', async () => {
    const { container, root } = await render(
      <ProductDashboard productsApi={api()} onOpen={() => undefined} />,
    );
    expect(container.textContent).toContain('商品数量');
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('保温杯');
    root.unmount();
  });

  it('creates a product through the four-step manual wizard', async () => {
    const names: string[] = [];
    const opened: string[] = [];
    const { container, root } = await render(
      <ProductOnboarding
        productsApi={api(async ({ name }) => {
          names.push(name);
          return { ...product, name };
        })}
        onCreated={(created) => opened.push(created.id)}
      />,
    );

    expect(container.textContent).toContain('步骤 1 / 4');
    await click(container, '手工创建');
    expect(container.textContent).toContain('步骤 2 / 4');
    await input(container, '商品名称', '304 不锈钢保温杯');
    await click(container, '下一步');
    expect(container.textContent).toContain('步骤 3 / 4');
    expect(container.textContent).toContain('AI 辅助整理将在 Phase 6 开放');
    await click(container, '下一步');
    expect(container.textContent).toContain('步骤 4 / 4');
    await click(container, '创建商品并进入工作区');

    expect(names).toEqual(['304 不锈钢保温杯']);
    expect(opened).toEqual([product.id]);
    root.unmount();
  });
});

function api(
  create: (input: { name: string }) => Promise<typeof product | undefined> = async () => product,
) {
  return {
    archive: async () => undefined,
    create,
    list: async () => [product],
  };
}

async function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

async function click(container: HTMLElement, label: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

async function input(container: HTMLElement, label: string, value: string): Promise<void> {
  const field = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
