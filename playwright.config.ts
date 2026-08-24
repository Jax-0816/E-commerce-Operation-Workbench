import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

const workspacePath = mkdtempSync(join(realpathSync(tmpdir()), 'eaw-phase2-e2e-'));

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @eaw/server dev',
      env: { ...process.env, EAW_WORKSPACE_PATH: workspacePath },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:3000/api/v1/health',
    },
    {
      command: 'pnpm --filter @eaw/web dev',
      env: { ...process.env, EAW_WORKSPACE_PATH: workspacePath },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:5173',
    },
  ],
});
