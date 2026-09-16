// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchErrorBoundary } from './workbench-error-boundary.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('WorkbenchErrorBoundary', () => {
  it('shows a safe Chinese fallback and reloads only after an explicit click', async () => {
    const reload = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    const originalError = console.error;
    console.error = vi.fn();
    try {
      await act(async () =>
        root.render(
          <WorkbenchErrorBoundary onReload={reload}>
            <Broken />
          </WorkbenchErrorBoundary>,
        ),
      );
    } finally {
      console.error = originalError;
    }

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('页面暂时无法显示');
    expect(container.textContent).not.toContain('SECRET_STACK_DETAIL');
    expect(reload).not.toHaveBeenCalled();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="重新加载工作台"]')!.click(),
    );
    expect(reload).toHaveBeenCalledOnce();
    root.unmount();
  });
});

function Broken(): React.JSX.Element {
  throw new Error('SECRET_STACK_DETAIL');
}
