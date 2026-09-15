// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConnectivityProvider,
  type ConnectivitySource,
  useConnectivity,
} from './connectivity-provider.js';

const containers: HTMLDivElement[] = [];
afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('ConnectivityProvider', () => {
  it('announces event updates, cleans up, and performs no work on reconnect', async () => {
    let online = false;
    let listener: () => void = () => undefined;
    const unsubscribe = vi.fn();
    const source: ConnectivitySource = {
      isOnline: () => online,
      subscribe(next) {
        listener = next;
        return unsubscribe;
      },
    };
    const sideEffect = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <ConnectivityProvider source={source}>
          <Probe sideEffect={sideEffect} />
        </ConnectivityProvider>,
      ),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain('离线');
    expect(container.textContent).toContain('本地数据与财务功能仍可使用');

    online = true;
    await act(async () => listener());
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(sideEffect).not.toHaveBeenCalled();
    root.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

function Probe({ sideEffect }: { readonly sideEffect: () => void }) {
  const { online } = useConnectivity();
  return <span data-online={online} data-side-effect={String(Boolean(sideEffect))} />;
}
