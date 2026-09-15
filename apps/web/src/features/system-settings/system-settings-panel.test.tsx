// @vitest-environment jsdom

import type { SystemStatusResponse } from '@eaw/contracts/system-status';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { SystemSettingsPanel } from './system-settings-panel.js';

const containers: HTMLDivElement[] = [];
const status: SystemStatusResponse = {
  appVersion: '0.1.0',
  localOnly: true,
  bindAddress: '127.0.0.1',
  ai: { provider: 'deepseek', model: 'deepseek-chat', configured: false },
  prompts: { installedCount: 7, activeCount: 7 },
  rules: { installedCount: 1, activePinduoduoCnVersion: null, unresolvedActiveRuleCount: 0 },
};

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('SystemSettingsPanel', () => {
  it('renders only safe status and specialist-page links', async () => {
    const { container, root } = await render({ get: async () => status });
    expect(container.textContent).toContain('版本 0.1.0');
    expect(container.textContent).toContain('仅限本机');
    expect(container.textContent).toContain('127.0.0.1');
    expect(container.textContent).toContain('7 / 7');
    expect(container.textContent).toContain('DeepSeek 未配置');
    expect(container.textContent).not.toContain('/Users/');
    expect([...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      '/capabilities/ai',
      '/capabilities/rules',
      '/capabilities/data',
    ]);
    root.unmount();
  });

  it('shows safe loading and failure states', async () => {
    const { container, root } = await render({
      get: async () => Promise.reject(new Error('/secret')),
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('无法加载系统状态');
    expect(container.textContent).not.toContain('/secret');
    root.unmount();
  });
});

async function render(api: { get(): Promise<SystemStatusResponse> }) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SystemSettingsPanel api={api} />
      </MemoryRouter>,
    );
    await Promise.resolve();
  });
  return { container, root };
}
