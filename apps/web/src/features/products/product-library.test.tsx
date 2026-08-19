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
      root.render(<ProductLibrary api={{ create: async () => undefined, list: async () => [] }} />);
    });

    expect(container.textContent).toContain('还没有产品');
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('新建产品');
    await act(async () => button?.click());
    expect(container.querySelector('label')?.textContent).toContain('产品名称');
    expect(container.querySelector('input')?.getAttribute('required')).not.toBeNull();
    root.unmount();
  });
});
