import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defineConfig } from '@playwright/test';

const temporaryRoot = realpathSync(tmpdir());
const coordinationPath = resolve('.playwright-e2e-environment.json');
const runtimePaths =
  process.env.TEST_WORKER_INDEX === undefined
    ? createRuntimePaths()
    : (JSON.parse(readFileSync(coordinationPath, 'utf8')) as RuntimePaths);
const { callLogPath, restoreWorkspacePath, workspacePath } = runtimePaths;
process.env.EAW_E2E_CALL_LOG = callLogPath;
process.env.EAW_E2E_SOURCE_WORKSPACE_PATH = workspacePath;
process.env.EAW_E2E_RESTORE_WORKSPACE_PATH = restoreWorkspacePath;

interface RuntimePaths {
  readonly callLogPath: string;
  readonly restoreWorkspacePath: string;
  readonly workspacePath: string;
}

function createRuntimePaths(): RuntimePaths {
  const callLogDirectory = mkdtempSync(join(temporaryRoot, 'eaw-provider-log-'));
  const value = {
    callLogPath: join(callLogDirectory, 'fake-provider-calls.jsonl'),
    restoreWorkspacePath: mkdtempSync(join(temporaryRoot, '电商工作台 恢复验收-')),
    workspacePath: mkdtempSync(join(temporaryRoot, '电商工作台 黄金路径-')),
  };
  writeFileSync(coordinationPath, JSON.stringify(value), 'utf8');
  return value;
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @eaw/server dev:e2e',
      env: {
        ...process.env,
        EAW_E2E_CALL_LOG: callLogPath,
        EAW_E2E_RESTORE_WORKSPACE_PATH: restoreWorkspacePath,
        EAW_WORKSPACE_PATH: workspacePath,
      },
      reuseExistingServer: false,
      timeout: 240_000,
      url: 'http://127.0.0.1:3000/api/v1/health',
    },
    {
      command: 'pnpm --filter @eaw/web dev',
      env: { ...process.env, EAW_WORKSPACE_PATH: workspacePath },
      reuseExistingServer: false,
      timeout: 240_000,
      url: 'http://127.0.0.1:5173',
    },
  ],
});
