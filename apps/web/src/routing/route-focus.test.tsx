// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { RouteFocus, SkipLink } from './route-focus.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('route focus', () => {
  it('keeps the skip link first and moves focus only on pathname navigation', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/first?platform=pinduoduo']}>
          <Harness />
        </MemoryRouter>,
      ),
    );

    const focusables = container.querySelectorAll<HTMLElement>('a[href], button, [tabindex]');
    expect(focusables[0]?.textContent).toContain('跳到主要内容');
    expect(document.activeElement).toBe(document.body);

    const main = container.querySelector<HTMLElement>('#workspace-main')!;
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/second"]')!.click());
    expect(document.activeElement).toBe(main);

    main.blur();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="只更改查询"]')!.click(),
    );
    expect(document.activeElement).toBe(document.body);

    await act(async () => container.querySelector<HTMLAnchorElement>('.skip-link')!.click());
    expect(document.activeElement).toBe(main);
    root.unmount();
  });
});

function Harness(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <>
      <SkipLink targetId="workspace-main" />
      <Link to="/second">第二页</Link>
      <button
        aria-label="只更改查询"
        onClick={() => void navigate('?platform=taobao')}
        type="button"
      >
        查询
      </button>
      <main id="workspace-main" tabIndex={-1}>
        <RouteFocus targetId="workspace-main" />
        <Routes>
          <Route path="*" element={<h1>页面</h1>} />
        </Routes>
      </main>
    </>
  );
}
