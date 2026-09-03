// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { AISettingsPanel } from './ai-settings-panel.js';

const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('AISettingsPanel', () => {
  it('configures, tests and clears DeepSeek without rendering the saved key', async () => {
    let configured = false;
    let savedKey = '';
    const api = {
      async get() {
        return status(configured);
      },
      async configure(apiKey: string) {
        savedKey = apiKey;
        configured = true;
        return status(true);
      },
      async clear() {
        configured = false;
        return status(false);
      },
      async testConnection() {
        return { ok: true };
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    await act(async () => root.render(<AISettingsPanel api={api} />));

    expect(container.textContent).toContain('未配置');
    const input = container.querySelector<HTMLInputElement>('[aria-label="DeepSeek API Key"]')!;
    await change(input, 'sk-ui-secret');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="保存 DeepSeek 设置"]')!.click(),
    );
    expect(container.textContent).toContain('已配置');
    expect(savedKey).toBe('sk-ui-secret');
    expect(container.textContent).not.toContain('sk-ui-secret');
    expect(input.value).toBe('');

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="测试 DeepSeek 连接"]')!.click(),
    );
    expect(container.textContent).toContain('连接正常');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="清除 DeepSeek 密钥"]')!.click(),
    );
    expect(container.textContent).toContain('未配置');
    root.unmount();
  });
});

async function change(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function status(configured: boolean) {
  return { provider: 'deepseek' as const, configured, model: 'deepseek-chat' as const };
}
