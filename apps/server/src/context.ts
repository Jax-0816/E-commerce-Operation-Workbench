import { APP_VERSION, type AppVersion } from '@eaw/shared';

export interface AppContextOptions {
  readonly webDistDir?: string;
}

export interface AppContext {
  readonly appVersion: AppVersion;
  readonly webDistDir?: string;
}

export function createAppContext(options: AppContextOptions): AppContext {
  return {
    appVersion: APP_VERSION,
    webDistDir: options.webDistDir,
  };
}
