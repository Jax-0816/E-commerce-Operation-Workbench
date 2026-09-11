// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { DataManagementApi } from './api.js';
import { DataManagementPanel } from './data-management-panel.js';

const containers: HTMLDivElement[] = [];
const backupId = '019cdd2a-b800-7000-8000-000000000301';

afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

describe('DataManagementPanel', () => {
  it('loads read-only state, then creates and explicitly confirms a ZIP restore', async () => {
    let createCalls = 0;
    let stageCalls = 0;
    let stagedFile: File | undefined;
    const records = [backup()];
    const api: DataManagementApi = {
      async listBackups() {
        return records;
      },
      async createBackup() {
        createCalls += 1;
        const created = { ...backup(), backupId: '019cdd2a-b800-7000-8000-000000000303' };
        records.unshift(created);
        return created;
      },
      async stageRestore(file) {
        stageCalls += 1;
        stagedFile = file;
        return pending();
      },
      async restoreStatus() {
        return { state: 'idle' };
      },
    };
    const { container, root } = await render(api);

    expect(createCalls).toBe(0);
    expect(stageCalls).toBe(0);
    expect(container.textContent).toContain('备份不包含 API 密钥');
    const link = container.querySelector<HTMLAnchorElement>(`a[href$="${backupId}/download"]`)!;
    expect(link.download).toBe(`${backupId}.eaw-backup.zip`);

    await click(container, '创建新备份');
    expect(createCalls).toBe(1);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('备份已创建');

    const input = container.querySelector<HTMLInputElement>('[aria-label="选择备份 ZIP"]')!;
    await choose(input, new File(['no'], 'notes.txt', { type: 'text/plain' }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('ZIP');
    expect(stageCalls).toBe(0);

    const archive = new File(['PK'], 'workspace.zip', { type: 'application/zip' });
    await choose(input, archive);
    expect(button(container, '确认安排恢复').disabled).toBe(true);
    await act(async () =>
      container.querySelector<HTMLInputElement>('[aria-label="确认下次启动恢复"]')!.click(),
    );
    await click(container, '确认安排恢复');
    expect(stageCalls).toBe(1);
    expect(stagedFile).toBe(archive);
    expect(input.value).toBe('');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('重启工作台后恢复');
    root.unmount();
  });

  it('ignores a late initial response after the API dependency changes', async () => {
    const late = deferred<readonly ReturnType<typeof backup>[]>();
    const first = api({ listBackups: () => late.promise });
    const second = api({
      listBackups: async () => [{ ...backup(), backupId: '019cdd2a-b800-7000-8000-000000000304' }],
    });
    const { container, root } = await render(first);

    await act(async () => root.render(<DataManagementPanel api={second} />));
    expect(container.textContent).toContain('000000000304');
    await act(async () => late.resolve([{ ...backup(), backupId }]));
    expect(container.textContent).toContain('000000000304');
    expect(container.textContent).not.toContain('000000000301');
    root.unmount();
  });
});

async function render(api: DataManagementApi): Promise<{
  container: HTMLDivElement;
  root: Root;
}> {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => root.render(<DataManagementPanel api={api} />));
  return { container, root };
}

function api(overrides: Partial<DataManagementApi>): DataManagementApi {
  return {
    listBackups: async () => [],
    createBackup: async () => backup(),
    stageRestore: async () => pending(),
    restoreStatus: async () => ({ state: 'idle' }),
    ...overrides,
  };
}

function backup() {
  return {
    appVersion: '0.1.0',
    backupId,
    createdAt: '2026-09-11T08:00:00.000Z',
    size: 2,
    downloadUrl: `/api/v1/data-management/backups/${backupId}/download`,
  };
}

function pending() {
  return {
    state: 'pending' as const,
    backupId,
    restoreId: '019cdd2a-b800-7000-8000-000000000302',
    stagedAt: '2026-09-11T08:01:00.000Z',
    restartRequired: true as const,
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const value = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
  expect(value).toBeDefined();
  return value!;
}

async function click(container: HTMLElement, label: string): Promise<void> {
  await act(async () => button(container, label).click());
}

async function choose(input: HTMLInputElement, file: File): Promise<void> {
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
