import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

const workspacePath = mkdtempSync(join(realpathSync(tmpdir()), 'eaw-phase2-e2e-'));
const restoreWorkspacePath = mkdtempSync(
  join(realpathSync(tmpdir()), 'eaw phase12 restore 中文 空格-'),
);
const callLogPath = join(realpathSync(tmpdir()), 'eaw-phase10-fake-provider-calls.jsonl');
process.env.EAW_E2E_CALL_LOG = callLogPath;
process.env.EAW_E2E_SOURCE_WORKSPACE_PATH = workspacePath;
process.env.EAW_E2E_RESTORE_WORKSPACE_PATH = restoreWorkspacePath;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
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
