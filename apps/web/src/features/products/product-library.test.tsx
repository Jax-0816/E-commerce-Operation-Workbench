// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { ProductLibrary } from './product-library.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('ProductLibrary', () => {
  it('shows a truthful empty state and opens an accessible new-product form', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProductLibrary
          api={{
            archive: async () => undefined,
            create: async () => undefined,
            list: async () => [],
          }}
        />,
      );
    });

    expect(container.textContent).toContain('还没有产品');
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('新建产品');
    await act(async () => button?.click());
    expect(container.querySelector('label')?.textContent).toContain('产品名称');
    expect(container.querySelector('input')?.getAttribute('required')).not.toBeNull();
    root.unmount();
  });

  it('archives an active product and removes it from the active list', async () => {
    const archivedIds: string[] = [];
    const { container, root } = await renderLibrary({
      archive: async (id) => {
        archivedIds.push(id);
      },
    });

    const archive = container.querySelector<HTMLButtonElement>('[aria-label="归档 保温杯"]');
    await act(async () => archive?.click());

    expect(archivedIds).toEqual(['0198f0a0-0000-7000-8000-000000000001']);
    expect(container.textContent).toContain('还没有产品');
    expect(container.textContent).not.toContain('无法归档');
    root.unmount();
  });

  it('retains the product and shows an error when archive fails', async () => {
    const { container, root } = await renderLibrary({
      archive: async () => {
        throw new Error('offline');
      },
    });

    const archive = container.querySelector<HTMLButtonElement>('[aria-label="归档 保温杯"]');
    await act(async () => archive?.click());

    expect(container.textContent).toContain('保温杯');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('无法归档产品');
    root.unmount();
  });
});

async function renderLibrary(overrides: {
  archive(id: string): Promise<void>;
}): Promise<{ container: HTMLDivElement; root: ReturnType<typeof createRoot> }> {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ProductLibrary
        api={{
          ...overrides,
          create: async () => undefined,
          list: async () => [
            {
              id: '0198f0a0-0000-7000-8000-000000000001',
              name: '保温杯',
              createdAt: '2026-08-19T08:00:00.000Z',
              updatedAt: '2026-08-19T08:00:00.000Z',
            },
          ],
        }}
      />,
    );
  });
  return { container, root };
}
